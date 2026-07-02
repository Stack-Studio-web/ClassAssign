import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiHost = process.env.API_HOST || '10.1.150.51';
const apiPort = process.env.API_PORT || 5000;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://${apiHost}:${apiPort}`,
        changeOrigin: true,
        secure: false,
      },
      '/format': {
        target: `http://${apiHost}:${apiPort}`,
        changeOrigin: true,
        secure: false,
      }
    }
  }
})