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
};

const current = entries[entry]!;

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../shared/src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: entry === 'content', // Only clear on first build
    rollupOptions: {
      input: current.input,
      output: {
        entryFileNames: `${entry}.js`,
        format: current.format,
        name: current.name,
        inlineDynamicImports: true,
      },
    },
    cssCodeSplit: false,
    sourcemap: process.env.NODE_ENV === 'development' ? 'inline' : false,
    // One bundle serves both browsers; downlevel to satisfy the older of the two.
    target: ['chrome110', 'firefox121'],
    minify: process.env.NODE_ENV === 'development' ? false : 'esbuild',
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
});
