import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',  // Change this line from '/XeroSaver/' to './'
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})
