import { build } from 'esbuild';

await build({
  entryPoints: ['firebaseClient.js'],
  bundle: true,
  outfile: 'firebaseBundle.js',
  format: 'iife',
  globalName: 'firebaseClient',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  sourcemap: false
});

console.log('✅ Built firebaseBundle.js');


