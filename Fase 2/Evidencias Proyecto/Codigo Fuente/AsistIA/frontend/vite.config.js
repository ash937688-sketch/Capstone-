import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      'disclose-lone-disposition-libs.trycloudflare.com'
    ],
    proxy: {
      '/api': 'http://localhost:3001'
    },
  },
})