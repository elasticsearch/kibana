/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

require('@kbn/setup-node-env');
// eslint-disable-next-line import/no-nodejs-modules
const { join, resolve } = require('path');
const { generate } = require('@kbn/openapi-generator');
const { REPO_ROOT } = require('@kbn/repo-info');

const ROOT = resolve(__dirname, '..');

(async () => {
  await generate({
    title: 'OpenAPI Lists API Schemas',
    rootDir: ROOT,
    sourceGlob: './api/**/*.schema.yaml',
    templateName: 'zod_operation_schema',
  });

  await generate({
    title: 'Lists API client for tests',
    rootDir: ROOT,
    sourceGlob: './api/**/*.schema.yaml',
    templateName: 'api_client_supertest',
    skipLinting: true,
    bundle: {
      outFile: join(
        REPO_ROOT,
        'x-pack/solutions/security/packages/test-api-clients/supertest/lists.gen.ts'
      ),
    },
  });

  await generate({
    title: 'Lists API client for Scout tests',
    rootDir: ROOT,
    sourceGlob: './api/**/*.schema.yaml',
    templateName: 'api_client_scout',
    skipLinting: true,
    bundle: {
      outFile: join(
        REPO_ROOT,
        'x-pack/solutions/security/packages/test-api-clients/scout/lists.gen.ts'
      ),
    },
  });

  await generate({
    title: 'Lists API client for quickstart',
    rootDir: ROOT,
    sourceGlob: './api/**/*.schema.yaml',
    templateName: 'api_client_quickstart',
    skipLinting: true,
    bundle: {
      outFile: join(
        REPO_ROOT,
        'x-pack/solutions/security/packages/kbn-securitysolution-lists-common/api/quickstart_client.gen.ts'
      ),
    },
  });
})();
