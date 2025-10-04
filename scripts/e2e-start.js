#!/usr/bin/env node
'use strict';

// Cross-platform e2e server starter for didhub
// Usage: node ./scripts/e2e-start.js [--config path] [--port 6000]

const { spawn } = require('child_process');
const path = require('path');

const argv = require('minimist')(process.argv.slice(2), {
  string: ['config'],
  default: { config: 'server-rs/config.e2e.json', port: 6000 },
});

const configPath = argv.config;
const port = argv.port;

// Resolve config path to absolute so it's valid when we spawn cargo with cwd=server-rs
const absoluteConfigPath = require('path').resolve(process.cwd(), configPath);

console.log(`Starting didhub-server with config ${absoluteConfigPath} on port ${port}`);

// Change working directory to server-rs for cargo run
const serverDir = path.resolve(__dirname, '..', 'server-rs');

// Build the cargo command and args. We forward any extra args after '--' if provided.
const cargoArgs = ['run', '--bin', 'didhub-server', '--'];
// Append --config and the path
cargoArgs.push('--config', absoluteConfigPath);

// Ensure the sqlite file referenced in the config exists (touch it) to avoid "unable to open database file"
try {
  const fs = require('fs');
  const cfgText = fs.readFileSync(absoluteConfigPath, 'utf8');
  let cfg;
  try {
    cfg = JSON.parse(cfgText);
  } catch (err) {
    // if the config isn't valid JSON, skip touch and let the server error as before
    cfg = null;
  }

  if (cfg && cfg.database && cfg.database.driver === 'sqlite' && cfg.database.path) {
    const dbPathFromCfg = cfg.database.path;
    // resolve db path relative to the serverDir (same behavior as server expects when given a config)
    const resolvedDbPath = path.resolve(serverDir, dbPathFromCfg);
    const dbDir = path.dirname(resolvedDbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    if (!fs.existsSync(resolvedDbPath)) {
      // create an empty file so SQLite can open it
      fs.closeSync(fs.openSync(resolvedDbPath, 'w'));
      console.log(`Created empty sqlite file for e2e DB at ${resolvedDbPath}`);
    }
  }
} catch (err) {
  console.warn('Could not ensure e2e DB file exists:', err && err.message ? err.message : err);
}

const child = spawn('cargo', cargoArgs, {
  cwd: serverDir,
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: false,
});

child.stdout.on('data', (data) => {
  process.stdout.write(`[didhub-server] ${data}`);
});

child.stderr.on('data', (data) => {
  process.stderr.write(`[didhub-server] ${data}`);
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.log(`didhub-server exited with signal ${signal}`);
    process.exit(1);
  } else {
    console.log(`didhub-server exited with code ${code}`);
    process.exit(code);
  }
});

child.on('error', (err) => {
  console.error('Failed to start didhub-server:', err);
  process.exit(1);
});
