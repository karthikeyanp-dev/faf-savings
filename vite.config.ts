import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'maskable-icon-512x512.png'],
      manifest: {
        name: 'FaF Savings Pool',
        short_name: 'FaF Savings',
        description: 'Friends and Family Savings Pool Application',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // Import our notification script into the generated service worker
        importScripts: [
          'https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js',
          'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore-compat.js',
          '/sw-notifications.js',
        ],
      },
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
