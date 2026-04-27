#!/usr/bin/env node
/**
 * War-Civ memory brief generator.
 *
 * Usage:
 *   node .claude/hooks/session-bootstrap.cjs --query "task description"
 *
 * Defaults to repo-local memory in .claude/memory. This is intentionally
 * separate from .slim: .slim is the source for current code shape, while
 * memory is for durable design intent, workflows, and traps.
 *
 * Env vars:
 *   ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY - required for semantic brief
 *   ANTHROPIC_BASE_URL - optional, defaults to https://api.anthropic.com
 *   BOOTSTRAP_MODEL - optional, defaults to claude-haiku-4-5-20251001
 *   MEMORY_DIR - optional, defaults to <repo>/.claude/memory
 *   PROJECT_DIR - optional, defaults to process.cwd()
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd();
const MEMORY_DIR = process.env.MEMORY_DIR || path.join(PROJECT_DIR, '.claude', 'memory');
const BASE_URL = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
const API_KEY = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.BOOTSTRAP_MODEL || 'claude-haiku-4-5-20251001';
const MAX_BRIEF_TOKENS = 700;
const MAX_FILE_CHARS = 2400;
const MAX_INDEX_CHARS = 5000;
const MAX_DIGEST_CHARS = 5000;
const MAX_STALE_WARNINGS = 25;
let repoFilesCache = null;

function getArg(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

const QUERY = getArg('--query');

if (!QUERY) {
  console.log('(no query provided - nothing to retrieve)');
  process.exit(0);
}

function readIfExists(filePath, maxChars) {
  try {
    return fs.readFileSync(filePath, 'utf8').slice(0, maxChars);
  } catch {
    return '';
  }
}

function stripFrontmatter(content) {
  if (!content.startsWith('---')) return content.trim();
  const end = content.indexOf('\n---', 3);
  if (end === -1) return content.trim();
  return content.slice(end + 4).trim();
}

function collectMemoryFiles() {
  if (!fs.existsSync(MEMORY_DIR)) {
    return { index: '', files: {} };
  }

  const index = readIfExists(path.join(MEMORY_DIR, 'MEMORY.md'), MAX_INDEX_CHARS);
  const files = {};

  let entries = [];
  try {
    entries = fs.readdirSync(MEMORY_DIR)
      .filter((name) => name.endsWith('.md') && name !== 'MEMORY.md')
      .sort();
  } catch {
    entries = [];
  }

  for (const entry of entries) {
    const fullPath = path.join(MEMORY_DIR, entry);
    const body = stripFrontmatter(readIfExists(fullPath, MAX_FILE_CHARS + 500));
    files[entry] = body.slice(0, MAX_FILE_CHARS);
  }

  return { index, files };
}

function collectSlimDigest() {
  return readIfExists(path.join(PROJECT_DIR, '.slim', 'digest.md'), MAX_DIGEST_CHARS);
}

function collectRepoFiles() {
  if (repoFilesCache) return repoFilesCache;

  try {
    repoFilesCache = execFileSync(
      'git',
      ['ls-files'],
      { cwd: PROJECT_DIR, encoding: 'utf8', timeout: 5000 }
    )
      .split(/\r?\n/)
      .filter(Boolean)
      .map((file) => file.replace(/\\/g, '/'));
  } catch {
    repoFilesCache = [];
  }

  return repoFilesCache;
}

function resolveFileRef(ref, memoryFileNames) {
  const normalized = ref.replace(/\\/g, '/').replace(/^\.\/+/, '');

  if (memoryFileNames.has(normalized)) {
    return { status: 'memory-ref' };
  }

  if (normalized.includes('/')) {
    return fs.existsSync(path.join(PROJECT_DIR, normalized))
      ? { status: 'resolved', path: normalized }
      : { status: 'missing', path: normalized };
  }

  const matches = collectRepoFiles().filter((file) => path.posix.basename(file) === normalized);

  if (matches.length === 1) {
    return { status: 'resolved', path: matches[0] };
  }

  if (matches.length > 1) {
    return { status: 'ambiguous', path: normalized, matches };
  }

  return fs.existsSync(path.join(MEMORY_DIR, normalized))
    ? { status: 'memory-ref' }
    : { status: 'missing', path: normalized };
}

function gitLastCommitDate(fileRef) {
  const output = execFileSync(
    'git',
    ['log', '-1', '--format=%ci', '--', fileRef],
    { cwd: PROJECT_DIR, encoding: 'utf8', timeout: 3000 }
  ).trim();

  return output ? new Date(output) : null;
}

function gitHasUncommittedChanges(fileRef) {
  try {
    const output = execFileSync(
      'git',
      ['diff', '--name-only', '--', fileRef],
      { cwd: PROJECT_DIR, encoding: 'utf8', timeout: 2000 }
    ).trim();
    return Boolean(output);
  } catch {
    return false;
  }
}

function extractFileRefs(content) {
  const refs = new Set();
  const pattern = /`?([A-Za-z0-9_./\\-]+\.(?:ts|tsx|js|jsx|json|md|css|scss|html))`?/g;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    const ref = match[1].replace(/\\/g, '/');
    if (ref === 'MEMORY.md') continue;
    if (ref.startsWith('.claude/memory/')) continue;
    refs.add(ref);
  }

  return refs;
}

function checkStaleness(memoryFiles) {
  const warnings = [];
  const memoryFileNames = new Set(Object.keys(memoryFiles).concat('MEMORY.md'));

  for (const [memoryName, content] of Object.entries(memoryFiles)) {
    const memoryPath = path.join(MEMORY_DIR, memoryName);
    let memoryMtime = null;

    try {
      memoryMtime = fs.statSync(memoryPath).mtime;
    } catch {
      continue;
    }

    for (const ref of extractFileRefs(content)) {
      const resolved = resolveFileRef(ref, memoryFileNames);

      if (resolved.status === 'memory-ref') {
        continue;
      }

      if (resolved.status === 'ambiguous') {
        warnings.push({
          memory: memoryName,
          file: ref,
          reason: `ambiguous basename (${resolved.matches.slice(0, 4).join(', ')})`,
        });
        continue;
      }

      if (resolved.status === 'missing') {
        warnings.push({
          memory: memoryName,
          file: ref,
          reason: 'referenced file does not exist',
        });
        continue;
      }

      try {
        const lastCommitDate = gitLastCommitDate(resolved.path);
        if (lastCommitDate && lastCommitDate > memoryMtime) {
          warnings.push({
            memory: memoryName,
            file: resolved.path,
            reason: gitHasUncommittedChanges(resolved.path)
              ? 'file has uncommitted changes after this memory was written'
              : 'file was committed after this memory was written',
          });
        }
      } catch {
        // Ignore git lookup failures; the source existence check already ran.
      }
    }
  }

  return warnings;
}

async function generateBrief({ query, memoryIndex, memoryFiles, slimDigest }) {
  const fileEntries = Object.entries(memoryFiles)
    .map(([name, content]) => `## ${name}\n${content}`)
    .join('\n\n');

  const system = `You retrieve War-Civ project memory for a coding assistant.

Task:
${query}

Rules:
- Max ${MAX_BRIEF_TOKENS} tokens.
- Return only memory directly relevant to the task.
- If no memory is relevant, say exactly: (no relevant memories found)
- .slim and source code are authoritative for current code shape.
- Memory is useful only for design intent, architecture decisions, workflows, traps, testing practices, and user preferences.
- Do not repeat export lists, import graphs, or generic file inventories.
- If a memory appears likely stale, say so briefly.`;

  const user = `## Task
${query}

## .slim Digest Excerpt
${slimDigest || '(no .slim digest found)'}

## Memory Index
${memoryIndex || '(no memory index found)'}

## Memory Files
${fileEntries || '(no memory files found)'}

Return the concise relevant brief.`;

  const response = await fetch(`${BASE_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_BRIEF_TOKENS,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`API error ${response.status}: ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  return data.content && data.content[0] && data.content[0].text
    ? data.content[0].text
    : '(no response)';
}

async function main() {
  try {
    fs.readFileSync(0, 'utf8');
  } catch {
    // Compatible with hook-style stdin, but not required for direct command use.
  }

  const memory = collectMemoryFiles();
  const slimDigest = collectSlimDigest();
  const staleWarnings = checkStaleness(memory.files);

  if (staleWarnings.length > 0) {
    console.log(`Stale Memory Warnings (${staleWarnings.length} potentially outdated)`);
    for (const warning of staleWarnings.slice(0, MAX_STALE_WARNINGS)) {
      console.log(`- [${warning.memory}] ${warning.file}: ${warning.reason}`);
    }
    if (staleWarnings.length > MAX_STALE_WARNINGS) {
      console.log(`- ... ${staleWarnings.length - MAX_STALE_WARNINGS} more omitted; run /curate for targeted cleanup.`);
    }
    console.log('');
  }

  if (!API_KEY) {
    console.log('No Anthropic API key found; semantic memory retrieval skipped.');
    console.log(`Memory directory: ${MEMORY_DIR}`);
    console.log(`Query: ${QUERY}`);
    if (!Object.keys(memory.files).length) {
      console.log('(no memory files found)');
    }
    return;
  }

  try {
    const brief = await generateBrief({
      query: QUERY,
      memoryIndex: memory.index,
      memoryFiles: memory.files,
      slimDigest,
    });
    console.log(`Relevant Memories (for: ${QUERY})\n\n${brief}`);
  } catch (error) {
    console.error(`[memory-brief] warning: ${String(error.message || error).slice(0, 300)}`);
  }
}

main().catch(() => process.exit(0));
