import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative base so the build can be served from any static path (e.g. GitHub Pages).
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'privacy.html'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        importScripts: ['sw-notify.js'],
      },
      manifest: {
        name: 'Az Kavanu · אז קבענו',
        short_name: 'Az Kavanu',
        description: 'Study tracking and scheduling, stored in your own Google Drive.',
        theme_color: '#27408b',
        background_color: '#f6f4ef',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
