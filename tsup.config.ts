import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true, // 生成类型声明
  sourcemap: true,
  clean: true, // 构建前清理 dist
  format: ['esm', 'cjs'],
  target: 'es2020',
  treeshake: true,
  minify: false,
  outDir: 'dist',
  outExtension({ format }) {
    // 确保文件名与 package.json 对齐：index.mjs / index.cjs
    return { js: format === 'cjs' ? '.cjs' : '.mjs' };
  },
  // external: []       // 如有外部依赖（react 等），在这里声明避免被打包进来
});
