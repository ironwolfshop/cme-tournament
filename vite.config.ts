import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { obsSyncPlugin } from './vite-plugin-obs-sync.js'

// :5173 stays HTTP so OBS Browser Sources work (OBS blanks on self-signed HTTPS).
// Phone cams use the plugin's separate HTTPS server on :5174.
export default defineConfig({
  plugins: [react(), tailwindcss(), obsSyncPlugin()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Keep the watcher light on Windows — heavy folders + locked media freeze Vite.
    watch: {
      ignored: [
        '**/public/underwater-bg.jpg',
        '**/_design_extract/**',
        '**/_recovered_from_transcript/**',
        '**/dist/**',
        '**/node_modules/.cache/**',
        '**/.git/**',
      ],
    },
    hmr: {
      overlay: true,
    },
  },
  preview: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  // Avoid thrashing when many OBS browser sources hit the same module graph.
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'zustand', 'tesseract.js'],
  },
})
