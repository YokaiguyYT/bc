/**
 * Saving the instant replay as a video, with the game's sound, to send to
 * somebody: the picture is copied to a plain 2D canvas right after each frame
 * is drawn (some browsers record a 3D canvas as black; the online video mode
 * learned that), recorded with MediaRecorder, and handed over as a file:
 * downloaded on a laptop, or into the share sheet on a phone.
 */

/** Video formats, best first: MP4 plays everywhere (iPhones can't play WebM), WebM is what Chrome records best. */
const TYPES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

function pickType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return null;
  for (const t of TYPES) if (MediaRecorder.isTypeSupported(t)) return t;
  return null;
}

/** Can this browser record a clip? */
export function clipSupported() {
  const c = document.createElement('canvas') as HTMLCanvasElement & { captureStream?: unknown };
  return typeof c.captureStream === 'function' && !!pickType();
}

/** The longest side of the video (px): plenty to watch on a phone, and the file stays small. */
const MAX = 1280;

export class ClipRecorder {
  private copy: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private rec: MediaRecorder;
  private chunks: Blob[] = [];
  private stream: MediaStream;
  readonly type: string;

  constructor(
    private src: HTMLCanvasElement,
    audio: MediaStream | null,
  ) {
    this.copy = document.createElement('canvas');
    this.ctx = this.copy.getContext('2d')!;
    this.size();
    this.frame();
    const video = (this.copy as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(30);
    this.stream = new MediaStream([...video.getVideoTracks(), ...(audio?.getAudioTracks() ?? [])]);
    this.type = pickType() ?? '';
    this.rec = new MediaRecorder(this.stream, { mimeType: this.type, videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000 });
    this.rec.ondataavailable = (e) => {
      if (e.data && e.data.size) this.chunks.push(e.data);
    };
    this.rec.start(250);
  }

  private size() {
    const k = Math.min(1, MAX / Math.max(1, this.src.width, this.src.height));
    const w = Math.max(2, Math.round((this.src.width * k) / 2) * 2);
    const h = Math.max(2, Math.round((this.src.height * k) / 2) * 2);
    if (this.copy.width !== w || this.copy.height !== h) {
      this.copy.width = w;
      this.copy.height = h;
    }
  }

  /** Right after each frame is drawn: copy it. */
  frame() {
    this.size();
    try {
      this.ctx.drawImage(this.src, 0, 0, this.copy.width, this.copy.height);
    } catch {
      /* a frame missed: the next one will do */
    }
  }

  /** Finish: the video, or null if nothing came of it. */
  stop(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const done = () => {
        this.stream.getVideoTracks().forEach((t) => t.stop());
        const blob = this.chunks.length ? new Blob(this.chunks, { type: this.type.split(';')[0] }) : null;
        resolve(blob && blob.size > 1000 ? blob : null);
      };
      if (this.rec.state === 'inactive') return done();
      this.rec.onstop = done;
      try {
        this.rec.requestData();
      } catch {
        /* (not while inactive) */
      }
      this.rec.stop();
    });
  }

  /** Throw it away. */
  cancel() {
    this.rec.onstop = null;
    try {
      if (this.rec.state !== 'inactive') this.rec.stop();
    } catch {
      /* already stopped */
    }
    this.stream.getVideoTracks().forEach((t) => t.stop());
    this.chunks = [];
  }
}

/** The file's name: the game, the job, and the time (so a few don't overwrite each other). */
export function clipName(job: string, type: string) {
  const slug = job
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `fragile-freight-${slug || 'clip'}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
}

/** Can this device send a file through its share sheet (phones)? */
export function canShareFile(blob: Blob, name: string) {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try {
    return nav.canShare({ files: [new File([blob], name, { type: blob.type })] });
  } catch {
    return false;
  }
}

/** Hand the video over (from a button press: a share sheet needs one). */
export async function handOver(blob: Blob, name: string, share: boolean): Promise<'shared' | 'saved' | 'cancelled'> {
  if (share) {
    try {
      await navigator.share({ files: [new File([blob], name, { type: blob.type })], title: 'Fragile Freight' });
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled';
      // (no sharing after all: fall back to saving it)
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  return 'saved';
}
