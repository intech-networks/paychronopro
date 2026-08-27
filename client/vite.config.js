import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxy = { '/api': 'http://localhost:5000' };

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: apiProxy
  },
  preview: { proxy: apiProxy }
});
