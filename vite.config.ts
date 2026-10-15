import { defineConfig, loadEnv } from 'vite'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'

// Stamped into the bundle so the service worker's script URL and cache name
// change on every deploy — without this a kiosk keeps serving the shell it
// cached weeks ago. See public/sw.js and src/main.tsx.
const BUILD_ID = new Date().toISOString().replace(/\D/g, '').slice(0, 14)

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  if (command === 'build') {
    const api = new URL(env.VITE_API_URL ?? '')
    if (!['http:', 'https:'].includes(api.protocol) ||
      ['localhost', '[::1]'].includes(api.hostname) || /^127\./.test(api.hostname)) {
      throw new Error('VITE_API_URL must be the mini PC LAN HTTP(S) address')
    }
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(env.VITE_STORE_ID?.trim() ?? '')) {
      throw new Error('VITE_STORE_ID must be a real store UUID')
    }
  }
  let outputDirectory = ''
  return {
    plugins: [react(), {
      name: 'qms-build-version',
      configResolved(config) { outputDirectory = resolve(config.root, config.build.outDir) },
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildId: BUILD_ID }) })
      },
      closeBundle() {
        if (command !== 'build') return
        const worker = resolve(outputDirectory, 'sw.js')
        writeFileSync(worker, readFileSync(worker, 'utf8').replaceAll('__QMS_BUILD_ID__', BUILD_ID))
      },
    }],
    define: {
      __BUILD_ID__: JSON.stringify(BUILD_ID),
    },
  }
})
