/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { run } from '@kbn/dev-cli-runner';
import { readKibanaConfig } from '../src/read_kibana_config';
import { resolveKibanaUrl } from '../src/util/resolve_kibana_url';
import { seedCodeSearch } from '../src/seed_code_search';
import { seedMemory } from '../src/seed_memory';
import { otelDemoConfig } from '../src/demos/otel_demo/config';
import { getCodeScenarioById } from '../src/code_scenarios';

run(
  async ({ log, flags }) => {
    const configPath = flags.config ? String(flags.config) : undefined;
    const version = flags.version ? String(flags.version) : otelDemoConfig.defaultVersion;
    const skipCodeSearch = Boolean(flags['skip-code-search']);
    const skipMemory = Boolean(flags['skip-memory']);
    const codeScenarioId = flags['code-scenario'] ? String(flags['code-scenario']) : undefined;

    if (codeScenarioId && !getCodeScenarioById(codeScenarioId)) {
      throw new Error(`Unknown code scenario: ${codeScenarioId}`);
    }

    const { elasticsearch, server, kibanaCredentials } = readKibanaConfig(log, configPath);

    const kibanaBaseUrl = `http://${server.host}:${server.port}`;
    const kibanaUrl = await resolveKibanaUrl(kibanaBaseUrl, log);

    if (!skipCodeSearch) {
      await seedCodeSearch({
        elasticsearch,
        kibanaCredentials,
        kibanaUrl,
        version,
        log,
        codeScenarioId,
      });
    } else {
      log.info('Skipping code search indexing (--skip-code-search)');
    }

    if (!skipMemory) {
      await seedMemory({
        kibanaUrl,
        username: kibanaCredentials.username,
        password: kibanaCredentials.password,
        log,
      });
    } else {
      log.info('Skipping memory seeding (--skip-memory)');
    }
  },
  {
    description: `
      Seeds demo extras for a running OTel demo environment:
        1. Indexes OTel demo source code into Elasticsearch via the scs CLI
           and installs SCS Agent Builder workflows into Kibana.
        2. Pre-seeds significant event memory pages with demo context.

      Run this after the demo is up (node scripts/otel_demo.js).
      Requires the \`scs\` CLI from https://github.com/elastic/semantic-code-search
      unless --skip-code-search is passed.
    `,
    flags: {
      string: ['config', 'version', 'code-scenario'],
      boolean: ['skip-code-search', 'skip-memory'],
      alias: { c: 'config', v: 'version' },
      default: { version: otelDemoConfig.defaultVersion },
      help: `
        --config, -c         Path to Kibana config file (defaults to config/kibana.dev.yml)
        --version, -v        OTel demo version whose source to index (default: ${otelDemoConfig.defaultVersion})
        --code-scenario      Index patched source for a code scenario id
        --skip-code-search   Skip cloning and indexing source code
        --skip-memory        Skip pre-seeding significant event memory pages
      `,
    },
  }
);
