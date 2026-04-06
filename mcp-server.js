#!/usr/bin/env node
/**
 * Schift Memory MCP Server
 *
 * Tools:
 *   save_url    - Save a URL to your knowledge base
 *   save_note   - Save a note/insight
 *   search      - Search your knowledge base
 *   status      - Check connection status
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const AUTH_PATH = join(homedir(), '.schift', 'memory', 'config', 'auth.json');

function loadAuth() {
  try {
    const data = JSON.parse(readFileSync(AUTH_PATH, 'utf-8'));
    return { key: data.api_key, url: data.cloud_url || 'https://api.schift.io' };
  } catch {
    return null;
  }
}

async function apiCall(path, body) {
  const auth = loadAuth();
  if (!auth) throw new Error('Not authenticated. Run: npx @schift-io/memory login');
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

// MCP stdio protocol
const TOOLS = [
  {
    name: 'save_url',
    description: 'Save a URL to your Schift knowledge base. Fetches content, extracts markdown, embeds, and makes it searchable.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to save' },
        domain: { type: 'string', enum: ['company','business','finance','decision','product','ops','research','reference'], description: 'Knowledge domain category', default: 'ops' },
        title: { type: 'string', description: 'Optional title override' },
        summary: { type: 'string', description: 'One-line summary' },
        context: { type: 'string', description: 'Why this was investigated (conversation context)' },
        findings: { type: 'string', description: 'Key findings from the content' },
      },
      required: ['url'],
    },
  },
  {
    name: 'save_note',
    description: 'Save a note or conversation insight to your Schift knowledge base.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The content to save' },
        domain: { type: 'string', enum: ['company','business','finance','decision','product','ops','research','reference'], default: 'business' },
        topic: { type: 'string', description: 'Optional topic slug (e.g. product-positioning)' },
      },
      required: ['content'],
    },
  },
  {
    name: 'search_memory',
    description: 'Search your Schift knowledge base for past conversations, saved URLs, notes, and documents.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language search query' },
        top_k: { type: 'number', description: 'Number of results', default: 5 },
        domain: { type: 'string', description: 'Filter by domain' },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_status',
    description: 'Check Schift Memory connection status and account info.',
    inputSchema: { type: 'object', properties: {} },
  },
];

async function handleToolCall(name, args) {
  switch (name) {
    case 'save_url': {
      try { new URL(args.url); } catch { throw new Error(`Invalid URL: ${args.url}`); }
      if (!/^https?:$/.test(new URL(args.url).protocol)) throw new Error('Only http/https URLs are supported');
      return apiCall('/v1/memory/ingest-url', {
        url: args.url,
        domain: args.domain || 'ops',
        title: args.title,
        summary: args.summary,
        context: args.context,
        findings: args.findings,
      });}

    case 'save_note':
      return apiCall('/v1/memory/compact', {
        session_id: `note_${Date.now()}`,
        summary: args.content,
        domain: args.domain || 'business',
        topic: args.topic,
      });

    case 'search_memory':
      return apiCall('/v1/query', {
        query: args.query,
        collection: 'localbucket',
        top_k: args.top_k || 5,
        ...(args.domain ? { filter: { domain: args.domain } } : {}),
      });

    case 'memory_status': {
      const auth = loadAuth();
      if (!auth) return { status: 'not_authenticated', message: 'Run: npx @schift-io/memory login' };
      try {
        const resp = await fetch(`${auth.url}/v1/organizations/me`, {
          headers: { 'Authorization': `Bearer ${auth.key}` },
        });
        return { status: 'connected', cloud_url: auth.url, healthy: resp.ok };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// --- MCP stdio transport ---
function send(msg) {
  const json = JSON.stringify(msg);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
}

let buffer = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;
    const header = buffer.slice(0, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) { buffer = buffer.slice(headerEnd + 4); continue; }
    const len = parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + len) break;
    const body = buffer.slice(bodyStart, bodyStart + len);
    buffer = buffer.slice(bodyStart + len);
    try {
      const msg = JSON.parse(body);
      handleMessage(msg);
    } catch (e) {
      send({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null });
    }
  }
});

async function handleMessage(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'schift-memory', version: '0.1.0' },
    }});
  } else if (method === 'notifications/initialized') {
    // no-op
  } else if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  } else if (method === 'tools/call') {
    try {
      const result = await handleToolCall(params.name, params.arguments || {});
      send({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      }});
    } catch (e) {
      send({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: `Error: ${e.message}` }],
        isError: true,
      }});
    }
  } else {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method: ${method}` } });
  }
}
