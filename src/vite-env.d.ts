/// <reference types="vite/client" />

declare module 'virtual:ff-models' {
  /** In single-file builds: manifest + base64 GLBs baked into the bundle. Otherwise null. */
  const embedded: { manifest: unknown; files: Record<string, string> } | null;
  export default embedded;
}

declare const __BUILD_TIME__: string;
declare const __SINGLE_FILE__: boolean;
