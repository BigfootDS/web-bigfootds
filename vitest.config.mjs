import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react'
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'https://bigfootds.test/'
      }
    },
    include: ['test/**/*.component.test.jsx'],
    setupFiles: ['vitest.setup.mjs']
  }
});
