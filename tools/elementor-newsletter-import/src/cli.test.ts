import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  APPROVED_SOURCE_ARTIFACT_SHA256,
  atomicPrivateJson,
  parseArguments,
  resolvePrivateInputPath,
  resolvePrivateOutputPath,
  run,
} from './cli.ts';
import { APPROVED_SOURCE_QUERY, APPROVED_SOURCE_QUERY_SHA256 } from './core.ts';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function privateTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(
    path.join(await realpath(tmpdir()), 'elementor-newsletter-test-'),
  );
  await chmod(directory, 0o700);
  temporaryDirectories.push(directory);
  return directory;
}

function syntheticSource(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    source: 'hostinger_phpmyadmin_select_only',
    sourceDatabase: 'u916712841_S5L96',
    sourceTables: ['wp_e_submissions', 'wp_e_submissions_values', 'wp_e_submissions_actions_log'],
    formDefinitionsEvidence: {
      source: 'wordpress_wxr___elementor_forms_snapshot',
      formIds: ['1678cc0a', '79f340c2'],
      emailFieldKey: 'email',
      firstNameFieldKey: 'field_5f9a09d',
    },
    capturedAt: '2026-09-02T18:00:00.000Z',
    querySha256: APPROVED_SOURCE_QUERY_SHA256,
    query: APPROVED_SOURCE_QUERY,
    rows: [],
  };
}

describe('Elementor newsletter dry-run CLI', () => {
  it('parses only explicit dry-run paths and has no source-hash override', () => {
    const options = parseArguments([
      '--input',
      '/tmp/source.json',
      '--plan',
      '/tmp/plan.json',
      '--report',
      '/tmp/report.json',
    ]);
    expect(options).toMatchObject({
      apply: false,
      inputPath: '/tmp/source.json',
      planPath: '/tmp/plan.json',
      reportPath: '/tmp/report.json',
    });
    expect(() =>
      parseArguments(['--expect-source-sha256', APPROVED_SOURCE_ARTIFACT_SHA256]),
    ).toThrow('Unknown option');
    expect(() => parseArguments(['--unknown'])).toThrow('Unknown option');
  });

  it('fails closed on every source except the fixed approved artifact', async () => {
    const directory = await privateTemporaryDirectory();
    const inputPath = path.join(directory, 'source.json');
    const planPath = path.join(directory, 'plan.json');
    const reportPath = path.join(directory, 'report.json');
    await writeFile(inputPath, `${JSON.stringify(syntheticSource(), null, 2)}\n`, {
      mode: 0o600,
    });

    await expect(
      run({ help: false, apply: false, inputPath, planPath, reportPath }),
    ).rejects.toThrow('source artifact SHA-256 does not match the approved fixed snapshot');
    await expect(stat(planPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(reportPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('writes local JSON atomically as an owner-only regular file', async () => {
    const directory = await privateTemporaryDirectory();
    const planPath = path.join(directory, 'plan.json');
    const reportPath = path.join(directory, 'report.json');
    await atomicPrivateJson(planPath, '--plan', { email: 'person@example.test' });
    await atomicPrivateJson(reportPath, '--report', {
      writesPerformed: false,
      noMailchimpConnection: true,
    });

    expect((await stat(planPath)).mode & 0o777).toBe(0o600);
    expect((await stat(reportPath)).mode & 0o777).toBe(0o600);
    expect(await readFile(planPath, 'utf8')).toContain('person@example.test');
    expect(await readFile(reportPath, 'utf8')).not.toContain('@example.test');
  });

  it('rejects input and output leaf symlinks', async () => {
    const directory = await privateTemporaryDirectory();
    const inputTarget = path.join(directory, 'source-target.json');
    const inputLink = path.join(directory, 'source-link.json');
    const outputTarget = path.join(directory, 'plan-target.json');
    const outputLink = path.join(directory, 'plan-link.json');
    await writeFile(inputTarget, '{}\n', { mode: 0o600 });
    await writeFile(outputTarget, '{}\n', { mode: 0o600 });
    await symlink(inputTarget, inputLink);
    await symlink(outputTarget, outputLink);

    await expect(resolvePrivateInputPath(inputLink)).rejects.toThrow(
      '--input cannot be a symbolic link',
    );
    await expect(resolvePrivateOutputPath(outputLink, '--plan')).rejects.toThrow(
      '--plan cannot be a symbolic link',
    );
  });

  it('rejects a symlink parent and an intermediate link resolving into Git', async () => {
    const directory = await privateTemporaryDirectory();
    const safeParent = path.join(directory, 'safe-parent');
    const parentLink = path.join(directory, 'parent-link');
    const repositoryLink = path.join(directory, 'repository-link');
    await mkdir(safeParent, { mode: 0o700 });
    await symlink(safeParent, parentLink);
    await symlink(REPOSITORY_ROOT, repositoryLink);

    await expect(
      resolvePrivateOutputPath(path.join(parentLink, 'plan.json'), '--plan'),
    ).rejects.toThrow('--plan parent cannot be a symbolic link');
    await expect(
      resolvePrivateOutputPath(path.join(repositoryLink, 'tools', 'blocked.json'), '--plan'),
    ).rejects.toThrow('--plan resolves inside the Git repository');
  });

  it('requires private existing directories and private existing output files', async () => {
    const directory = await privateTemporaryDirectory();
    const missingParentPath = path.join(directory, 'missing', 'plan.json');
    const existingPath = path.join(directory, 'existing.json');
    await writeFile(existingPath, '{}\n', { mode: 0o644 });

    await expect(resolvePrivateOutputPath(missingParentPath, '--plan')).rejects.toThrow(
      '--plan parent must already exist as a private directory',
    );
    await expect(resolvePrivateOutputPath(existingPath, '--plan')).rejects.toThrow(
      '--plan existing file must have mode 0600',
    );
    await chmod(existingPath, 0o600);
    await chmod(directory, 0o755);
    await expect(resolvePrivateOutputPath(existingPath, '--plan')).rejects.toThrow(
      '--plan parent must not grant group or world permissions',
    );
  });

  it('rejects canonical input, plan, and report path collisions before reading', async () => {
    const directory = await privateTemporaryDirectory();
    const inputPath = path.join(directory, 'source.json');
    const sharedOutputPath = path.join(directory, 'shared.json');
    await writeFile(inputPath, '{}\n', { mode: 0o600 });

    await expect(
      run({
        help: false,
        apply: false,
        inputPath,
        planPath: sharedOutputPath,
        reportPath: sharedOutputPath,
      }),
    ).rejects.toThrow('input, plan, and report canonical paths must be different');
    await expect(stat(sharedOutputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects apply before reading the source', async () => {
    await expect(
      run({
        help: false,
        apply: true,
        inputPath: '/missing/source.json',
        planPath: '/missing/plan.json',
        reportPath: '/missing/report.json',
      }),
    ).rejects.toThrow('--apply is intentionally unavailable');
  });
});
