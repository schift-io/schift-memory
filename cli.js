#!/usr/bin/env node
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname, basename } from 'path';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cmd = process.argv[2] || 'setup';
const args = process.argv.slice(3);

const AUTH_PATH = join(homedir(), '.schift', 'memory', 'config', 'auth.json');
const MEMORY_ROOT = join(homedir(), '.schift', 'memory');

// --- Shared helpers (same as mcp-server.js) ---

function loadAuth() {
  try {
    const data = JSON.parse(readFileSync(AUTH_PATH, 'utf-8'));
    return { key: data.api_key, url: data.cloud_url || 'https://api.schift.io' };
  } catch {
    return null;
  }
}

function requireAuth() {
  const auth = loadAuth();
  if (!auth) {
    console.error('  Not logged in. Run: npx @schift-io/memory login');
    process.exit(1);
  }
  return auth;
}

async function apiCall(auth, path, body) {
  const resp = await fetch(`${auth.url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.key}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`API error ${resp.status}: ${err}`);
  }
  return resp.json();
}

function searchLocal(query, topK = 10, domain) {
  const dirs = ['compact/session', 'sources/web', 'sources/search', 'sources/external'];
  const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 1);
  const results = [];

  for (const dir of dirs) {
    const fullDir = join(MEMORY_ROOT, dir);
    let files;
    try { files = readdirSync(fullDir); } catch { continue; }

    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const filePath = join(fullDir, file);
      try {
        const stat = statSync(filePath);
        if (!stat.isFile()) continue;
        const content = readFileSync(filePath, 'utf-8');

        if (domain) {
          const domainMatch = content.match(/^domain:\s*(.+)$/m);
          if (domainMatch && domainMatch[1].trim() !== domain) continue;
        }

        const lower = content.toLowerCase();
        let score = 0;
        for (const kw of keywords) {
          if (lower.indexOf(kw) !== -1) score++;
        }
        if (score === 0) continue;

        const meta = {};
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (fmMatch) {
          for (const line of fmMatch[1].split('\n')) {
            const [k, ...v] = line.split(':');
            if (k && v.length) meta[k.trim()] = v.join(':').trim();
          }
        }

        const body = content.replace(/^---[\s\S]*?---\n?/, '').trim();
        results.push({ file: filePath, score, metadata: meta, snippet: body.slice(0, 300), modified: stat.mtime.toISOString() });
      } catch { continue; }
    }
  }

  results.sort((a, b) => b.score - a.score || new Date(b.modified) - new Date(a.modified));
  return results.slice(0, topK);
}

// --- Commands ---

const commands = {
  setup:  join(__dirname, 'scripts', 'login.sh'),
  login:  join(__dirname, 'scripts', 'login.sh'),
  init:   join(__dirname, 'scripts', 'init.sh'),
  install: join(__dirname, 'scripts', 'install-hooks.sh'),
};

// Shell-based commands
if (commands[cmd]) {
  try {
    execFileSync('bash', [commands[cmd]], { stdio: 'inherit' });
  } catch (e) {
    process.exit(e.status || 1);
  }
  process.exit(0);
}

// --- remember: save a note ---
if (cmd === 'remember' || cmd === 'rem' || cmd === 'save') {
  const text = args.join(' ');
  if (!text) {
    console.error('  Usage: schift-memory remember "your note here"');
    process.exit(1);
  }

  const auth = requireAuth();

  // Parse optional --domain flag
  let domain = 'business';
  const domainIdx = args.indexOf('--domain');
  let content = text;
  if (domainIdx !== -1 && args[domainIdx + 1]) {
    domain = args[domainIdx + 1];
    content = args.filter((_, i) => i !== domainIdx && i !== domainIdx + 1).join(' ');
  }

  // Save locally
  const noteId = `note_${Date.now()}`;
  const noteDir = join(MEMORY_ROOT, 'compact', 'session');
  mkdirSync(noteDir, { recursive: true });
  writeFileSync(join(noteDir, `${noteId}.md`), `---
session_id: ${noteId}
date: ${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}
domain: ${domain}
synced: false
---

# Note

${content}
`);

  // Sync to cloud
  try {
    await apiCall(auth, '/v1/memory/compact', {
      session_id: noteId,
      summary: content,
      domain,
    });
    // Mark synced
    const filePath = join(noteDir, `${noteId}.md`);
    const fileContent = readFileSync(filePath, 'utf-8');
    writeFileSync(filePath, fileContent.replace('synced: false', 'synced: true'));
    console.log(`  Saved + synced: "${content.slice(0, 60)}${content.length > 60 ? '...' : ''}"`);
    console.log(`  Domain: ${domain}`);
  } catch (e) {
    console.log(`  Saved locally (cloud sync failed: ${e.message})`);
    console.log('  Will retry on next session start.');
  }
  process.exit(0);
}

// --- search: semantic search ---
if (cmd === 'search' || cmd === 'find') {
  const query = args.filter(a => !a.startsWith('--')).join(' ');
  if (!query) {
    console.error('  Usage: schift-memory search "your query"');
    process.exit(1);
  }

  const auth = loadAuth();
  const topK = 5;

  // Parse --domain, --offline flags
  const offline = args.includes('--offline') || args.includes('--local');
  let domain;
  const domainIdx = args.indexOf('--domain');
  if (domainIdx !== -1 && args[domainIdx + 1]) domain = args[domainIdx + 1];

  if (offline || !auth) {
    const results = searchLocal(query, topK, domain);
    if (results.length === 0) {
      console.log('  No results found locally.');
    } else {
      console.log(`  ${results.length} local result(s):\n`);
      for (const r of results) {
        const title = r.metadata.title || r.metadata.session_id || basename(r.file, '.md');
        const dom = r.metadata.domain || '?';
        console.log(`  [${dom}] ${title}`);
        console.log(`  ${r.snippet.slice(0, 120)}...`);
        console.log();
      }
    }
    if (!auth) console.log('  (offline mode - login for cloud semantic search)');
    process.exit(0);
  }

  try {
    const result = await apiCall(auth, '/v1/query', {
      query,
      collection: 'localbucket',
      top_k: topK,
      ...(domain ? { filter: { domain } } : {}),
    });

    const hits = result.results || result.matches || [];
    if (hits.length === 0) {
      console.log('  No results found.');
    } else {
      console.log(`  ${hits.length} result(s):\n`);
      for (const hit of hits) {
        const meta = hit.metadata || {};
        const title = meta.title || meta.session_id || meta.topic || 'untitled';
        const dom = meta.domain || '?';
        const score = hit.score != null ? ` (${(hit.score * 100).toFixed(0)}%)` : '';
        const snippet = (hit.text || hit.content || meta.summary || '').slice(0, 120);
        console.log(`  [${dom}] ${title}${score}`);
        if (snippet) console.log(`  ${snippet}...`);
        console.log();
      }
    }
  } catch (e) {
    console.log(`  Cloud search failed: ${e.message}`);
    console.log('  Falling back to local search...\n');
    const results = searchLocal(query, topK, domain);
    for (const r of results) {
      const title = r.metadata.title || r.metadata.session_id || basename(r.file, '.md');
      console.log(`  [${r.metadata.domain || '?'}] ${title}`);
      console.log(`  ${r.snippet.slice(0, 120)}...`);
      console.log();
    }
  }
  process.exit(0);
}

// --- ask: RAG-based Q&A ---
if (cmd === 'ask') {
  const question = args.filter(a => !a.startsWith('--')).join(' ');
  if (!question) {
    console.error('  Usage: schift-memory ask "your question"');
    process.exit(1);
  }

  const auth = requireAuth();

  // Search for context
  let context = '';
  try {
    const result = await apiCall(auth, '/v1/query', {
      query: question,
      collection: 'localbucket',
      top_k: 3,
    });
    const hits = result.results || result.matches || [];
    context = hits.map(h => {
      const meta = h.metadata || {};
      const title = meta.title || meta.session_id || '';
      const text = h.text || h.content || meta.summary || '';
      return `[${meta.domain || ''}] ${title}\n${text}`;
    }).join('\n---\n');
  } catch {
    // Fallback to local
    const local = searchLocal(question, 3);
    context = local.map(r => `[${r.metadata.domain || ''}] ${r.metadata.title || ''}\n${r.snippet}`).join('\n---\n');
  }

  if (!context.trim()) {
    console.log('  No relevant knowledge found. Try saving some content first.');
    process.exit(0);
  }

  // Call Schift Cloud RAG endpoint
  try {
    const result = await apiCall(auth, '/v1/memory/ask', {
      question,
      context,
    });
    console.log(`\n  ${result.answer || result.response || JSON.stringify(result)}\n`);
  } catch (e) {
    // Fallback: just show the context
    console.log('  (RAG endpoint not available yet - showing search results)\n');
    console.log(`  Q: ${question}\n`);
    console.log('  Relevant knowledge:');
    console.log(`  ${context.slice(0, 800)}`);
    console.log();
  }
  process.exit(0);
}

// --- ingest: bulk file ingestion ---
if (cmd === 'ingest') {
  const target = args.filter(a => !a.startsWith('--'))[0];
  if (!target) {
    console.error('  Usage: schift-memory ingest ./path/to/files');
    process.exit(1);
  }

  const auth = requireAuth();

  let domain = 'reference';
  const domainIdx = args.indexOf('--domain');
  if (domainIdx !== -1 && args[domainIdx + 1]) domain = args[domainIdx + 1];

  const { resolve } = await import('path');
  const { existsSync } = await import('fs');
  const fullPath = resolve(target);

  if (!existsSync(fullPath)) {
    console.error(`  Path not found: ${fullPath}`);
    process.exit(1);
  }

  // Collect files
  const files = [];
  const stat = statSync(fullPath);
  const SUPPORTED = new Set(['.md', '.txt', '.pdf', '.html', '.json', '.csv', '.rst', '.adoc']);

  if (stat.isFile()) {
    files.push(fullPath);
  } else if (stat.isDirectory()) {
    function walk(dir) {
      for (const entry of readdirSync(dir)) {
        if (entry.startsWith('.')) continue;
        const p = join(dir, entry);
        const s = statSync(p);
        if (s.isDirectory()) walk(p);
        else if (SUPPORTED.has(extname(p).toLowerCase())) files.push(p);
      }
    }
    walk(fullPath);
  }

  if (files.length === 0) {
    console.log(`  No supported files found in ${fullPath}`);
    console.log(`  Supported: ${[...SUPPORTED].join(', ')}`);
    process.exit(0);
  }

  console.log(`  Found ${files.length} file(s) to ingest.\n`);

  let success = 0;
  let failed = 0;

  for (const file of files) {
    const name = basename(file);
    try {
      const content = readFileSync(file, 'utf-8');
      const truncated = content.slice(0, 50000); // API limit safety

      await apiCall(auth, '/v1/memory/compact', {
        session_id: `ingest_${Date.now()}_${name}`,
        summary: `# ${name}\n\n${truncated}`,
        domain,
        topic: basename(file, extname(file)),
      });

      success++;
      process.stdout.write(`  [${success}/${files.length}] ${name}\n`);
    } catch (e) {
      failed++;
      process.stdout.write(`  [FAIL] ${name}: ${e.message.slice(0, 60)}\n`);
    }
  }

  console.log(`\n  Done: ${success} ingested, ${failed} failed.`);
  process.exit(0);
}

// --- status ---
if (cmd === 'status') {
  const auth = loadAuth();
  if (!auth) {
    console.log('  Not logged in. Run: npx @schift-io/memory login');
    process.exit(0);
  }

  try {
    const resp = await fetch(`${auth.url}/v1/organizations/me`, {
      headers: { 'Authorization': `Bearer ${auth.key}` },
    });
    if (resp.ok) {
      console.log('  Connected to Schift Cloud.');

      // Count local files
      let localCount = 0;
      let unsyncedCount = 0;
      const dirs = ['compact/session', 'sources/web', 'sources/search', 'sources/external'];
      for (const dir of dirs) {
        try {
          const files = readdirSync(join(MEMORY_ROOT, dir));
          for (const f of files) {
            if (!f.endsWith('.md')) continue;
            localCount++;
            try {
              const content = readFileSync(join(MEMORY_ROOT, dir, f), 'utf-8');
              if (content.includes('synced: false')) unsyncedCount++;
            } catch {}
          }
        } catch {}
      }

      console.log(`  Local: ${localCount} items (${unsyncedCount} pending sync)`);
    } else {
      console.log('  API key invalid. Run: npx @schift-io/memory login');
    }
  } catch (e) {
    console.log(`  Connection error: ${e.message}`);
  }
  process.exit(0);
}

// --- help ---
if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
  console.log(`
  Schift Memory - Your Second Brain

  Usage: schift-memory <command> [args]

  Setup:
    login                      Sign in with your Schift account
    init                       Bootstrap local dirs + cloud bucket
    install                    Install Claude Code hooks
    status                     Check connection + local stats

  Second Brain:
    remember "note"            Save a note to your knowledge base
    search "query"             Semantic search your knowledge
    ask "question"             RAG-based Q&A over your knowledge
    ingest ./path              Bulk ingest local files

  Options:
    --domain <name>            Filter/tag by domain (business, research, etc.)
    --offline                  Search locally only (no cloud)

  Examples:
    schift-memory remember "pricing decision: Free + $49 Pro"
    schift-memory search "what was the auth architecture decision"
    schift-memory ask "how does our billing work"
    schift-memory ingest ./docs --domain reference
`);
  process.exit(0);
}

console.error(`  Unknown command: ${cmd}. Run: schift-memory help`);
process.exit(1);
