import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const isDevelopment = mode === 'development';

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      fs: {
        allow: ['.'],
      },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.png', 'banner.png', 'icon-source.png'],
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/cdn\.tailwindcss\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'tailwindcss-cache',
                expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 7 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'cdn-cache',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api/, /^\/admin/],
        },
        manifest: {
          name: 'OmniPDF AI - The Ultimate PDF Workspace',
          short_name: 'OmniPDF AI',
          description: 'All-in-one PDF management platform with AI-powered features. Merge, split, compress, convert, and analyze PDFs entirely in your browser.',
          theme_color: '#2563eb',
          background_color: '#f8fafc',
          display: 'standalone',
          orientation: 'any',
          scope: '/',
          start_url: '/',
          categories: ['productivity', 'utilities', 'business'],
          lang: 'en',
          icons: [
            {
              src: 'icon-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.VITE_OPENROUTER_API_KEY || env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || ''),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_OPENROUTER_API_KEY || env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || ''),
      'process.env.OPENROUTER_API_KEY': JSON.stringify(env.VITE_OPENROUTER_API_KEY || env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || ''),
      // Environment-specific URLs
      'import.meta.env.VITE_APP_ENV': JSON.stringify(env.VITE_APP_ENV || (isDevelopment ? 'development' : 'production')),
      'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || ''),
      'import.meta.env.VITE_APP_URL': JSON.stringify(env.VITE_APP_URL || ''),
      'import.meta.env.VITE_DEBUG_MODE': JSON.stringify(env.VITE_DEBUG_MODE || (isDevelopment ? 'true' : 'false')),
      // node-forge requires global in browser
      global: 'globalThis',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    optimizeDeps: {
      include: ['pdfjs-dist', 'node-forge', '@cantoo/pdf-lib', '@pdf-lib/fontkit'],
      entries: ['index.html'],
    },
  };
});
