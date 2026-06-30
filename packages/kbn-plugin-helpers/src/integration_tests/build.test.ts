/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';
import Fs from 'fs';
import { loadJsonFile } from '@kbn/utils';

import execa from 'execa';
import { REPO_ROOT } from '@kbn/repo-info';
import { createStripAnsiSerializer, createReplaceSerializer } from '@kbn/jest-serializers';
import extract from 'extract-zip';
import del from 'del';
import globby from 'globby';

const PLUGIN_DIR = Path.resolve(REPO_ROOT, 'plugins/foo_test_plugin');
const PLUGIN_BUILD_DIR = Path.resolve(PLUGIN_DIR, 'build');
const PLUGIN_ARCHIVE = Path.resolve(PLUGIN_BUILD_DIR, `fooTestPlugin-7.5.0.zip`);
const TMP_DIR = Path.resolve(__dirname, '__tmp__');

expect.addSnapshotSerializer(createReplaceSerializer(/[\d\.]+ sec/g, '<time>'));
expect.addSnapshotSerializer(createReplaceSerializer(/\d+(\.\d+)?[sm]/g, '<time>'));
expect.addSnapshotSerializer(createReplaceSerializer(/yarn (\w+) v[\d\.]+/g, 'yarn $1 <version>'));
expect.addSnapshotSerializer(createStripAnsiSerializer());

describe('scripts/generate_plugin', () => {
  beforeEach(async () => {
    await del([PLUGIN_DIR, TMP_DIR]);
    Fs.mkdirSync(TMP_DIR);
  });
  afterEach(async () => await del([PLUGIN_DIR, TMP_DIR]));

  it('builds a generated plugin into a viable archive', async () => {
    // extendEnv merges process.env then this object; must override CI's KBN_USE_RSPACK=true
    const legacyOptimizerEnv = {
      ...process.env,
      KBN_USE_RSPACK: '',
    };

    const generateProc = await execa(
      process.execPath,
      ['scripts/generate_plugin', '-y', '--name', 'fooTestPlugin'],
      {
        cwd: REPO_ROOT,
        all: true,
        env: legacyOptimizerEnv,
      }
    );
    const filterLogs = (logs: string | undefined) => {
      return logs
        ?.split('\n')
        .filter((l) => !l.includes('failed to reach ci-stats service'))
        .join('\n');
    };

    expect(filterLogs(generateProc.all)).toMatchInlineSnapshot(`
    " succ 🎉

          Your plugin has been created in plugins/foo_test_plugin
    "
  `);

    const buildProc = await execa(
      process.execPath,
      ['../../scripts/plugin_helpers', 'build', '--kibana-version', '7.5.0'],
      {
        cwd: PLUGIN_DIR,
        all: true,
        env: legacyOptimizerEnv,
      }
    );

    expect(filterLogs(buildProc.all)).toMatchInlineSnapshot(`
    " info deleting the build and target directories
     info building required artifacts for the optimizer
     info running @kbn/optimizer
     │ succ browser bundle created at plugins/foo_test_plugin/build/kibana/fooTestPlugin/target/public
     │ info stopping @kbn/optimizer
     info compressing js and css bundles found at plugins/foo_test_plugin/build/kibana/fooTestPlugin/target/public to brotli
     info copying assets from \`public/assets\` to build
     info copying server source into the build and converting with babel
     info running yarn to install dependencies
     info compressing plugin into [fooTestPlugin-7.5.0.zip]
     succ plugin archive created"
  `);

    await extract(PLUGIN_ARCHIVE, { dir: TMP_DIR });

    const files = await globby(['**/*'], { cwd: TMP_DIR, dot: true });
    files.sort((a, b) => a.localeCompare(b));

    expect(files).toMatchInlineSnapshot(`
    Array [
      "kibana/fooTestPlugin/.i18nrc.json",
      "kibana/fooTestPlugin/common/index.js",
      "kibana/fooTestPlugin/kibana.json",
      "kibana/fooTestPlugin/node_modules/.yarn-integrity",
      "kibana/fooTestPlugin/package.json",
      "kibana/fooTestPlugin/server/index.js",
      "kibana/fooTestPlugin/server/plugin.js",
      "kibana/fooTestPlugin/server/routes/index.js",
      "kibana/fooTestPlugin/server/types.js",
      "kibana/fooTestPlugin/target/public/fooTestPlugin.chunk.998.js",
      "kibana/fooTestPlugin/target/public/fooTestPlugin.chunk.998.js.br",
      "kibana/fooTestPlugin/target/public/fooTestPlugin.plugin.js",
      "kibana/fooTestPlugin/target/public/fooTestPlugin.plugin.js.br",
      "kibana/fooTestPlugin/translations/ja-JP.json",
      "kibana/fooTestPlugin/tsconfig.json",
    ]
  `);

    expect(loadJsonFile(Path.resolve(TMP_DIR, 'kibana', 'fooTestPlugin', 'kibana.json')))
      .toMatchInlineSnapshot(`
    Object {
      "description": "",
      "id": "fooTestPlugin",
      "kibanaVersion": "7.5.0",
      "optionalPlugins": Array [],
      "owner": Object {
        "githubTeam": "",
        "name": "",
      },
      "requiredPlugins": Array [],
      "server": true,
      "ui": true,
      "version": "1.0.0",
    }
  `);
  });

  /**
   * [rspack-transition] This test verifies the rspack build path in plugin-helpers.
   * Once the legacy webpack optimizer is removed, this should become the only build test
   * and the KBN_USE_RSPACK env gate should be removed from cli.ts.
   */
  it('builds a generated plugin with rspack when KBN_USE_RSPACK is set', async () => {
    await execa(process.execPath, ['scripts/generate_plugin', '-y', '--name', 'fooTestPlugin'], {
      cwd: REPO_ROOT,
      all: true,
    });

    const filterLogs = (logs: string | undefined) => {
      return logs
        ?.split('\n')
        .filter((l) => !l.includes('failed to reach ci-stats service'))
        .join('\n');
    };

    const buildProc = await execa(
      process.execPath,
      ['../../scripts/plugin_helpers', 'build', '--kibana-version', '7.5.0'],
      {
        cwd: PLUGIN_DIR,
        all: true,
        env: {
          ...process.env,
          KBN_USE_RSPACK: 'true',
        },
      }
    );

    const logs = filterLogs(buildProc.all) ?? '';
    expect(logs).toContain('Using RSPack optimizer');
    expect(logs).toContain('browser bundle created');
    expect(logs).toContain('plugin archive created');

    await extract(PLUGIN_ARCHIVE, { dir: TMP_DIR });

    const files = await globby(['**/*'], { cwd: TMP_DIR, dot: true });

    const publicFiles = files.filter((f) => f.includes('target/public/'));
    expect(publicFiles.length).toBeGreaterThanOrEqual(1);

    const mainBundle = publicFiles.find(
      (f) => f.endsWith('.plugin.js') || f.endsWith('.plugin.js.br')
    );
    expect(mainBundle).toBeDefined();

    const serverFiles = files.filter((f) => f.includes('server/'));
    expect(serverFiles.length).toBeGreaterThan(0);

    expect(
      loadJsonFile(Path.resolve(TMP_DIR, 'kibana', 'fooTestPlugin', 'kibana.json'))
    ).toMatchObject({
      id: 'fooTestPlugin',
      kibanaVersion: '7.5.0',
      server: true,
      ui: true,
    });
  });
});
