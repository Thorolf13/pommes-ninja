import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());

  return {
    base: 'pommes-ninja',
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./', import.meta.url))
      }
    },
    publicDir: 'public',
  };
})