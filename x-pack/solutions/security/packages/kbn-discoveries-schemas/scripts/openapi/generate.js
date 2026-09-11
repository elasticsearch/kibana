/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

require('@kbn/setup-node-env');
const { generate } = require('@kbn/openapi-generator');
const { REPO_ROOT } = require('@kbn/repo-info');
// eslint-disable-next-line import/no-nodejs-modules
const { join, resolve } = require('path');

const DISCOVERIES_SCHEMAS_ROOT = resolve(__dirname, '../..');

(async () => {
  await generate({
    rootDir: DISCOVERIES_SCHEMAS_ROOT,
    sourceGlob: './schemas/**/*.schema.yaml',
    templateName: 'zod_operation_schema',
  });

  await generate({
    title: 'Attack Discovery API client for Scout tests',
    rootDir: DISCOVERIES_SCHEMAS_ROOT,
    sourceGlob: './schemas/**/*.schema.yaml',
    templateName: 'api_client_scout',
    skipLinting: true,
    bundle: {
      outFile: join(
        REPO_ROOT,
        'x-pack/solutions/security/packages/test-api-clients/scout/discoveries.gen.ts'
      ),
    },
  });
})();
