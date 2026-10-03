import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import replace from '@rollup/plugin-replace';
import { readFileSync, copyFileSync, mkdirSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
const dev = process.env.ROLLUP_WATCH === 'true';
// Tryb deweloperski: ustaw AVIONICS_DEPLOY_DIR na katalog www HA
// (np. udzial Samby), a kazdy build zostanie tam skopiowany.
const deployDir = process.env.AVIONICS_DEPLOY_DIR;

const deploy = () => ({
  name: 'deploy-to-ha',
  writeBundle() {
    if (!deployDir) return;
    mkdirSync(deployDir, { recursive: true });
    copyFileSync('dist/avionics-cards.js', `${deployDir}/avionics-cards.js`);
    console.log(`→ skopiowano do ${deployDir}/avionics-cards.js`);
  },
});

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/avionics-cards.js',
    format: 'es',
    sourcemap: dev ? 'inline' : false,
  },
  plugins: [
    replace({
      preventAssignment: true,
      values: { __AVIONICS_VERSION__: JSON.stringify(pkg.version) },
    }),
    resolve({ extensions: ['.ts', '.js'] }),
    typescript(),
    !dev && terser({ format: { comments: false } }),
    deploy(),
  ],
};
