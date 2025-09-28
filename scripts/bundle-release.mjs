#!/usr/bin/env node
/**
 * DIDHub release bundler (Rust + frontend)
 * Produces: dist/release/didhub-<version>-<yyyymmddHHMMss>/
 * Structure:
 *   didhub-server (binary)
 *   seed (binary)
 *   static/ (frontend build, embedded in binary)
 *   config.example.json
 *   RUN.md
 *   VERSION
 *   SBOM files (if syft available)
 */
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, copyFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { cpSync } from 'node:fs';
import { join } from 'node:path';

function run(cmd, opts = {}) {
  console.log('\n>>', cmd);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

const root = process.cwd();
import { readFile } from 'node:fs/promises';
let pkgRaw;
try {
  pkgRaw = await readFile('package.json', 'utf8');
} catch {
  pkgRaw = '{"version":"0.0.0"}';
}
let pkg;
try {
  pkg = JSON.parse(pkgRaw);
} catch {
  pkg = { version: '0.0.0' };
}
const version = pkg.version || '0.0.0';
const now = new Date();
const stamp = now
  .toISOString()
  .replace(/[-:TZ]/g, '')
  .slice(0, 14);
const outRoot = join(root, 'dist', 'release');
const relDir = `didhub-${version}-${stamp}`;
const dest = join(outRoot, relDir);

if (!existsSync(outRoot)) mkdirSync(outRoot, { recursive: true });
console.log('Output dir:', dest);
if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

// 1. Build frontend
run('pnpm run build:api-client');
run('pnpm run build:frontend');

// 1.5. Generate license files
run('pnpm run generate-licenses');

// 2. Prepare embedded static assets for Rust compile-time embedding
if (existsSync(join(root, 'static'))) {
  // Ensure server-rs/static exists and copy built frontend there so include_dir! sees it
  const serverStatic = join(root, 'server-rs', 'static');
  try {
    mkdirSync(serverStatic, { recursive: true });
    cpSync(join(root, 'static'), serverStatic, { recursive: true });
  } catch (e) {
    console.warn('failed copying static to server-rs/static (continuing):', e.message);
  }
}

// 3. Build Rust binary (release)
run('cargo build --release --manifest-path server-rs/Cargo.toml --features embed_static,updater');

// 4. Copy binary
const binName = process.platform === 'win32' ? 'didhub-server.exe' : 'didhub-server';
copyFileSync(join(root, 'server-rs', 'target', 'release', binName), join(dest, binName));
const seedBinName = process.platform === 'win32' ? 'seed.exe' : 'seed';
copyFileSync(join(root, 'server-rs', 'target', 'release', seedBinName), join(dest, seedBinName));
const configGenBinName = process.platform === 'win32' ? 'config_generator.exe' : 'config_generator';
copyFileSync(join(root, 'server-rs', 'target', 'release', configGenBinName), join(dest, configGenBinName));

// 5. Copy static assets (already built into static/) (skipped)
// if (existsSync(join(root,'static'))) {
//   cpSync(join(root,'static'), join(dest,'static'), { recursive: true });
// }

// 6. Copy example config
const cfgExample = join(root, 'server-rs', 'config.example.json');
if (existsSync(cfgExample)) copyFileSync(cfgExample, join(dest, 'config.example.json'));

// 7. Write VERSION file
writeFileSync(join(dest, 'VERSION'), version + '\n');

// 8. Generate RUN.md
copyFileSync(join(root, 'docs', 'running.md'), join(dest, 'RUN.md'));

console.log('Release bundle created at', dest);

// 9. SBOM generation (Syft) if syft present
try {
  run(`syft packages dir:${dest} -o json > ${join(dest, 'SBOM.syft.json')}`);
  run(`syft packages dir:${dest} -o spdx-json > ${join(dest, 'SBOM.spdx.json')}`);
  console.log('SBOM generated (syft)');
} catch (e) {
  console.warn('Syft not available or SBOM generation failed (continuing):', e.message);
}

// 10. (Optional) Create zip archive (best-effort; platform-specific)
// try {
//   const zipName = relDir + (process.platform === 'win32' ? '.zip' : '.tar.gz');
//   if (process.platform === 'win32') {
//     run(
//       `powershell -NoProfile -Command Compress-Archive -Path '${dest}/*' -DestinationPath '${join(outRoot, zipName)}'`,
//     );
//   } else {
//     run(`tar -C '${outRoot}' -czf '${join(outRoot, zipName)}' '${relDir}'`);
//   }
//   console.log('Archive created:', zipName);
// } catch (e) {
//   console.warn('Archive step failed (continuing):', e.message);
// }
