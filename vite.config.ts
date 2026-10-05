/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  build: {
    rolldownOptions: {
      output: {
        // Tách thư viện (ít đổi) khỏi code app (hay đổi): mỗi lần deploy máy anh em
        // chỉ phải tải lại phần code app nhỏ, phần Firebase/React vẫn dùng bản đã lưu.
        codeSplitting: {
          groups: [
            { name: 'firebase', test: /node_modules[\/](@firebase[\/](?!analytics|installations)|firebase[\/](?!analytics))/ },
            { name: 'react', test: /node_modules[\/](react|react-dom|scheduler)[\/]/ },
          ],
        },
      },
    },
  },
  test: { environment: 'node' },
})
