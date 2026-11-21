import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base './' 是为了让站点部署在任意子路径下，资源仍能相对加载。
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
});
