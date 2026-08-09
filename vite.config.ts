import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Stamped into the bundle so the service worker's script URL and cache name
// change on every deploy — without this a kiosk keeps serving the shell it
// cached weeks ago. See public/sw.js and src/main.tsx.
const BUILD_ID = new Date().toISOString().replace(/\D/g, '').slice(0, 14)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
})
