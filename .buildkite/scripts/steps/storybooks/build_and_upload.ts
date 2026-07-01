/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import pLimit from 'p-limit';
import {
  buildDocsArchive,
  buildDocsAssets,
  buildDocsRegistry,
} from '@kbn/storybook/src/lib/docs_assets';
import type {
  BuildDocsArchiveResult,
  BuildDocsRegistryResult,
} from '@kbn/storybook/src/lib/docs_assets';
import { storybookAliases } from '../../../../src/dev/storybook/aliases';
import { getKibanaDir } from '#pipeline-utils';

const GITHUB_CONTEXT = 'Build and Publish Storybooks';

const STORYBOOK_DIRECTORY =
  process.env.BUILDKITE_PULL_REQUEST && process.env.BUILDKITE_PULL_REQUEST !== 'false'
    ? `pr-${process.env.BUILDKITE_PULL_REQUEST}`
    : (process.env.BUILDKITE_BRANCH ?? '').replace('/', '__');
const STORYBOOK_BUCKET = 'ci-artifacts.kibana.dev/storybooks';
const STORYBOOK_BUCKET_URL = `https://${STORYBOOK_BUCKET}/${STORYBOOK_DIRECTORY}`;
const STORYBOOK_BASE_URL = `${STORYBOOK_BUCKET_URL}`;
const STORYBOOK_BUILD_DIR = path.join('.', 'built_assets');
const STORYBOOK_ASSET_DIR = path.join(STORYBOOK_BUILD_DIR, 'storybook');
const STORYBOOK_DOCS_DIRECTORY = 'storybook-docs';
const STORYBOOK_DOCS_BUILD_DIR = path.join(STORYBOOK_BUILD_DIR, STORYBOOK_DOCS_DIRECTORY);
const STORYBOOK_DOCS_BASE_URL = `${STORYBOOK_BUCKET_URL}/${STORYBOOK_DOCS_DIRECTORY}`;
const STORYBOOK_DOCS_REGISTRY_FILE = 'docs_registry.json';
const STORYBOOK_DOCS_REGISTRY_URL = `${STORYBOOK_DOCS_BASE_URL}/${STORYBOOK_DOCS_REGISTRY_FILE}`;
const STORYBOOK_DOCS_ARCHIVE_SHA = process.env.BUILDKITE_COMMIT || 'unknown';
const STORYBOOK_DOCS_ARCHIVE_FILE = 'storybook-docs.tar.gz';
const STORYBOOK_DOCS_ARCHIVE_PATH = path.join(STORYBOOK_BUILD_DIR, STORYBOOK_DOCS_ARCHIVE_FILE);
const STORYBOOK_DOCS_ARCHIVE_URL = `${STORYBOOK_BASE_URL}/${STORYBOOK_DOCS_ARCHIVE_FILE}`;

const exec = (...args: string[]) => execSync(args.join(' '), { stdio: 'inherit' });

const annotateStorybookDocsArtifacts = (
  archive: BuildDocsArchiveResult,
  registry: BuildDocsRegistryResult
) => {
  const annotation = [
    '### Storybook docs artifacts',
    '',
    `* Commit: \`${STORYBOOK_DOCS_ARCHIVE_SHA}\``,
    `* Registry: [${STORYBOOK_DOCS_REGISTRY_FILE}](${STORYBOOK_DOCS_REGISTRY_URL})`,
    `  * Integrity: \`${registry.integrity}\``,
    `* Tarball: [${STORYBOOK_DOCS_ARCHIVE_FILE}](${STORYBOOK_DOCS_ARCHIVE_URL})`,
    `  * Integrity: \`${archive.integrity}\``,
    '',
    '```yaml',
    'sources:',
    '  kibana:',
    `    registry: ${STORYBOOK_DOCS_REGISTRY_URL}`,
    `    integrity: ${registry.integrity}`,
    '```',
    '',
    '```yaml',
    'sources:',
    '  kibana:',
    `    artifact: ${STORYBOOK_DOCS_ARCHIVE_URL}`,
    `    integrity: ${archive.integrity}`,
    '```',
  ].join('\n');

  execSync('buildkite-agent annotate --style info --context storybook-docs-artifacts', {
    input: annotation,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
};

const buildStorybook = (storybook: string): Promise<{ logs: string }> => {
  return new Promise((resolve, reject) => {
    const logsBuffer: string[] = [];
    const handleBufferChunk = (chunk: Buffer) => {
      logsBuffer.push(chunk.toString());
    };

    const child = spawn('yarn', ['storybook', '--site', storybook], {
      stdio: 'pipe',
      env: {
        ...process.env,
        STORYBOOK_BASE_URL,
        NODE_OPTIONS: '--max-old-space-size=6144',
      },
    });

    child.stdout?.on('data', handleBufferChunk);
    child.stderr?.on('data', handleBufferChunk);

    child.on('close', (code) => {
      if (code === 0) {
        logsBuffer.unshift(`--- ✅ ${storybook} storybook\n`);
        resolve({ logs: logsBuffer.join('') });
      } else {
        logsBuffer.unshift(`--- ❌ ${storybook} storybook\n`);
        reject(new Error(logsBuffer.join('')));
      }
    });

    child.on('error', () => {
      logsBuffer.unshift(`--- ❌ ${storybook} storybook\n`);
      reject(new Error(logsBuffer.join('')));
    });
  });
};

const ghStatus = (state: string, description: string) =>
  exec(
    `gh api "repos/elastic/kibana/statuses/${process.env.BUILDKITE_COMMIT}"`,
    `-f state=${state}`,
    `-f target_url="${process.env.BUILDKITE_BUILD_URL}"`,
    `-f context="${GITHUB_CONTEXT}"`,
    `-f description="${description}"`,
    `--silent`
  );

const build = async (): Promise<{
  archive: BuildDocsArchiveResult;
  registry: BuildDocsRegistryResult;
}> => {
  console.log('--- Building Storybooks');

  const limit = pLimit(os.availableParallelism());
  const storybooks = Object.keys(storybookAliases);

  try {
    const results = await Promise.all(
      storybooks.map((storybook) => limit(() => buildStorybook(storybook)))
    );

    results.forEach(({ logs }) => {
      console.log(logs);
    });

    console.log('--- Generating Storybook docs assets');

    const docsManifests = await Promise.all(
      storybooks.map((storybook) =>
        limit(() =>
          buildDocsAssets({
            alias: storybook,
            storybookDir: path.join(STORYBOOK_ASSET_DIR, storybook),
            docsOutputDir: STORYBOOK_DOCS_BUILD_DIR,
            inlineBaseUrl: STORYBOOK_DOCS_BASE_URL,
            iframeBaseUrl: STORYBOOK_BASE_URL,
            renderMode: 'inline',
            configDir: storybookAliases[storybook as keyof typeof storybookAliases],
            buildInlineBundle: true,
          })
        )
      )
    );

    const registry = await buildDocsRegistry({
      aliases: storybooks,
      docsRootDir: STORYBOOK_DOCS_BUILD_DIR,
      baseUrl: STORYBOOK_DOCS_BASE_URL,
      build: {
        commit: process.env.BUILDKITE_COMMIT ?? '',
        branch: process.env.BUILDKITE_BRANCH ?? '',
        buildUrl: process.env.BUILDKITE_BUILD_URL,
      },
    });

    const archive = await buildDocsArchive({
      aliases: docsManifests
        .filter((manifest) => manifest.stories.length > 0)
        .map((manifest) => manifest.alias),
      docsRootDir: STORYBOOK_DOCS_BUILD_DIR,
      outputPath: STORYBOOK_DOCS_ARCHIVE_PATH,
    });

    return { archive, registry };
  } catch (error) {
    console.error(error);
    throw error;
  }
};

const upload = (archive: BuildDocsArchiveResult, registry: BuildDocsRegistryResult) => {
  const originalDirectory = process.cwd();
  const storybookDocsArchivePath = path.resolve(originalDirectory, STORYBOOK_DOCS_ARCHIVE_PATH);
  const activateScriptPath = path.join(
    getKibanaDir(),
    '.buildkite',
    'scripts',
    'common',
    'activate_service_account.sh'
  );
  try {
    console.log('--- Generating Storybooks HTML');

    process.chdir(STORYBOOK_ASSET_DIR);

    const storybooks = execSync(`ls -1d */`)
      .toString()
      .trim()
      .split('\n')
      .map((filePath) => filePath.replace('/', ''));

    const listHtml = storybooks
      .map((storybook) => `<li><a href="${STORYBOOK_BASE_URL}/${storybook}">${storybook}</a></li>`)
      .join('\n');

    const html = `
      <html>
        <body>
          <h1>Storybooks</h1>
          <ul>
            ${listHtml}
          </ul>
        </body>
      </html>
    `;

    fs.writeFileSync('index.html', html);

    console.log('--- Uploading Storybooks');
    exec(`
      ${path.relative(process.cwd(), activateScriptPath)} gs://ci-artifacts.kibana.dev
      gcloud storage cp --cache-control="no-cache, max-age=0, no-transform" --gzip-local=js,css,html,json,map,txt,svg --recursive --no-user-output-enabled '*' 'gs://${STORYBOOK_BUCKET}/${STORYBOOK_DIRECTORY}/'
      gcloud storage cp --cache-control="no-cache, max-age=0, no-transform" --no-user-output-enabled '${storybookDocsArchivePath}' 'gs://${STORYBOOK_BUCKET}/${STORYBOOK_DIRECTORY}/${STORYBOOK_DOCS_ARCHIVE_FILE}'
      gcloud storage cp --cache-control="no-cache, max-age=0, no-transform" --gzip-local=html --no-user-output-enabled 'index.html' 'gs://${STORYBOOK_BUCKET}/${STORYBOOK_DIRECTORY}/latest/'
    `);

    console.log('--- Uploading Storybook docs assets');
    process.chdir(originalDirectory);
    process.chdir(STORYBOOK_DOCS_BUILD_DIR);
    exec(`
      ${path.relative(process.cwd(), activateScriptPath)} gs://ci-artifacts.kibana.dev
      gcloud storage cp --cache-control="no-cache, max-age=0, no-transform" --gzip-local=js,css,html,json,map,txt,svg --recursive --no-user-output-enabled '*' 'gs://${STORYBOOK_BUCKET}/${STORYBOOK_DIRECTORY}/${STORYBOOK_DOCS_DIRECTORY}/'
    `);

    annotateStorybookDocsArtifacts(archive, registry);

    if (process.env.BUILDKITE_PULL_REQUEST && process.env.BUILDKITE_PULL_REQUEST !== 'false') {
      exec(
        `buildkite-agent meta-data set pr_comment:storybooks:head '* [Storybooks Preview](${STORYBOOK_BASE_URL})'`
      );
    }
  } finally {
    process.chdir(originalDirectory);
  }
};

(async () => {
  try {
    ghStatus('pending', 'Building Storybooks');
    const { archive, registry } = await build();
    upload(archive, registry);
    ghStatus('success', 'Storybooks built');
  } catch (error) {
    ghStatus('error', 'Building Storybooks failed');
    throw error;
  }
})();
