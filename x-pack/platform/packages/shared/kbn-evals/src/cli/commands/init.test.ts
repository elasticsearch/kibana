/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Fs from 'fs';
import Os from 'os';
import Path from 'path';
import { ToolingLog } from '@kbn/tooling-log';
import { ensureLocalConfig } from './init';

// Scout binds 5620/9220; `yarn start` uses 5601/9200. A config carrying the
// `yarn start` values against a Scout stack fails every request, which is how
// this shipped: `evals start` wrote 5601 while Scout served 5620.
const SCOUT_KBN = 'http://localhost:5620';
const SCOUT_ES = 'http://localhost:9220';

const writeScoutConfig = (repoRoot: string) => {
  const dir = Path.join(repoRoot, '.scout/servers');
  Fs.mkdirSync(dir, { recursive: true });
  Fs.writeFileSync(
    Path.join(dir, 'local.json'),
    JSON.stringify({ hosts: { kibana: SCOUT_KBN, elasticsearch: SCOUT_ES } })
  );
};

const vaultConfigPath = (repoRoot: string) =>
  Path.join(repoRoot, 'x-pack/platform/packages/shared/kbn-evals/scripts/vault/config.local.json');

const readVaultConfig = (repoRoot: string) =>
  JSON.parse(Fs.readFileSync(vaultConfigPath(repoRoot), 'utf-8'));

const seedVaultConfig = (repoRoot: string, config: Record<string, unknown>) => {
  const target = vaultConfigPath(repoRoot);
  Fs.mkdirSync(Path.dirname(target), { recursive: true });
  Fs.writeFileSync(target, JSON.stringify(config, null, 2));
};

describe('ensureLocalConfig', () => {
  let repoRoot: string;
  let log: ToolingLog;

  beforeEach(() => {
    repoRoot = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'kbn-evals-init-'));
    log = new ToolingLog();
    writeScoutConfig(repoRoot);
  });

  afterEach(() => {
    Fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  describe('when no config exists', () => {
    it('writes Scout ports rather than the yarn start defaults', async () => {
      await ensureLocalConfig(repoRoot, log);

      const config = readVaultConfig(repoRoot);
      expect(config.evaluationsKbn.url).toContain('localhost:5620');
      expect(config.evaluationsEs.url).toContain('localhost:9220');
      expect(config.evaluationsKbn.url).not.toContain('5601');
      expect(config.evaluationsEs.url).not.toContain('9200');
    });

    it('does not append the /dev base path, which 404s on Scout', async () => {
      await ensureLocalConfig(repoRoot, log);

      expect(readVaultConfig(repoRoot).evaluationsKbn.url).not.toContain('/dev');
    });

    it('keeps credentials in the URL', async () => {
      await ensureLocalConfig(repoRoot, log);

      expect(readVaultConfig(repoRoot).evaluationsKbn.url).toContain('elastic:changeme@');
    });

    it('falls back to defaults when Scout has not written a config', async () => {
      Fs.rmSync(Path.join(repoRoot, '.scout'), { recursive: true, force: true });

      await ensureLocalConfig(repoRoot, log);

      expect(readVaultConfig(repoRoot).evaluationsKbn.url).toContain('5601');
    });
  });

  describe('when a stale config already exists', () => {
    // The original bug: existence alone was treated as validity, so a config
    // pointing at a dead port survived every subsequent run.
    beforeEach(() => {
      seedVaultConfig(repoRoot, {
        description: 'kbn-evals local config',
        owner: 'someone@example.com',
        environment: 'local',
        evaluationsKbn: { url: 'http://elastic:changeme@localhost:5601/dev', apiKey: '' },
        evaluationsEs: { url: 'http://elastic:changeme@localhost:9200', apiKey: '' },
        tracingEs: { url: 'http://elastic:changeme@localhost:9200', apiKey: '' },
      });
    });

    it('realigns stale hosts to the running Scout stack', async () => {
      await ensureLocalConfig(repoRoot, log);

      const config = readVaultConfig(repoRoot);
      expect(config.evaluationsKbn.url).toContain('localhost:5620');
      expect(config.evaluationsEs.url).toContain('localhost:9220');
      expect(config.tracingEs.url).toContain('localhost:9220');
    });

    it('strips the /dev base path that Scout does not serve', async () => {
      await ensureLocalConfig(repoRoot, log);

      expect(readVaultConfig(repoRoot).evaluationsKbn.url).not.toContain('/dev');
    });

    it('preserves credentials and unrelated fields', async () => {
      await ensureLocalConfig(repoRoot, log);

      const config = readVaultConfig(repoRoot);
      expect(config.evaluationsKbn.url).toContain('elastic:changeme@');
      expect(config.owner).toBe('someone@example.com');
      expect(config.description).toBe('kbn-evals local config');
    });

    it('leaves an already-correct config untouched', async () => {
      seedVaultConfig(repoRoot, {
        owner: 'someone@example.com',
        environment: 'local',
        evaluationsKbn: { url: `http://elastic:changeme@localhost:5620`, apiKey: '' },
        evaluationsEs: { url: `http://elastic:changeme@localhost:9220`, apiKey: '' },
        tracingEs: { url: `http://elastic:changeme@localhost:9220`, apiKey: '' },
      });
      const before = Fs.readFileSync(vaultConfigPath(repoRoot), 'utf-8');

      await ensureLocalConfig(repoRoot, log);

      expect(Fs.readFileSync(vaultConfigPath(repoRoot), 'utf-8')).toBe(before);
    });

    it('leaves the config alone when Scout is not running', async () => {
      Fs.rmSync(Path.join(repoRoot, '.scout'), { recursive: true, force: true });

      await ensureLocalConfig(repoRoot, log);

      expect(readVaultConfig(repoRoot).evaluationsKbn.url).toContain('5601');
    });
  });
});
