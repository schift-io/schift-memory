import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

function stripQuotes(value) {
  return value.replace(/^['"]|['"]$/g, '');
}

function hasFilterPath(lines, filterName, expectedPath) {
  const filterLineIndex = lines.findIndex((line) => line.trim() === `${filterName}:`);
  if (filterLineIndex === -1) {
    return false;
  }

  const filterIndent = lines[filterLineIndex].match(/^\s*/)[0].length;

  for (let i = filterLineIndex + 1; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }

    const indent = rawLine.match(/^\s*/)[0].length;

    if (indent < filterIndent) {
      break;
    }

    if (indent === filterIndent && trimmed.endsWith(':') && trimmed !== `${filterName}:`) {
      break;
    }

    if (trimmed.startsWith('- ')) {
      if (stripQuotes(trimmed.slice(2).trim()) === expectedPath) {
        return true;
      }
    }
  }

  return false;
}

function hasSyncTarget(lines, expectedRepository, expectedPublishDir) {
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmedLine = rawLine.trim();
    const externalMatch = trimmedLine.match(/^external_repository:\s*(.+)$/);
    if (!externalMatch) {
      continue;
    }

    if (stripQuotes(externalMatch[1].trim()) !== expectedRepository) {
      continue;
    }

    const targetIndent = rawLine.match(/^\s*/)[0].length;
    for (let j = i + 1; j < lines.length; j++) {
      const nextRawLine = lines[j];
      const nextTrimmed = nextRawLine.trim();
      const nextIndent = nextRawLine.match(/^\s*/)[0].length;

      if (!nextTrimmed) {
        continue;
      }
      if (nextIndent <= targetIndent) {
        break;
      }

      const publishMatch = nextTrimmed.match(/^publish_dir:\s*(.+)$/);
      if (!publishMatch) {
        continue;
      }

      if (stripQuotes(publishMatch[1].trim()) === expectedPublishDir) {
        return true;
      }
    }
  }

  return false;
}

test('sync-public-repos.yml should include schift-memory path and target sync settings', async () => {
  const workflow = await readFile(join(repoRoot, '.github', 'workflows', 'sync-public-repos.yml'), 'utf8');

  assert.ok(workflow.includes('packages/schift-memory/**'));
  assert.ok(workflow.includes('sync-schift-memory:'));
  assert.ok(workflow.includes('external_repository: schift-io/schift-memory'));
  assert.ok(workflow.includes('publish_dir: ./packages/schift-memory'));
});

test('ci.yml should track schift-memory changes and run package/workflows validation', async () => {
  const workflow = await readFile(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');

  const lines = workflow.split('\n');

  assert.ok(
    lines.some((line) => line.trim() === 'schift_memory: ${{ steps.filter.outputs.schift_memory }}'),
    'Expected schift_memory output wiring in the changes filter',
  );
  assert.ok(
    hasFilterPath(lines, 'schift_memory', 'packages/schift-memory/**'),
    'Expected schift_memory filter path to include packages/schift-memory/**',
  );

  assert.match(
    workflow,
    /node\s+--test[^\n]*package\.test\.js/,
    'Expected package.test.js execution in CI workflow',
  );
  assert.match(
    workflow,
    /node\s+--test[^\n]*workflows\.test\.js/,
    'Expected workflows.test.js execution in CI workflow',
  );
  assert.match(workflow, /npm\s+pack\s+--dry-run/, 'Expected npm pack --dry-run in CI workflow');
});
