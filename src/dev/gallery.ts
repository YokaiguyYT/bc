import * as THREE from 'three';
import type { Game } from '../game/Game';
import { models } from '../render/models';

/**
 * Dev view (?gallery): renders every model on its own from a 3/4 front view
 * (front = +Z, shown by a red arrow) into a contact sheet, so orientation,
 * scale and restyling can be checked at a glance.
 */
export function showGallery(game: Game) {
  const r = game.renderer;
  const sheet = document.createElement('div');
  sheet.style.cssText =
    'position:absolute;top:0;left:0;right:0;background:#efe9de;display:grid;grid-template-columns:repeat(8,1fr);gap:6px;padding:8px;z-index:200;font:12px system-ui';
  document.body.appendChild(sheet);
  document.documentElement.style.overflow = 'auto';
  document.body.style.overflow = 'auto';
  document.body.style.height = 'auto';
  const stage = new THREE.Group();
  r.scene.add(stage);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xd9d0c0 });
  const W = 300;
  const H = 260;
  const prevSize = new THREE.Vector2();
  r.renderer.getSize(prevSize);
  r.renderer.setSize(W, H, false);
  r.camera.aspect = W / H;
  r.camera.updateProjectionMatrix();
  for (const name of models.names()) {
    stage.clear();
    const entry = models.manifest.models[name];
    const inst = models.instance(name, entry.size);
    const [sx, sy, sz] = inst.size;
    inst.object.position.set(0, sy / 2, 0);
    stage.add(inst.object);
    const span = Math.max(sx, sy, sz);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(span * 1.6, 0.02, span * 1.6), floorMat);
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    stage.add(floor);
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.02, sz / 2 + span * 0.05), span * 0.35, 0xff2244, span * 0.12, span * 0.08);
    stage.add(arrow);
    if (inst.clips.length && inst.root) {
      const mixer = new THREE.AnimationMixer(inst.root);
      mixer.clipAction(inst.clips[0]).play();
      mixer.update(0.4);
    }
    const d = span * 2.3 + 0.5;
    r.camera.position.set(d * 0.22, sy * 0.6 + d * 0.32, d * 0.95);
    r.camera.lookAt(0, sy * 0.45, 0);
    r.setShadowFocus(new THREE.Vector3(0, 0, 0), Math.max(4, span * 1.5));
    r.render();
    const url = r.renderer.domElement.toDataURL('image/png');
    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:6px;padding:3px';
    card.innerHTML = `<img src="${url}" style="width:100%;display:block"><b>${name}</b><br>${inst.size.map((v) => v.toFixed(2)).join('×')}${inst.clips.length ? ' · anim: ' + inst.clips.map((c) => c.name).join(', ') : ''}`;
    sheet.appendChild(card);
  }
  stage.clear();
  r.renderer.setSize(prevSize.x, prevSize.y, false);
  r.resize();
  (window as unknown as { __galleryDone: boolean }).__galleryDone = true;
}
