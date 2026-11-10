import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const scriptPath = fileURLToPath(new URL('../../scripts/setup-env.js', import.meta.url));
let tempDirectory: string | undefined;

afterEach(() => {
  if (tempDirectory) rmSync(tempDirectory, { recursive: true, force: true });
  tempDirectory = undefined;
});

describe('setup-env script', () => {
  it('preserves existing secrets and custom variables with private file permissions', () => {
    tempDirectory = mkdtempSync(join(tmpdir(), 'destiny-env-'));
    writeFileSync(join(tempDirectory, '.env'), 'DISCORD_TOKEN=keep-this-token\nCUSTOM_VALUE=keep-this-setting\n');
    execFileSync(process.execPath, [scriptPath], {
      cwd: tempDirectory,
      env: { PATH: process.env.PATH || '', NODE_ENV: 'test' },
      stdio: 'pipe',
    });

    const contents = readFileSync(join(tempDirectory, '.env'), 'utf8');
    expect(contents).toContain('DISCORD_TOKEN=keep-this-token');
    expect(contents).toContain('CUSTOM_VALUE=keep-this-setting');
    expect(statSync(join(tempDirectory, '.env')).mode & 0o777).toBe(0o600);
  });
});
