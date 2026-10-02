#!/usr/bin/env node

/**
 * Public-content gate.
 *
 * This repository is public. The gate reads every git-tracked file and fails
 * when one of them carries content that belongs only on the maintainer's own
 * machines: a personal home path, a secret-manager reference that is not a
 * placeholder, a named secret-manager account host, a private network host
 * name, a private server name, a server deployment path, an email address
 * outside the published contact, or a known private identifier.
 *
 * Usage:
 *   node scripts/check-public-sanitization.mjs            # working-tree content
 *   node scripts/check-public-sanitization.mjs --staged   # staged (index) content
 *
 * The default mode reads each tracked file from the working tree. `--staged`
 * reads what is in the index instead, which is what the next commit will
 * contain; the pre-commit hook uses it so that a file staged with private
 * content and then cleaned up on disk is still refused.
 *
 * Rules for editing this file:
 *   - Never write a private value here, in the tests, or in a comment. Exact
 *     identifiers are held as SHA-256 hashes; everything else is matched by
 *     shape.
 *   - This file and its tests are scanned like any other tracked file, so
 *     describe a forbidden shape in words rather than writing one out.
 *   - A finding names the file, the line and the rule. It never repeats the
 *     matched text, because CI logs of a public repository are public too.
 *
 * Out of reach by design: untracked and git-ignored files, commit messages,
 * and history. Content is read as UTF-8; other encodings are not decoded.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * SHA-256 of each known private identifier (lowercase, 32 hexadecimal
 * characters). Every 32-character hexadecimal token in a file is hashed and
 * compared with this list, so the identifiers themselves never appear here.
 */
export const PRIVATE_ID_SHA256 = new Set([
  // Cloud account identifier
  'f3fa5166288a577c5af1fb960aaa50e7365252518480a497f7e2fc3ea6e4d12c',
  // DNS zone identifier
  '865fb999316b80ffffda4f0a746cc458036d4fb7da9d1eb50f734cd834658f41',
]);

/** Home-directory names that are plainly placeholders. */
const HOME_PLACEHOLDERS = new Set([
  'you',
  'yourname',
  'your-name',
  'your-username',
  'your_username',
  'username',
  'user',
  'name',
  'me',
  'example',
  'shared',
]);

/** First path segment (the vault) of a secret reference that is a placeholder. */
const PLACEHOLDER_VAULT = /^(?:your[-_]|example|placeholder|vault(?:[-_]name)?$)/i;

/** Sign-in hosts every account shares, plus placeholder names. */
const GENERIC_ACCOUNT_HOST =
  /^(?:my|www|start|support|developer|app|status|blog|downloads|your-.*|example.*)$/i;

/** Tailnet labels that are plainly placeholders. */
const PLACEHOLDER_TAILNET = /^(?:your-|example|tailnet)/i;

/**
 * Email domains that may appear. The reserved documentation names (RFC 2606
 * and RFC 6761) and GitHub's no-reply addresses are accepted with any
 * subdomain. The contact address this package publishes in package.json and
 * SECURITY.md is accepted on an exact domain match only.
 */
const RESERVED_EMAIL_DOMAINS = [
  'example.com',
  'example.org',
  'example.net',
  'example',
  'test',
  'invalid',
  'localhost',
  'users.noreply.github.com',
];
const PUBLISHED_CONTACT_DOMAIN = 'henrychong.ai';

function emailDomainAllowed(domain) {
  const lower = domain.toLowerCase();
  return (
    lower === PUBLISHED_CONTACT_DOMAIN ||
    RESERVED_EMAIL_DOMAINS.some(reserved => lower === reserved || lower.endsWith(`.${reserved}`))
  );
}

/**
 * Shape rules. `pattern` must be global; `allow` receives the match and returns
 * true when it is a placeholder or a generic mention.
 */
const SHAPE_RULES = [
  {
    label: 'personal home path',
    pattern: /\/Users\/([A-Za-z0-9._-]+)(?![A-Za-z0-9._-])/g,
    allow: match => HOME_PLACEHOLDERS.has(match[1].toLowerCase()),
  },
  {
    label: 'secret reference that is not a placeholder',
    // The bare scheme in prose has no vault segment after it and does not match.
    pattern: /\bop:\/\/([A-Za-z0-9][^\s/`"'<>)\]},;]*)/g,
    allow: match => PLACEHOLDER_VAULT.test(match[1]),
  },
  {
    label: 'named secret-manager account host',
    pattern: /\b([a-z0-9-]+)\.1password\.(?:com|eu|ca)\b/gi,
    allow: match => GENERIC_ACCOUNT_HOST.test(match[1]),
  },
  {
    label: 'tailnet host name',
    pattern: /\b([a-z0-9-]+)\.ts\.net\b/gi,
    allow: match => PLACEHOLDER_TAILNET.test(match[1]),
  },
  {
    label: 'private server name',
    pattern: /\bvps-\d+\b/gi,
  },
  {
    label: 'server deployment path',
    pattern: /\/opt\/(?:_backups|scripts)(?![A-Za-z0-9_-])/g,
  },
  {
    label: 'email address outside the published contact',
    pattern: /[A-Za-z0-9._%+-]+@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})/g,
    allow: match => emailDomainAllowed(match[1]),
  },
];

const HEX_32_TOKEN = /(?<![0-9a-fA-F])[0-9a-fA-F]{32}(?![0-9a-fA-F])/g;
const PRIVATE_ID_LABEL = 'known private identifier';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Find forbidden content in one piece of text.
 *
 * @param {string} text
 * @param {{ privateIdHashes?: Set<string> }} [options]
 * @returns {{ line: number, label: string }[]} one entry per rule per line
 */
export function findingsForText(text, options = {}) {
  const privateIdHashes = options.privateIdHashes ?? PRIVATE_ID_SHA256;
  const hits = [];

  for (const rule of SHAPE_RULES) {
    for (const match of text.matchAll(rule.pattern)) {
      if (rule.allow?.(match)) continue;
      hits.push({ index: match.index, label: rule.label });
    }
  }
  for (const match of text.matchAll(HEX_32_TOKEN)) {
    if (privateIdHashes.has(sha256(match[0].toLowerCase()))) {
      hits.push({ index: match.index, label: PRIVATE_ID_LABEL });
    }
  }

  const seen = new Set();
  const findings = [];
  for (const hit of hits.toSorted((a, b) => a.index - b.index)) {
    const line = text.slice(0, hit.index).split('\n').length;
    const key = `${line}:${hit.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({ line, label: hit.label });
  }
  return findings;
}

const MAX_GIT_OUTPUT = 1024 ** 3;

function git(args, cwd, env, input) {
  return execFileSync('git', args, {
    cwd,
    env,
    input,
    maxBuffer: MAX_GIT_OUTPUT,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/** Top-level directory of the repository that contains `cwd`. */
export function repositoryRoot(cwd = process.cwd(), env = process.env) {
  return git(['rev-parse', '--show-toplevel'], cwd, env)
    .toString('utf8')
    .replace(/\r?\n$/, '');
}

/** Every path in the index (tracked files, including newly staged ones). */
export function trackedFiles(root, env = process.env) {
  const names = git(['ls-files', '--cached', '-z'], root, env)
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  // An unmerged path is listed once per stage.
  return [...new Set(names)];
}

/**
 * Working-tree content of a tracked file, or null when there is nothing to
 * read (deleted on disk, or not a regular file). A symbolic link is never
 * followed: its target path is the content git stores, so that is what is
 * scanned.
 */
function readWorkingTree(root, file) {
  const path = join(root, file);
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
  if (stat.isSymbolicLink()) return Buffer.from(readlinkSync(path));
  if (!stat.isFile()) return null;
  return readFileSync(path);
}

/**
 * Staged content of every file, read with one `git cat-file --batch`.
 *
 * @returns {Map<string, Buffer | null | undefined>} a Buffer for a blob, null
 *   for an entry with no blob to scan (a submodule link), undefined when the
 *   staged content could not be read (an unmerged path).
 */
function readStaged(root, files, env) {
  const contents = new Map();
  if (files.length === 0) return contents;
  const input = files.map(file => `:0:${file}\n`).join('');
  const output = git(['cat-file', '--batch'], root, env, input);
  let offset = 0;
  for (const file of files) {
    const headerEnd = output.indexOf(0x0a, offset);
    if (headerEnd === -1) throw new Error('unexpected end of git cat-file output');
    const header = output.subarray(offset, headerEnd).toString('utf8');
    offset = headerEnd + 1;
    const parts = header.split(' ');
    const size = Number(parts.at(-1));
    const type = parts.at(-2);
    if (header.endsWith(' missing') || !Number.isInteger(size)) {
      contents.set(file, undefined);
      continue;
    }
    contents.set(file, type === 'blob' ? output.subarray(offset, offset + size) : null);
    offset += size + 1;
  }
  return contents;
}

/**
 * Run the gate over a repository.
 *
 * @param {{
 *   cwd?: string,
 *   staged?: boolean,
 *   privateIdHashes?: Set<string>,
 *   env?: NodeJS.ProcessEnv,
 * }} [options]
 * @returns {{ findings: string[], fileCount: number }}
 */
export function runGate(options = {}) {
  const env = options.env ?? process.env;
  const root = repositoryRoot(options.cwd ?? process.cwd(), env);
  const files = trackedFiles(root, env);
  if (files.length === 0) {
    throw new Error(`no tracked files found in ${root}; refusing to report a pass`);
  }

  const textOptions = { privateIdHashes: options.privateIdHashes ?? PRIVATE_ID_SHA256 };
  const findings = [];
  // A newline in a path cannot be passed to `git cat-file --batch`.
  const scannable = [];
  for (const file of files) {
    if (file.includes('\n')) {
      findings.push('(a tracked path contains a line break and cannot be scanned)');
      continue;
    }
    scannable.push(file);
    for (const finding of findingsForText(file, textOptions)) {
      findings.push(`${file}: file name: ${finding.label}`);
    }
  }

  const staged = options.staged ? readStaged(root, scannable, env) : undefined;
  for (const file of scannable) {
    const content = staged ? staged.get(file) : readWorkingTree(root, file);
    if (content === undefined) {
      findings.push(`${file}: staged content could not be read`);
      continue;
    }
    if (content === null) continue;
    for (const finding of findingsForText(content.toString('utf8'), textOptions)) {
      findings.push(`${file}:${finding.line}: ${finding.label}`);
    }
  }
  return { findings, fileCount: files.length };
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

function main(args) {
  const unknown = args.filter(arg => arg !== '--staged');
  if (unknown.length > 0) {
    console.error(`Public-content gate: unknown argument ${unknown.join(' ')}`);
    return 2;
  }
  const staged = args.includes('--staged');
  let result;
  try {
    result = runGate({ staged });
  } catch (error) {
    // Fail closed: a gate that could not run has not passed.
    console.error(`Public-content gate could not run: ${error.message}`);
    return 2;
  }
  const source = staged ? 'staged content' : 'working tree';
  if (result.findings.length > 0) {
    console.error(
      [
        `Public-content gate failed (${source}):`,
        ...result.findings.map(finding => `- ${finding}`),
        '',
        'This repository is public. Replace each value with a placeholder, or move the',
        'note to the untracked CLAUDE.local.md. Do not bypass the gate.',
      ].join('\n')
    );
    return 1;
  }
  console.log(`Public-content gate passed (${result.fileCount} tracked files, ${source}).`);
  return 0;
}

if (isMainModule()) {
  process.exitCode = main(process.argv.slice(2));
}
