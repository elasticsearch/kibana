/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { readFileSync } from 'fs';
import path from 'path';
import type { RoleApiCredentials } from '@kbn/scout';
import { apiTest, tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { COMMON_HEADERS } from '../fixtures/constants';

/** Each approved step definition lives in its own file at:
 *   ../fixtures/approved_step_definitions/<step_id>.txt
 * The file contains exactly one line: the approved definitionHash.
 * Splitting one step per file avoids semantic merge conflicts when multiple
 * PRs add or update different steps concurrently.
 */
const APPROVED_STEP_DEFINITIONS_DIR_ABS = path.resolve(
  __dirname,
  '../fixtures/approved_step_definitions'
);
const APPROVED_STEP_DEFINITIONS_DIR_REL =
  'src/platform/plugins/shared/workflows_extensions/test/scout/api/fixtures/approved_step_definitions';

const loadApprovedStepHash = (stepId: string): string | null => {
  try {
    return readFileSync(
      path.join(APPROVED_STEP_DEFINITIONS_DIR_ABS, `${stepId}.txt`),
      'utf8'
    ).trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

// Failing: See https://github.com/elastic/kibana/issues/265012
apiTest.describe.skip(
  'Workflows Extensions - Custom Step Definitions Approval',
  {
    tag: [
      ...tags.stateful.classic,
      ...tags.serverless.search,
      ...tags.serverless.security.complete,
      ...tags.serverless.observability.complete,
      ...tags.serverless.workplaceai,
      ...tags.serverless.vectordb,
    ],
  },
  () => {
    let adminApiCredentials: RoleApiCredentials;

    apiTest.beforeAll(async ({ requestAuth }) => {
      adminApiCredentials = await requestAuth.getApiKey('admin');
    });

    apiTest(
      'should validate that all registered custom step definitions are approved by workflows-eng team',
      async ({ apiClient }) => {
        const response = await apiClient.get('internal/workflows_extensions/step_definitions', {
          headers: {
            ...COMMON_HEADERS,
            ...adminApiCredentials.apiKeyHeader,
          },
          responseType: 'json',
        });

        expect(response.statusCode).toBe(200);
        expect(response.body.steps).toBeDefined();
        expect(Array.isArray(response.body.steps)).toBe(true);

        const issues: string[] = [];
        const fixCommands: string[] = [];

        for (const step of response.body.steps as Array<{ id: string; definitionHash: string }>) {
          const approvedHash = loadApprovedStepHash(step.id);

          /* eslint-disable playwright/no-conditional-in-test */
          if (approvedHash === null) {
            issues.push(`Step "${step.id}" is not in the approved list.`);
            fixCommands.push(
              `echo ${step.definitionHash} > ${APPROVED_STEP_DEFINITIONS_DIR_REL}/${step.id}.txt`
            );
          } else if (approvedHash !== step.definitionHash) {
            issues.push(
              `Step "${step.id}" has an invalid definition hash (expected "${approvedHash}", got "${step.definitionHash}").`
            );
            fixCommands.push(
              `echo ${step.definitionHash} > ${APPROVED_STEP_DEFINITIONS_DIR_REL}/${step.id}.txt`
            );
          }
        }

        expect(issues, {
          message: `Found ${
            issues.length
          } unapproved step definition(s). Run the following command(s) from your kibana directory and request review from the workflows-eng team:\n\n${fixCommands.join(
            '\n'
          )}`,
        }).toStrictEqual([]);
      }
    );
  }
);
