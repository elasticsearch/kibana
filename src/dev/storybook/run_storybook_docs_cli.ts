/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { run } from '@kbn/dev-cli-runner';
import { createFlagError } from '@kbn/dev-cli-errors';
import { buildStorybookDocsArtifacts, runStorybookDocsTestServer } from '@kbn/storybook';
import { storybookAliases } from './aliases';

run(
  async ({ flagsReader, log }) => {
    const [alias] = flagsReader.getPositionals();

    if (!alias) {
      throw createFlagError('Missing alias');
    }

    if (!Object.hasOwn(storybookAliases, alias)) {
      throw createFlagError(`Unknown alias [${alias}]`);
    }

    const build = flagsReader.boolean('build');
    const dev = flagsReader.boolean('dev');
    const serve = flagsReader.boolean('serve');

    if ([build, dev, serve].filter(Boolean).length !== 1) {
      throw createFlagError('Pass exactly one of --build, --dev, or --serve');
    }

    const port = flagsReader.number('port') ?? 6007;
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw createFlagError('Expected --port to be a valid port');
    }

    const configDir = storybookAliases[alias as keyof typeof storybookAliases];
    const baseUrl = flagsReader.string('base-url') ?? `http://127.0.0.1:${port}`;
    const skipStorybookBuild = flagsReader.boolean('skip-storybook-build');
    const includeAllStories = flagsReader.boolean('include-all-stories');

    if (serve) {
      await runStorybookDocsTestServer({
        alias,
        configDir,
        port,
        baseUrl,
        skipStorybookBuild,
        includeAllStories,
        log,
      });
      return;
    }

    const { archive, assetDir, registryUrl, manifest } = await buildStorybookDocsArtifacts({
      alias,
      configDir,
      baseUrl,
      skipStorybookBuild,
      includeAllStories,
      writeArchive: build,
      log,
    });

    log.info(`Docs asset directory: ${assetDir}`);
    log.info(`Docs registry: ${registryUrl}`);
    if (archive) {
      log.info(`Docs archive: ${archive.outputPath}`);
      log.info(`Docs archive integrity: ${archive.integrity}`);
      log.info(`Storybook sources manifest snippet:
sources:
  kibana:
    artifact: ${archive.outputPath}
    integrity: ${archive.integrity}`);
    }
    log.info(`Embeddable stories: ${manifest.stories.length}`);
  },
  {
    usage: `node scripts/storybook_docs <alias> (--build | --dev | --serve)`,
    description: `
      Build Storybook docs artifacts for an alias.

      Available aliases:
        ${Object.keys(storybookAliases)
          .map((alias) => `📕 ${alias}`)
          .join('\n        ')}
    `,
    flags: {
      string: ['base-url', 'port'],
      boolean: ['build', 'dev', 'include-all-stories', 'serve', 'skip-storybook-build'],
      help: `
      --build            Build docs registry, inline assets, and tarball.
      --dev              Build docs registry and inline assets without creating a tarball.
      --serve            Build docs artifacts and serve built_assets with CORS.
      --base-url         Base URL written into docs_registry.json. Defaults to http://127.0.0.1:<port>.
      --port             Local docs asset server port for --serve. Defaults to 6007.
      --include-all-stories
                         Include untagged stories in the generated docs registry.
      --skip-storybook-build
                         Reuse the existing static Storybook build.
    `,
    },
  }
);
