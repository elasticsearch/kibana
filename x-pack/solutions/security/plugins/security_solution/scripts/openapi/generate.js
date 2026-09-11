/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

require('@kbn/setup-node-env');
const { generate } = require('@kbn/openapi-generator');
const { REPO_ROOT } = require('@kbn/repo-info');
const { resolve, join } = require('path');

const SECURITY_SOLUTION_ROOT = resolve(__dirname, '../..');

// This script is also run in CI: to track down the scripts that run it in CI, code search for `yarn openapi:generate` in the `.buildkite` top level directory

(async () => {
  await generate({
    title: 'API route schemas',
    rootDir: SECURITY_SOLUTION_ROOT,
    sourceGlob: './common/**/*.schema.yaml',
    templateName: 'zod_operation_schema',
  });

  await generate({
    title: 'Detections API client for tests',
    rootDir: SECURITY_SOLUTION_ROOT,
    sourceGlob: join(SECURITY_SOLUTION_ROOT, 'common/api/detection_engine/**/*.schema.yaml'),
    templateName: 'api_client_supertest',
    skipLinting: true,
    bundle: {
      outFile: join(
        REPO_ROOT,
        'x-pack/solutions/security/packages/test-api-clients/supertest/detections.gen.ts'
      ),
    },
  });

  await generate({
    title: 'Endpoint Management API client for tests',
    rootDir: SECURITY_SOLUTION_ROOT,
    sourceGlob: join(SECURITY_SOLUTION_ROOT, 'common/api/endpoint/**/*.schema.yaml'),
    templateName: 'api_client_supertest',
    skipLinting: true,
    bundle: {
      outFile: join(
        REPO_ROOT,
        'x-pack/solutions/security/packages/test-api-clients/supertest/endpoint_management.gen.ts'
      ),
    },
  });

  await generate({
    title: 'Entity Analytics API client for tests',
    rootDir: SECURITY_SOLUTION_ROOT,
    sourceGlob: join(SECURITY_SOLUTION_ROOT, 'common/api/entity_analytics/**/*.schema.yaml'),
    templateName: 'api_client_supertest',
    skipLinting: true,
    bundle: {
      outFile: join(
        REPO_ROOT,
        'x-pack/solutions/security/packages/test-api-clients/supertest/entity_analytics.gen.ts'
      ),
    },
  });

  await generate({
    title: 'Timelines API client for tests',
    rootDir: SECURITY_SOLUTION_ROOT,
    sourceGlob: join(SECURITY_SOLUTION_ROOT, 'common/api/timeline/**/*.schema.yaml'),
    templateName: 'api_client_supertest',
    skipLinting: true,
    bundle: {
      outFile: join(
        REPO_ROOT,
        'x-pack/solutions/security/packages/test-api-clients/supertest/timelines.gen.ts'
      ),
    },
  });

  await generate({
    title: 'Detections API client for Scout tests',
    rootDir: SECURITY_SOLUTION_ROOT,
    sourceGlob: join(SECURITY_SOLUTION_ROOT, 'common/api/detection_engine/**/*.schema.yaml'),
    templateName: 'api_client_scout',
    skipLinting: true,
    bundle: {
      outFile: join(
        REPO_ROOT,
        'x-pack/solutions/security/packages/test-api-clients/scout/detections.gen.ts'
      ),
    },
  });

  await generate({
    title: 'Endpoint Management API client for Scout tests',
    rootDir: SECURITY_SOLUTION_ROOT,
    sourceGlob: join(SECURITY_SOLUTION_ROOT, 'common/api/endpoint/**/*.schema.yaml'),
    templateName: 'api_client_scout',
    skipLinting: true,
    bundle: {
      outFile: join(
        REPO_ROOT,
        'x-pack/solutions/security/packages/test-api-clients/scout/endpoint_management.gen.ts'
      ),
    },
  });

  await generate({
    title: 'Entity Analytics API client for Scout tests',
    rootDir: SECURITY_SOLUTION_ROOT,
    sourceGlob: join(SECURITY_SOLUTION_ROOT, 'common/api/entity_analytics/**/*.schema.yaml'),
    templateName: 'api_client_scout',
    skipLinting: true,
    bundle: {
      outFile: join(
        REPO_ROOT,
        'x-pack/solutions/security/packages/test-api-clients/scout/entity_analytics.gen.ts'
      ),
    },
  });

  await generate({
    title: 'Timelines API client for Scout tests',
    rootDir: SECURITY_SOLUTION_ROOT,
    sourceGlob: join(SECURITY_SOLUTION_ROOT, 'common/api/timeline/**/*.schema.yaml'),
    templateName: 'api_client_scout',
    skipLinting: true,
    bundle: {
      outFile: join(
        REPO_ROOT,
        'x-pack/solutions/security/packages/test-api-clients/scout/timelines.gen.ts'
      ),
    },
  });

  await generate({
    title: 'API client for quickstart',
    rootDir: SECURITY_SOLUTION_ROOT,
    sourceGlob: './common/**/*.schema.yaml',
    templateName: 'api_client_quickstart',
    skipLinting: false,
    bundle: {
      outFile: join(
        REPO_ROOT,
        'x-pack/solutions/security/plugins/security_solution/common/api/quickstart_client.gen.ts'
      ),
    },
  });
})();
