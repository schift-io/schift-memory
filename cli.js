#!/usr/bin/env node
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cmd = process.argv[2] || 'setup';

const commands = {
  setup:  join(__dirname, 'scripts', 'login.sh'),
  login:  join(__dirname, 'scripts', 'login.sh'),
  init:   join(__dirname, 'scripts', 'init.sh'),
  install: join(__dirname, 'scripts', 'install-hooks.sh'),
  status: null,
  help:   null,
};

if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
  console.log(`
  Schift Memory - Second brain for Claude Code

  Usage: npx @schift-io/memory <command>

  Commands:
    login     Sign in with your Schift API key
    init      Bootstrap local directories + cloud bucket
    install   Install Claude Code hooks (auto-save on WebFetch, WebSearch, etc.)
    status    Check connection status

  Quick setup (first time):
    npx @schift-io/memory
`);
  process.exit(0);
}

if (cmd === 'status') {
  const { readFileSync } = await import('fs');
  const authPath = join(process.env.HOME, '.schift', 'memory', 'config', 'auth.json');
  try {
    const auth = JSON.parse(readFileSync(authPath, 'utf-8'));
    const resp = await fetch(`${auth.cloud_url || 'https://api.schift.io'}/v1/organizations/me`, {
      headers: { 'Authorization': `Bearer ${auth.api_key}` },
    });
    console.log(resp.ok ? '  Connected to Schift Cloud.' : '  API key invalid. Run: npx @schift-io/memory login');
  } catch {
    console.log('  Not logged in. Run: npx @schift-io/memory login');
  }
  process.exit(0);
}

const script = commands[cmd];
if (!script) {
  console.error(`  Unknown command: ${cmd}. Run: npx @schift-io/memory help`);
  process.exit(1);
}

try {
  execFileSync('bash', [script], { stdio: 'inherit' });
} catch (e) {
  process.exit(e.status || 1);
}
