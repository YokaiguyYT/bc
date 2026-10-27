import './ui/styles.css';
import { initRapier } from './physics/rapier';
import { Game } from './game/Game';
import { models } from './render/models';
import { App } from './ui/App';
import { tuning } from './config/tuning';
import { PeerLink } from './net/peer';

async function boot() {
  const loading = document.getElementById('loading');
  const status = document.getElementById('loading-status');
  const setStatus = (s: string) => {
    if (status) status.textContent = s;
  };
  try {
    setStatus('Warming up the physics…');
    await initRapier();
    setStatus('Unpacking the truck…');
    await models.preload((d, t) => setStatus(`Unpacking the truck… ${d}/${t}`));
    await document.fonts?.ready;
    const game = new Game(document.getElementById('game')!);
    const params = new URLSearchParams(location.search);
    const app = new App(game, document.getElementById('ui')!);
    (window as unknown as { __FF: unknown }).__FF = { game, app, models, tuning, net: { PeerLink } };
    if (params.has('manual')) game.manual = true;
    game.start();
    const lvl = params.get('level');
    if (params.has('gallery')) (await import('./dev/gallery')).showGallery(game);
    else if (lvl) app.playLevel(lvl);
    else app.showTitle();
    loading?.classList.add('done');
    setTimeout(() => loading?.remove(), 600);
  } catch (e) {
    console.error(e);
    setStatus('Something broke while loading: ' + (e instanceof Error ? e.message : String(e)));
    loading?.classList.add('error');
  }
}

boot();
