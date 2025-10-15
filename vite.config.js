import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        reels: 'reels.html',
        blog: 'blog.html',
        tools: 'tools.html',
        game: 'tools/game-finder.html',
        movie: 'tools/movie-finder.html',
        code: 'tools/code-generator.html',
        pc: 'tools/pc-build-calculator.html',
        psu: 'tools/psu-calculator.html',
        fps: 'tools/fps-calculator.html'
      }
    }
  }
});
