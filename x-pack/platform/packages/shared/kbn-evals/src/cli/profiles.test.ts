/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Fs from 'fs';
import Os from 'os';
import Path from 'path';

import { envFromExportProfile } from './profiles';

const VAULT_DIR = 'x-pack/platform/packages/shared/kbn-evals/scripts/vault';

describe('envFromExportProfile', () => {
  let repoRoot: string;

  const writeConfig = (profile: string, config: unknown) => {
    const dir = Path.resolve(repoRoot, VAULT_DIR);
    Fs.mkdirSync(dir, { recursive: true });
    const fileName = profile === 'config' ? 'config.json' : `config.${profile}.json`;
    Fs.writeFileSync(Path.resolve(dir, fileName), JSON.stringify(config));
  };

  beforeEach(() => {
    repoRoot = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'kbn-evals-profiles-'));
  });

  afterEach(() => {
    Fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  it('points score ingest at the export profile target', () => {
    writeConfig('config', {
      evaluationsKbn: { url: 'https://golden.example.com', apiKey: 'golden-key' },
    });

    // Regression: an explicit export profile used to set only tracing vars, so
    // scores kept going to the default local Kibana while the run exited 0.
    expect(envFromExportProfile(repoRoot, 'config')).toMatchObject({
      EVAL_KBN_URL: 'https://golden.example.com',
      EVAL_KBN_API_KEY: 'golden-key',
    });
  });

  it('still carries tracing settings alongside the score target', () => {
    writeConfig('config', {
      evaluationsKbn: { url: 'https://golden.example.com', apiKey: 'golden-key' },
      tracingEs: { url: 'https://tracing.example.com', apiKey: 'tracing-key' },
    });

    expect(envFromExportProfile(repoRoot, 'config')).toMatchObject({
      EVAL_KBN_URL: 'https://golden.example.com',
      TRACING_ES_URL: 'https://tracing.example.com',
      TRACING_ES_API_KEY: 'tracing-key',
    });
  });

  it('ignores placeholder credentials rather than exporting to a bogus target', () => {
    writeConfig('config', {
      evaluationsKbn: { url: '<REPLACE_ME>', apiKey: '<REPLACE_ME>' },
    });

    const env = envFromExportProfile(repoRoot, 'config');

    expect(env).not.toHaveProperty('EVAL_KBN_URL');
    expect(env).not.toHaveProperty('EVAL_KBN_API_KEY');
  });

  it('returns nothing when no export profile is selected', () => {
    writeConfig('config', {
      evaluationsKbn: { url: 'https://golden.example.com', apiKey: 'golden-key' },
    });

    // Not selecting a profile must never implicitly export to the golden cluster.
    expect(envFromExportProfile(repoRoot, undefined)).toEqual({});
  });
});
