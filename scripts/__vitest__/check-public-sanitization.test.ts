/**
 * Tests for the public-content gate (scripts/check-public-sanitization.mjs).
 *
 * This file is scanned by the gate like any other tracked file, so every
 * forbidden value below is assembled from fragments at runtime and none is
 * written out. The private identifier is synthetic, and so is its hash list.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { findingsForText, PRIVATE_ID_SHA256, runGate } from '../check-public-sanitization.mjs';

const SCRIPT = fileURLToPath(new URL('../check-public-sanitization.mjs', import.meta.url));
const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = dirname(dirname(SCRIPT));

// Forbidden shapes, built from fragments.
const HOME_PATH = ['', 'Users', 'someone', 'notes.txt'].join('/');
const SECRET_REF = `${'op:'}//${'Personal'}/Cloudflare/token`;
const ACCOUNT_HOST = ['acme-family', '1password', 'com'].join('.');
const TAILNET_HOST = ['db', 'fox-badger', 'ts', 'net'].join('.');
const SERVER_NAME = ['vps', '7'].join('-');
const BACKUP_PATH = ['', 'opt', '_backups', 'pre-deploy.tar.gz'].join('/');
const SCRIPT_PATH = ['', 'opt', 'scripts', 'deploy.sh'].join('/');
const OTHER_EMAIL = ['someone', 'corp.example.io'].join('@');

// A synthetic identifier and the hash list that knows it.
const SYNTHETIC_ID = '0123456789abcdef'.repeat(2);
const SYNTHETIC_HASHES = new Set([createHash('sha256').update(SYNTHETIC_ID).digest('hex')]);

const labels = (text: string, hashes?: Set<string>) =>
  findingsForText(text, hashes ? { privateIdHashes: hashes } : {}).map(
    (finding: { label: string }) => finding.label
  );

describe('findingsForText', () => {
  it('accepts placeholders, generic mentions and the public project identity', () => {
    const publishedContact = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'))
      .author as string;
    const accepted = [
      // The README sentence: the bare scheme in prose is not a reference.
      'with `op://` references in `env`) over literal tokens in config files.',
      'EMBEDDING_API_KEY=op://your-vault/item/field',
      'op://Your-Vault/Cloudflare/API-Token',
      'op://vault/item/field',
      'op://<vault>/<item>/<field>',
      '/Users/<name>/project',
      '/Users/you/project and /Users/username/',
      'sign in at my.1password.com or your-team.1password.com',
      'https://kg.your-tailnet.ts.net and example.ts.net',
      'a server named vps-<n>',
      '/opt/neo4j-kg/docker-compose.yml and /opt/scripts-archive',
      'user@example.com, dev@service.example, 12345+dev@users.noreply.github.com',
      publishedContact,
      'npx -y @henrychong-ai/mcp-neo4j-knowledge-graph@2.10.0',
      'Maintained by Henry Chong, github.com/henrychong-ai',
      'bolt://neo4j:password@localhost:7687',
    ];
    // The text is carried in the compared value so a failure names its line.
    expect(accepted.map(text => ({ text, labels: labels(text) }))).toEqual(
      accepted.map(text => ({ text, labels: [] }))
    );
  });

  it.each([
    ['personal home path', `cd ${HOME_PATH}`],
    ['personal home path', `${['', 'Users', 'someone'].join('/')}`],
    ['secret reference that is not a placeholder', `KEY=${SECRET_REF}`],
    ['named secret-manager account host', `--account ${ACCOUNT_HOST}`],
    ['tailnet host name', `https://${TAILNET_HOST}/dashboards/`],
    ['private server name', `deployed on ${SERVER_NAME} today`],
    ['private server name', `deployed on ${SERVER_NAME.toUpperCase()} today`],
    ['server deployment path', `backup at ${BACKUP_PATH}`],
    ['server deployment path', `run ${SCRIPT_PATH}`],
    ['email address outside the published contact', `contact ${OTHER_EMAIL}`],
  ])('flags a %s', (label, text) => {
    expect(labels(text)).toEqual([label]);
  });

  it('accepts an allowed email domain only on a whole-label match', () => {
    const flagged = ['email address outside the published contact'];
    const { author } = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
    const contactDomain = /@([^>]+)>/.exec(author)?.[1] as string;

    expect(labels(['someone', contactDomain.toUpperCase()].join('@'))).toEqual([]);
    expect(labels(['someone', `not-${contactDomain}`].join('@'))).toEqual(flagged);
    expect(labels(['someone', `mail.${contactDomain}`].join('@'))).toEqual(flagged);
    expect(labels(['someone', `${contactDomain}.example.io`].join('@'))).toEqual(flagged);
    expect(labels(['someone', 'notexample.com'].join('@'))).toEqual(flagged);
    expect(labels(['someone', 'fakeusers.noreply.github.com'].join('@'))).toEqual(flagged);
  });

  it('flags a hashed private identifier in either letter case', () => {
    expect(labels(`ACCOUNT_ID=${SYNTHETIC_ID}`, SYNTHETIC_HASHES)).toEqual([
      'known private identifier',
    ]);
    expect(labels(`/accounts/${SYNTHETIC_ID.toUpperCase()}/ai`, SYNTHETIC_HASHES)).toEqual([
      'known private identifier',
    ]);
  });

  it('ignores an identifier that is not on the hash list', () => {
    // The synthetic identifier is unknown to the built-in list.
    expect(labels(`ACCOUNT_ID=${SYNTHETIC_ID}`)).toEqual([]);
    expect(labels(`ACCOUNT_ID=${'f'.repeat(32)}`, SYNTHETIC_HASHES)).toEqual([]);
  });

  it('hashes only whole 32-character tokens', () => {
    // Part of a longer hexadecimal string (a commit or content hash) is not a token.
    expect(labels(`${SYNTHETIC_ID}deadbeef`, SYNTHETIC_HASHES)).toEqual([]);
    expect(labels(`deadbeef${SYNTHETIC_ID}`, SYNTHETIC_HASHES)).toEqual([]);
  });

  it('reports the line and the rule, never the matched text', () => {
    const findings = findingsForText(`first line\nsecond ${SYNTHETIC_ID}\n${SECRET_REF}`, {
      privateIdHashes: SYNTHETIC_HASHES,
    });
    expect(findings).toEqual([
      { line: 2, label: 'known private identifier' },
      { line: 3, label: 'secret reference that is not a placeholder' },
    ]);
  });

  it('reports a rule once per line', () => {
    expect(labels(`${SERVER_NAME} and ${SERVER_NAME}`)).toEqual(['private server name']);
  });

  it('keeps the built-in identifier list as SHA-256 digests only', () => {
    expect(PRIVATE_ID_SHA256.size).toBeGreaterThan(0);
    for (const entry of PRIVATE_ID_SHA256) {
      expect(entry).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('passes its own source and this test file, which are not exempt', () => {
    expect(findingsForText(readFileSync(SCRIPT, 'utf8'))).toEqual([]);
    expect(findingsForText(readFileSync(THIS_FILE, 'utf8'))).toEqual([]);
  });
});

describe('the gate on a git repository', () => {
  // Git variables set by a surrounding hook or rebase must not redirect the
  // commands below to another repository.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
  );
  const created: string[] = [];

  function makeRepo(files: Record<string, string>): string {
    const parent = mkdtempSync(join(tmpdir(), 'public-content-gate-'));
    created.push(parent);
    const repo = join(parent, 'repo');
    mkdirSync(repo);
    execFileSync('git', ['init', '-q'], { cwd: repo, env });
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(dirname(join(repo, name)), { recursive: true });
      writeFileSync(join(repo, name), content);
    }
    if (Object.keys(files).length > 0) {
      execFileSync('git', ['add', '-A'], { cwd: repo, env });
    }
    return repo;
  }

  const gate = (repo: string, options: Record<string, unknown> = {}) =>
    runGate({ cwd: repo, env, ...options }).findings;

  const cli = (repo: string, ...args: string[]) =>
    spawnSync(process.execPath, [SCRIPT, ...args], { cwd: repo, env, encoding: 'utf8' });

  afterEach(() => {
    for (const directory of created.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('passes a repository whose tracked files are clean', () => {
    const repo = makeRepo({ 'README.md': 'Use `op://` references.\n', 'src/a.ts': 'export {};\n' });

    expect(gate(repo)).toEqual([]);
    expect(gate(repo, { staged: true })).toEqual([]);
    const result = cli(repo);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('2 tracked files');
  });

  it('fails when a non-placeholder secret reference is added to a tracked file', () => {
    const repo = makeRepo({ 'README.md': 'Setup notes.\n' });
    expect(cli(repo).status).toBe(0);

    writeFileSync(join(repo, 'README.md'), `Setup notes.\nKEY=${SECRET_REF}\n`);

    expect(gate(repo)).toEqual(['README.md:2: secret reference that is not a placeholder']);
    const result = cli(repo);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('README.md:2: secret reference that is not a placeholder');
    // The log of a public repository is public: the value is not repeated.
    expect(result.stderr).not.toContain(SECRET_REF);
  });

  it('fails when the hashed identifier is added to a tracked file', () => {
    const repo = makeRepo({ 'docs/setup.md': 'Setup notes.\n' });
    expect(gate(repo, { privateIdHashes: SYNTHETIC_HASHES })).toEqual([]);

    writeFileSync(join(repo, 'docs/setup.md'), `Setup notes.\n\nACCOUNT_ID=${SYNTHETIC_ID}\n`);

    expect(gate(repo, { privateIdHashes: SYNTHETIC_HASHES })).toEqual([
      'docs/setup.md:3: known private identifier',
    ]);
    execFileSync('git', ['add', '-A'], { cwd: repo, env });
    expect(gate(repo, { privateIdHashes: SYNTHETIC_HASHES, staged: true })).toEqual([
      'docs/setup.md:3: known private identifier',
    ]);
  });

  it('reads staged content with --staged, even after the file is cleaned on disk', () => {
    const repo = makeRepo({ 'notes.md': `host ${SERVER_NAME}\n`, 'other file.md': 'fine\n' });
    writeFileSync(join(repo, 'notes.md'), 'host production\n');

    expect(gate(repo)).toEqual([]);
    expect(gate(repo, { staged: true })).toEqual(['notes.md:1: private server name']);
    expect(cli(repo).status).toBe(0);
    expect(cli(repo, '--staged').status).toBe(1);
  });

  it('reads the working tree by default, even when the staged copy is clean', () => {
    const repo = makeRepo({ 'notes.md': 'host production\n' });
    writeFileSync(join(repo, 'notes.md'), `host ${SERVER_NAME}\n`);

    expect(gate(repo)).toEqual(['notes.md:1: private server name']);
    expect(gate(repo, { staged: true })).toEqual([]);
  });

  it('leaves untracked files alone', () => {
    const repo = makeRepo({ 'README.md': 'fine\n' });
    writeFileSync(join(repo, 'LOCAL-NOTES.md'), `KEY=${SECRET_REF}\n`);

    expect(gate(repo)).toEqual([]);
    expect(gate(repo, { staged: true })).toEqual([]);
  });

  it('skips a tracked file that was deleted on disk, and still reads its staged copy', () => {
    const repo = makeRepo({ 'README.md': 'fine\n', 'gone.md': `KEY=${SECRET_REF}\n` });
    rmSync(join(repo, 'gone.md'));

    expect(gate(repo)).toEqual([]);
    expect(gate(repo, { staged: true })).toEqual([
      'gone.md:1: secret reference that is not a placeholder',
    ]);
  });

  it('checks file names as well as content', () => {
    const repo = makeRepo({ [`docs/${SERVER_NAME}-runbook.md`]: 'fine\n' });

    expect(gate(repo)).toEqual([`docs/${SERVER_NAME}-runbook.md: file name: private server name`]);
  });

  it('does not follow a symbolic link out of the repository', () => {
    const repo = makeRepo({ 'README.md': 'fine\n' });
    const outside = join(dirname(repo), 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'private.md'), `KEY=${SECRET_REF}\n`);
    symlinkSync('../outside/private.md', join(repo, 'link.md'));
    execFileSync('git', ['add', '-A'], { cwd: repo, env });

    // Git stores the link target, not the file behind it; that is what is read.
    expect(gate(repo)).toEqual([]);
    expect(gate(repo, { staged: true })).toEqual([]);
  });

  it('fails closed when it cannot run', () => {
    const empty = makeRepo({});
    expect(() => runGate({ cwd: empty, env })).toThrow(/no tracked files/);
    expect(cli(empty).status).toBe(2);

    const notARepository = dirname(empty);
    expect(cli(notARepository).status).toBe(2);

    const repo = makeRepo({ 'README.md': 'fine\n' });
    expect(cli(repo, '--no-such-option').status).toBe(2);
  });
});
