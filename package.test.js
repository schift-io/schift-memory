import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('package exposes a default bin for npm exec on scoped package name', async () => {
  const packageJson = JSON.parse(
    await readFile(join(__dirname, 'package.json'), 'utf8'),
  );

  assert.equal(packageJson.name, '@schift-io/memory');
  assert.equal(packageJson.bin.memory, './cli.js');
});

test('public repo publish workflow exists in package source', async () => {
  const { access } = await import('node:fs/promises');
  await access(join(__dirname, '.github', 'workflows', 'publish-memory.yml'));
});
