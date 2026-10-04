import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Arquivos soltos na raiz: sobrevive a upload que perde a estrutura de pastas.
  build: { assetsDir: '' },
})
