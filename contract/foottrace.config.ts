import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['contract/foottrace.test.ts'],
    retry: 0,
  },
});
