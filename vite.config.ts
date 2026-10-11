import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4178',
      '/health': 'http://127.0.0.1:4178',
      '/ready': 'http://127.0.0.1:4178',
    },
  },
})
