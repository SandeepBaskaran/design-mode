import { defineConfig } from 'vite';
import { resolve } from 'path';

// Browser extension (Chrome + Firefox) multi-entry build config
// Content scripts must be IIFE (not ES modules) since manifest content_scripts
// loads them as classic scripts. We build each entry separately via the build script.

const entry = process.env.ENTRY || 'content';

const entries: Record<string, { input: string; format: 'iife' | 'es'; name?: string }> = {
  content: {
    input: resolve(__dirname, 'src/content/index.ts'),
    format: 'iife',
    name: 'DesignMode',
  },
  background: {
    input: resolve(__dirname, 'src/background/index.ts'),
    format: 'iife',
    name: 'DesignModeBackground',
  },
  sidepanel: {
    input: resolve(__dirname, 'src/sidepanel/sidepanel.ts'),
    format: 'iife',
    name: 'DesignModeSidePanel',
  },
  devtools: {
    input: resolve(__dirname, 'src/inspector/devtools.ts'),
    format: 'iife',
    name: 'DesignModeInspector',
  },
};

const current = entries[entry]!;

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../shared/src'),
    },
  },
  build: {
    outDir: process.env.DM_BROWSER === 'safari' ? 'dist-safari' : 'dist',
    emptyOutDir: entry === 'content', // Only clear on first build
    rollupOptions: {
      input: current.input,
      output: {
        entryFileNames: `${entry}.js`,
        format: current.format,
        name: current.name,
        inlineDynamicImports: true,
        // Guard before imported modules register listeners; invalidated runtimes may be replaced.
        intro: entry === 'content' ? `
          try { if (globalThis.__dmContentRuntime?.()) return; } catch {}
        ` : undefined,
        outro: entry === 'content' ? `
          const dmContentRuntime = (globalThis.browser || globalThis.chrome).runtime;
          globalThis.__dmContentRuntime = () => Boolean(dmContentRuntime.id);
        ` : undefined,
      },
    },
    cssCodeSplit: false,
    sourcemap: process.env.NODE_ENV === 'development' ? 'inline' : false,
    // One bundle serves both browsers; downlevel to satisfy the older of the two.
    target: ['chrome110', 'firefox121', 'safari18.4'],
    minify: process.env.NODE_ENV === 'development' ? false : 'esbuild',
  },
  define: {
    __DM_SAFARI__: JSON.stringify(process.env.DM_BROWSER === 'safari'),
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    __DM_ANALYTICS__: JSON.stringify({ host: process.env.DM_POSTHOG_HOST || '', key: process.env.DM_POSTHOG_KEY || '', distribution: process.env.DM_DISTRIBUTION || 'unknown' }),
  },
});
