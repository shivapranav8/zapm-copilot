import { defineConfig } from 'tsup';
import { resolve } from 'path';

export default defineConfig({
  entry: ['server/index.ts'],
  outDir: 'dist/server',
  format: ['cjs'],
  platform: 'node',
  splitting: false,
  sourcemap: false,
  clean: false,
  // Bundle ALL deps so Catalyst needs zero node_modules at runtime.
  // fluent-ffmpeg and @ffmpeg-installer are pure JS wrappers — safe to bundle.
  // The ffmpeg binary path will be wrong on Catalyst Linux (bundled from macOS dev),
  // so video processing will fail gracefully, but the server starts fine.
  noExternal: [
    'express',
    'cors',
    'cookie-session',
    'dotenv',
    'multer',
    'mammoth',
    'adm-zip',
    'exceljs',
    'encoding',
    'xlsx',
    'fluent-ffmpeg',
    'lodash',
    '@anthropic-ai/sdk',
    '@langchain/core',
    '@langchain/openai',
    '@langchain/community',
    'openai',
    'zod',
  ],
  esbuildOptions(options) {
    // Prefer CJS entry points to avoid ESM "no default export" errors
    options.mainFields = ['main', 'module'];
    options.conditions = ['require', 'node', 'default'];
    // Force xlsx to use its CJS file (xlsx.js) not the ESM (xlsx.mjs)
    options.alias = {
      xlsx: resolve('node_modules/xlsx/xlsx.js'),
    };
  },
});
