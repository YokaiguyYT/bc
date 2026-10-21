import * as THREE from 'three';

/**
 * Free the GPU copies of everything under `root`: geometries, materials and
 * their textures, instance buffers, skeletons and shadow maps. Resources that
 * other objects still share (model parts, cached materials) are simply
 * uploaded again the next time they're drawn, so this is safe to call on a
 * whole level when it ends.
 */
export function disposeTree(root: THREE.Object3D) {
  const seen = new Set<object>();
  const free = (r: { dispose(): void } | null | undefined) => {
    if (!r || seen.has(r)) return;
    seen.add(r);
    r.dispose();
  };
  const freeTextures = (values: Iterable<unknown>) => {
    for (const v of values) {
      if ((v as THREE.Texture)?.isTexture) free(v as THREE.Texture);
      else if ((v as THREE.IUniform)?.value?.isTexture) free((v as THREE.IUniform).value);
    }
  };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) free(m.geometry);
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) {
      freeTextures(Object.values(mat));
      const uniforms = (mat as THREE.ShaderMaterial).uniforms;
      if (uniforms) freeTextures(Object.values(uniforms));
      free(mat);
    }
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton?.dispose();
    if ((o as THREE.Light).isLight) (o as THREE.Light).dispose();
  });
}
