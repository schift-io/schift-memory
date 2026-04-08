#!/usr/bin/env node
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cmd = process.argv[2] || 'setup';

const commands = {
  setup:  null, // redirect to schift auth login
  login:  null, // redirect to schift auth login
  init:   join(__dirname, 'scripts', 'init.sh'),
  install: join(__dirname, 'scripts', 'install-hooks.sh'),
  status: null,
  help:   null,
};

if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
  console.log(`
  Schift Memory - Terminal Plugin (hooks + MCP)

  Usage: npx @schift-io/memory <command>

  Commands:
    init      Bootstrap local directories + cloud bucket
    install   Install Dot hooks
    status    Check connection status

  Auth: use "schift auth login" (shared with main CLI)

  Second brain commands: use "schift <command>"
    schift remember, search, ask, ingest
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

if (cmd === 'setup' || cmd === 'login') {
  console.log('\n  Auth is now managed by the main Schift CLI.');
  console.log('  Run: schift auth login\n');
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
