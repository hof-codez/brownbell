import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves this as a project site at hof-codez.github.io/brownbell/,
  // not at the domain root - without this, built asset URLs would 404.
  base: '/brownbell/'
});
