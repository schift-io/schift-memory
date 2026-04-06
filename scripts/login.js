#!/usr/bin/env node
// OAuth-style login: open browser → user signs in → API key auto-saved
import { createServer } from 'http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';

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

// Start local callback server
const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost`);

  if (url.pathname === '/callback') {
    const key = url.searchParams.get('key');
    const error = url.searchParams.get('error');

    if (error || !key) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body style="font-family:system-ui;text-align:center;padding:60px"><h2>Login failed</h2><p>Please try again.</p></body></html>');
      console.log('  Login failed. Try again: npx @schift-io/memory');
      setTimeout(() => process.exit(1), 500);
      return;
    }

    // Save auth
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(AUTH_FILE, JSON.stringify({
      api_key: key,
      created_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
      cloud_url: CLOUD,
    }, null, 2) + '\n');

    // Restrict permissions
    try { exec(`chmod 600 "${AUTH_FILE}"`); } catch {}

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<html><body style="font-family:system-ui;text-align:center;padding:60px"><h2>Logged in!</h2><p>You can close this tab and return to your terminal.</p></body></html>');

    console.log('  Logged in successfully!\n');

    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 500);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// Find available port and start
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const authUrl = `${WEB}/auth/cli?port=${port}&callback=http://127.0.0.1:${port}/callback`;

  console.log(`  Opening browser for login...\n`);
  console.log(`  If browser doesn't open, visit:`);
  console.log(`  ${authUrl}\n`);

  // Open browser (macOS / Linux)
  const openCmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${openCmd} "${authUrl}"`);

  console.log('  Waiting for login...');
});

// Timeout after 5 minutes
setTimeout(() => {
  console.log('\n  Login timed out. Try again: npx @schift-io/memory');
  server.close();
  process.exit(1);
}, 5 * 60 * 1000);
