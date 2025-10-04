#!/usr/bin/env node
'use strict';

// Orchestrator for E2E: start server + frontend, wait for readiness, run Playwright tests, then shutdown

const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');

const serverPort = 6000;
const frontendPort = 5173;
const serverCmd = ['node', './scripts/e2e-start.js', '--config', 'server-rs/config.e2e.json'];
const frontendCmd = ['pnpm', '-C', 'packages/frontend', 'run', 'dev', '--', '--port', String(frontendPort)];

function spawnCmd(cmd, opts) {
  const child = spawn(cmd[0], cmd.slice(1), Object.assign({ shell: false }, opts || {}));
  child.stdout.on('data', d => process.stdout.write(`[${cmd[0]}] ${d}`));
  child.stderr.on('data', d => process.stderr.write(`[${cmd[0]}] ${d}`));
  child.on('exit', (c, s) => console.log(`${cmd[0]} exited with ${c || s}`));
  return child;
}

function waitForHttp(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function check() {
      http.get(url, (res) => {
        res.resume();
        resolve();
      }).on('error', () => {
        if (Date.now() - start > timeout) return reject(new Error('timeout'));
        setTimeout(check, 200);
      });
    })();
  });
}

(async () => {
  console.log('Starting e2e orchestration');
  // Ensure any existing e2e sqlite DB is removed so tests start clean
  try {
    const fs = require('fs');
    const cfgPath = path.resolve(process.cwd(), 'server-rs', 'config.e2e.json');
    if (fs.existsSync(cfgPath)) {
      const cfgText = fs.readFileSync(cfgPath, 'utf8');
      const cfg = JSON.parse(cfgText);
      if (cfg && cfg.database && cfg.database.driver === 'sqlite' && cfg.database.path) {
        const dbPath = path.resolve(path.resolve(process.cwd(), 'server-rs'), cfg.database.path);
        if (fs.existsSync(dbPath)) {
          fs.unlinkSync(dbPath);
          console.log(`Removed existing e2e DB at ${dbPath}`);
        }
      }
    }
  } catch (err) {
    console.warn('Could not remove existing e2e DB:', err && err.message ? err.message : err);
  }

  // Prepare environment variables for E2E
  const E2E_USER = process.env.E2E_USER || 'admin';
  const E2E_PASS = process.env.E2E_PASS || 'adminpw';
  const PLAYWRIGHT_BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${frontendPort}`;

  // Spawn server and frontend with injected env vars
  const serverEnv = Object.assign({}, process.env, {
    E2E_USER,
    E2E_PASS,
    DIDHUB_BOOTSTRAP_ADMIN_USERNAME: E2E_USER,
    DIDHUB_BOOTSTRAP_ADMIN_PASSWORD: E2E_PASS,
  });
  const frontendEnv = Object.assign({}, process.env, { E2E_USER, E2E_PASS });

  const server = spawnCmd(serverCmd, { cwd: process.cwd(), env: serverEnv });
  const frontend = spawnCmd(frontendCmd, { cwd: process.cwd(), env: frontendEnv });
  // test process handle is declared here so signal handlers can access it
  let test = null;

  // Helper to kill child process cross-platform
  function killProcess(child) {
    if (!child || child.killed) return;
    try {
      if (process.platform === 'win32') {
        // Use taskkill to ensure subtree is terminated on Windows
        const tk = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F']);
        tk.on('exit', () => {});
      } else {
        child.kill('SIGTERM');
      }
    } catch (e) {
      try { child.kill(); } catch (e) {}
    }
  }

  // Wait for a child process to exit with timeout
  function waitForExit(child, timeout = 5000) {
    return new Promise((resolve) => {
      if (!child) return resolve();
      let called = false;
      const onExit = () => {
        if (called) return; called = true; resolve();
      };
      child.on('exit', onExit);
      child.on('close', onExit);
      setTimeout(() => {
        if (called) return; called = true; resolve();
      }, timeout);
    });
  }

  async function doCleanupAndExit(code = 0) {
    try {
      console.log('Cleaning up child processes');
      try { killProcess(test); } catch(e) {}
      try { killProcess(server); } catch(e) {}
      try { killProcess(frontend); } catch(e) {}

      // Wait a short while for processes to exit
      await Promise.all([waitForExit(test, 5000), waitForExit(server, 5000), waitForExit(frontend, 5000)]);
    } catch (e) {
      // ignore
    }
    try { process.exit(code); } catch (e) { /* nothing */ }
  }

  process.on('SIGINT', async () => {
    console.log('Received SIGINT');
    await doCleanupAndExit(1);
  });
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM');
    await doCleanupAndExit(1);
  });

  try {
  // Wait for server HTTP health endpoint (use the canonical /health only)
  const healthPaths = ['/health'];
    let serverReady = false;
    for (const p of healthPaths) {
      try {
        console.log('Waiting for server health at', `http://127.0.0.1:${serverPort}${p}`);
        await waitForHttp(`http://127.0.0.1:${serverPort}${p}`, 60000);
        console.log('Server health OK at', p);
        serverReady = true;
        break;
      } catch (e) {
        // try next
      }
    }
    if (!serverReady) throw new Error('server health check timed out');

    console.log('Waiting for frontend HTTP');
    await waitForHttp(`http://localhost:${frontendPort}/`, 60000);
    console.log('Frontend ready');

    console.log('Running Playwright tests');
    const testEnv = Object.assign({}, process.env, {
      PLAYWRIGHT_E2E_USER: E2E_USER,
      PLAYWRIGHT_E2E_PASS: E2E_PASS,
      PLAYWRIGHT_BASE_URL,
    });

  test = spawn('pnpm', ['-C', 'packages/frontend', 'run', 'test:e2e'], { stdio: 'inherit', env: testEnv });
    await new Promise((resolve, reject) => {
      test.on('exit', (code) => code === 0 ? resolve() : reject(new Error('tests failed')));
    });

    console.log('Tests finished successfully');
      // mark successful outcome for the orchestrator process
      process.exitCode = 0;
  } catch (err) {
    console.error('E2E orchestration error:', err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    console.log('Shutting down processes');
    try { killProcess(server); } catch (e) {}
    try { killProcess(frontend); } catch (e) {}
    // ensure test process is killed as well
    try { killProcess(test); } catch (e) {}
    // wait for child exits before finishing so Windows doesn't prompt
    await Promise.all([waitForExit(test, 5000), waitForExit(server, 5000), waitForExit(frontend, 5000)]);
    // Export Playwright report to artifacts folder for CI
    try {
      const fs = require('fs');
      const { promisify } = require('util');
      const rename = promisify(fs.rename);
      const exists = (p) => fs.existsSync(p);
      const reportSrc = path.resolve(process.cwd(), 'packages', 'frontend', 'playwright-report');
      if (exists(reportSrc)) {
        const artifactsDir = path.resolve(process.cwd(), 'artifacts');
        if (!exists(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
        const target = path.resolve(artifactsDir, `playwright-${Date.now()}`);
        try {
          await rename(reportSrc, target);
          console.log('Moved Playwright report to', target);
        } catch (err) {
          // fallback to copy
          const copyRecursiveSync = (src, dest) => {
            const stat = fs.statSync(src);
            if (stat.isDirectory()) {
              if (!fs.existsSync(dest)) fs.mkdirSync(dest);
              for (const entry of fs.readdirSync(src)) {
                copyRecursiveSync(path.join(src, entry), path.join(dest, entry));
              }
            } else {
              fs.copyFileSync(src, dest);
            }
          };
          copyRecursiveSync(reportSrc, target);
          console.log('Copied Playwright report to', target);
        }
      }
    } catch (e) {
      console.warn('Failed to export Playwright report:', e && e.message ? e.message : e);
    }
  }
    // Final exit to ensure no lingering event loop keeps the process alive (prevents Windows 'Terminate batch job' prompt)
    try {
      process.exit(process.exitCode || 0);
    } catch (e) {
      /* ignore */
    }
})();
