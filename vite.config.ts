/// <reference types="vitest/config" />
import { defineConfig, type PluginOption } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// PHONE=1 enables a self-signed-HTTPS LAN server: DeviceMotion needs a
// secure context, and iOS additionally gates it behind requestPermission().
async function phonePlugins(): Promise<PluginOption[]> {
  if (!process.env.PHONE) return []
  const { default: basicSsl } = await import('@vitejs/plugin-basic-ssl')
  return [basicSsl()]
}

export default defineConfig(async () => ({
  plugins: [svelte(), ...(await phonePlugins())],
  define: {
    __BUILD_STAMP__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
  },
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
}))
