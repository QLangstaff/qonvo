import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { 'index.web': 'src/web/index.web.ts' },
    format: ['esm', 'cjs'],
    dts: { resolve: true, entry: 'src/web/index.web.ts' },
    sourcemap: true,
    clean: true,
    target: 'es2022',
    splitting: false,
    external: ['react', 'react-native'],
    minify: false,
  },
  {
    entry: { 'index.native': 'src/native/index.native.ts' },
    format: ['esm', 'cjs'],
    dts: { resolve: true, entry: 'src/native/index.native.ts' },
    sourcemap: true,
    clean: false,
    target: 'es2022',
    splitting: false,
    external: ['react', 'react-native'],
    minify: false,
  },
])
