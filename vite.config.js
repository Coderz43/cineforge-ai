import { resolve } from 'path';

export default {
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        people: resolve(__dirname, 'people.html'),
        blog: resolve(__dirname, 'blog.html'),
        tools: resolve(__dirname, 'tools.html'),
        reels: resolve(__dirname, 'reels.html'),
        pcbuild: resolve(__dirname, 'tools/pc-build-calculator.html'),
        psu: resolve(__dirname, 'tools/psu-calculator.html')
      }
    }
  }
};
