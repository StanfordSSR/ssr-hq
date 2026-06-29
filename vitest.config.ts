import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '');

export default defineConfig({
  resolve: {
    alias: {
      '@': rootDir
    }
  },
  test: {
    environment: 'node',
    include: ['lib/__tests__/**/*.test.ts'],
    // The lib modules import `@/lib/env`, which throws if these are missing.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      // 32-byte base64 key so lib/card-crypto can encrypt/decrypt in tests.
      CARD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64')
    }
  }
});
