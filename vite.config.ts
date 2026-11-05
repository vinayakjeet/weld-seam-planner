import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // The three vendor chunk is deliberately large and loads with the viewport; scripts/check-bundle.ts guards the entry chunk.
    chunkSizeWarningLimit: 1400,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'three-vendor', test: /node_modules[\\/](three|@react-three|three-mesh-bvh|its-fine|suspend-react)[\\/]/ }],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
})
