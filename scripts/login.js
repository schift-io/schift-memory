#!/usr/bin/env node
// OAuth browser login — reuses schift.io/auth/cli flow (same as `schift auth login`)
import { createServer } from 'http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { spawnSync } from 'child_process';

const CLOUD = process.env.SCHIFT_CLOUD || 'https://api.schift.io';
const WEB = process.env.SCHIFT_WEB || 'https://schift.io';
const CONFIG_DIR = join(process.env.HOME, '.schift', 'memory', 'config');
const AUTH_FILE = join(CONFIG_DIR, 'auth.json');

// Check if already logged in
if (existsSync(AUTH_FILE)) {
  try {
    const auth = JSON.parse(readFileSync(AUTH_FILE, 'utf-8'));
    if (auth.api_key) {
      const resp = await fetch(`${auth.cloud_url || CLOUD}/v1/organizations/me`, {
        headers: { 'Authorization': `Bearer ${auth.api_key}` },
      });
      if (resp.ok) {
        console.log('\n  Already logged in. Account is valid.');
        console.log(`  To re-login, delete: ${AUTH_FILE}\n`);
        process.exit(0);
      }
    }
  } catch {}
}

console.log('\n  Schift Memory Login');
console.log('  ===================\n');

const state = randomBytes(16).toString('hex');

// Start local callback server
const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost`);

  if (url.pathname === '/callback') {
    const receivedState = url.searchParams.get('state');
    const token = url.searchParams.get('token');
    const error = url.searchParams.get('error');

    if (error) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><body style="font-family:system-ui;text-align:center;padding:60px"><h2>Login failed</h2><p>${error}</p></body></html>`);
      console.log(`  Login failed: ${error}`);
      setTimeout(() => process.exit(1), 500);
      return;
    }

    if (receivedState !== state) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body style="font-family:system-ui;text-align:center;padding:60px"><h2>State mismatch</h2><p>Please try again.</p></body></html>');
      return;
    }

    if (!token || !token.startsWith('sch_')) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body style="font-family:system-ui;text-align:center;padding:60px"><h2>Invalid token</h2><p>Please try again.</p></body></html>');
      return;
    }

    // Save auth
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(AUTH_FILE, JSON.stringify({
      api_key: token,
      created_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
      cloud_url: CLOUD,
    }, null, 2) + '\n');

    try { spawnSync('chmod', ['600', AUTH_FILE]); } catch {}

    // Redirect browser back to schift.io
    const returnUrl = `${WEB}/auth/cli?status=success`;
    res.writeHead(302, { Location: returnUrl });
    res.end();

    console.log('  Logged in successfully!\n');
    setTimeout(() => { server.close(); process.exit(0); }, 500);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const authUrl = `${WEB}/auth/cli?port=${port}&state=${state}`;

  console.log('  Opening browser for login...\n');
  console.log('  If browser doesn\'t open, visit:');
  console.log(`  ${authUrl}\n`);

  try {
    const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
    spawnSync(cmd, [authUrl], { stdio: 'ignore' });
  } catch {}

  console.log('  Waiting for login...');
});

// Timeout after 5 minutes
setTimeout(() => {
  console.log('\n  Login timed out. Try again: npx @schift-io/memory');
  server.close();
  process.exit(1);
}, 5 * 60 * 1000);
