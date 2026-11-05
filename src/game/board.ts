import { loadJSON, saveJSON } from '../util/storage';
import { MqttClient } from '../net/mqtt';

/**
 * Speedrun leaderboards: the fastest deliveries of every hand-made job (and
 * of each day's Daily), for two-player crews and for solo players (with the
 * robot buddy) separately.
 *
 * - This laptop: the five best runs on each board, kept in local storage.
 * - The world: each player's best run is a retained message on two free public
 *   MQTT brokers (no accounts, nothing to pay). Anyone who opens a board gets
 *   every retained run on it. It's an honour system: the times are checked to
 *   be sensible, names are filtered, and a player only ever overwrites their
 *   own entry. Public brokers can be wiped now and then; your own best is
 *   posted again whenever you next beat or match it.
 *
 * Only a nickname you choose is shared (never set by default), with the time,
 * the load's condition, the date and your mover's colour.
 */

export type CrewMode = 'duo' | 'solo';

export interface BoardEntry {
  /** Who (random id, kept on this laptop). */
  id: string;
  name: string;
  /** Delivery time (s). */
  time: number;
  /** The load's condition (0..1). */
  health: number;
  /** YYYY-MM-DD. */
  date: string;
  /** Mover colour (hex), for show. */
  color?: string;
}

const ROOT = 'fragile-freight/board1';
const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
const LOCAL = 'ff.times.v1';
const NAME = 'ff.boardName';
const PID = 'ff.pid';
/** Nothing real delivers faster than this (s). */
const MIN_TIME = 12;

/** The board for a job: a hand-made job's id, or `daily-<n>`; duo or solo. */
export function boardKey(job: string, mode: CrewMode) {
  return `${job}~${mode}`;
}

/** Which public brokers hold the world board (?board=ws://… for tests, ?board=0 for none). */
export function boardUrls(): string[] {
  const q = new URLSearchParams(location.search).get('board');
  if (q === '0') return [];
  if (q && /^wss?:\/\//.test(q)) return [q];
  return BROKERS;
}

/** This laptop's anonymous player id (random; it only links your own runs together). */
export function playerId() {
  let id = loadJSON<string>(PID);
  if (!id || !/^[a-z0-9]{10,16}$/.test(id)) {
    id = Array.from({ length: 12 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
    saveJSON(PID, id);
  }
  return id;
}

// a short list, checked with the letters squashed together (and look-alike digits read as letters)
const BAD = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'nigg', 'fag', 'slut', 'whore', 'rape', 'nazi', 'hitler', 'penis', 'vagina', 'porn', 'sex', 'kys', 'retard', 'twat', 'wank', 'bastard', 'asshole'];

/** A nickname fit for the board, or null: 2–14 letters, digits, spaces, - _ . and nothing rude. */
export function cleanName(raw: string): string | null {
  const n = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (n.length < 2 || n.length > 14) return null;
  if (!/^[A-Za-z0-9 _.-]+$/.test(n)) return null;
  // no phone numbers or the like
  if (/[0-9]{6,}/.test(n.replace(/[ _.-]/g, ''))) return null;
  const squashed = n
    .toLowerCase()
    .replace(/[ _.-]/g, '')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/\$/g, 's');
  if (BAD.some((w) => squashed.includes(w))) return null;
  return n;
}

export function boardName(): string | null {
  const n = loadJSON<string>(NAME);
  return n ? cleanName(n) : null;
}

export function setBoardName(n: string | null) {
  saveJSON(NAME, n ? cleanName(n) : null);
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A run checked to be sensible (anything else on the world board is ignored). */
function valid(e: Partial<BoardEntry>): e is BoardEntry {
  return (
    typeof e.id === 'string' &&
    /^[a-z0-9]{6,16}$/.test(e.id) &&
    typeof e.name === 'string' &&
    cleanName(e.name) !== null &&
    typeof e.time === 'number' &&
    e.time >= MIN_TIME &&
    e.time < 3600 &&
    typeof e.health === 'number' &&
    e.health > 0 &&
    e.health <= 1
  );
}

const byTime = (a: BoardEntry, b: BoardEntry) => a.time - b.time || b.health - a.health;

// ---------------------------------------------------------------- this laptop

/** The best runs on this laptop for a board (fastest first). */
export function localBoard(board: string): BoardEntry[] {
  return (loadJSON<Record<string, BoardEntry[]>>(LOCAL)?.[board] ?? []).filter(valid).sort(byTime);
}

/**
 * Note a delivery on this laptop's board. Returns where it came (1 = best on
 * this laptop) and whether it's this player's own best on the board.
 */
export function recordRun(board: string, run: { time: number; health: number; color?: string }) {
  const all = loadJSON<Record<string, BoardEntry[]>>(LOCAL) ?? {};
  const list = (all[board] ?? []).filter(valid);
  const id = playerId();
  const mine = list.filter((e) => e.id === id);
  const personalBest = !mine.length || run.time < Math.min(...mine.map((e) => e.time));
  const e: BoardEntry = { id, name: boardName() ?? 'You', time: Math.round(run.time * 100) / 100, health: Math.round(run.health * 100) / 100, date: today(), color: run.color };
  if (!valid(e)) return { place: 0, personalBest: false, entry: e };
  list.push(e);
  list.sort(byTime);
  all[board] = list.slice(0, 5);
  saveJSON(LOCAL, all);
  const place = all[board].indexOf(e) + 1;
  return { place, personalBest, entry: e };
}

// ---------------------------------------------------------------- the world

const clients = new Map<string, MqttClient>();

async function client(url: string) {
  const c = clients.get(url);
  if (c?.open) return c;
  const n = new MqttClient(url);
  clients.set(url, n);
  n.onClose = () => clients.delete(url);
  try {
    await n.connect(6000);
    return n;
  } catch {
    clients.delete(url);
    return null;
  }
}

/** Every run on a world board (fastest first); ok is false if no broker answered. */
export async function worldBoard(board: string, wait = 1200): Promise<{ ok: boolean; entries: BoardEntry[] }> {
  const urls = boardUrls();
  const best = new Map<string, BoardEntry>();
  const prefix = `${ROOT}/${board}/`;
  let ok = false;
  await Promise.all(
    urls.map(async (url) => {
      const c = await client(url);
      if (!c) return;
      ok = true;
      const off = c.on((topic, text) => {
        if (!topic.startsWith(prefix)) return;
        try {
          const m = JSON.parse(text) as { n?: string; t?: number; h?: number; d?: string; c?: string };
          const e = { id: topic.slice(prefix.length), name: cleanName(m.n ?? '') ?? '', time: Number(m.t), health: Number(m.h), date: String(m.d ?? '').slice(0, 10), color: typeof m.c === 'string' && /^#[0-9a-f]{6}$/i.test(m.c) ? m.c : undefined };
          if (!valid(e)) return;
          const had = best.get(e.id);
          if (!had || e.time < had.time) best.set(e.id, e);
        } catch {
          /* not a run */
        }
      });
      await c.subscribe(`${prefix}+`);
      await new Promise((r) => setTimeout(r, wait));
      c.unsubscribe(`${prefix}+`);
      off();
    }),
  );
  return { ok, entries: [...best.values()].sort(byTime) };
}

/** Post this player's run to a world board (it replaces their earlier one there). */
export async function postRun(board: string, e: BoardEntry) {
  const name = boardName();
  if (!name || !valid({ ...e, name })) return false;
  const text = JSON.stringify({ n: name, t: e.time, h: e.health, d: e.date, c: e.color, v: 1 });
  let sent = false;
  await Promise.all(
    boardUrls().map(async (url) => {
      const c = await client(url);
      if (!c) return;
      c.publish(`${ROOT}/${board}/${playerId()}`, text, true);
      sent = true;
    }),
  );
  return sent;
}

/** "1:23.4" */
export function formatRunTime(t: number) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
