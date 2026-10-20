import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * `virtual:ff-models` — in the single-file build, bakes public/models/*.glb into
 * the bundle as base64 so FragileFreight.html works by double-clicking it
 * (Safari won't fetch local files from file://). In normal builds it's null and
 * models load from models/ next to index.html.
 */
function embedModels(single: boolean): Plugin {
  const id = 'virtual:ff-models';
  const resolved = '\0' + id;
  return {
    name: 'ff-embed-models',
    resolveId(source) {
      return source === id ? resolved : null;
    },
    load(source) {
      if (source !== resolved) return null;
      if (!single) return 'export default null;';
      const dir = resolve(import.meta.dirname, 'public/models');
      const manifestPath = resolve(dir, 'manifest.json');
      if (!existsSync(manifestPath)) return 'export default null;';
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const files: Record<string, string> = {};
      for (const entry of Object.values(manifest.models ?? {}) as { file: string }[]) {
        const p = resolve(dir, entry.file);
        if (existsSync(p)) files[entry.file] = readFileSync(p).toString('base64');
      }
      return `export default ${JSON.stringify({ manifest, files })};`;
    },
  };
}

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    define: {
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
      __SINGLE_FILE__: JSON.stringify(single),
    },
    build: {
      target: ['es2020', 'safari15'],
      outDir: single ? 'dist-single' : 'dist',
      chunkSizeWarningLimit: 12000,
      assetsInlineLimit: single ? 100_000_000 : 4096,
      copyPublicDir: !single,
      emptyOutDir: true,
    },
    server: { host: true, port: 5173 },
    preview: { port: 4173 },
    plugins: [embedModels(single), ...(single ? [viteSingleFile({ removeViteModuleLoader: true })] : [])],
  };
});
