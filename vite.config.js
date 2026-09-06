import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  // Which env vars get inlined into the browser bundle.
  //
  // Vite exposes nothing to client code unless it matches a prefix here, and
  // setting this REPLACES the default "VITE_" rather than adding to it — so
  // "VITE_" is kept in the list for anything added later.
  //
  // The env vars on Vercel are named without a prefix (EMAILJS_SERVICE_ID,
  // APP_URL, ...), so those names are allowlisted explicitly. Everything on
  // this list is public: it ships in the bundle and any visitor can read it.
  // That is fine for the EmailJS *public* key and template ids, which are
  // designed for browser use.
  //
  // NEVER add "TWILIO_" or "FIREBASE_ADMIN_" here, and never add an EmailJS
  // *private* key — it would match the EMAILJS_ prefix and leak. Server-side
  // secrets belong in api/*.js, which reads process.env and is not bundled.
  envPrefix: ['VITE_', 'EMAILJS_', 'APP_URL'],

  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    },
    hmr: {
    protocol: 'ws',
    host: 'localhost',
  }
  }
})