import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const values = new Map();

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value))
  }
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});
