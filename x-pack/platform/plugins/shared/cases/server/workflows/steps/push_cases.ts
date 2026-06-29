/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import pMap from 'p-map';
import pRetry from 'p-retry';
import type { KibanaRequest } from '@kbn/core/server';
import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import { pushCasesStepCommonDefinition } from '../../../common/workflows/steps/push_cases';
import { ConnectorTypes } from '../../../common/bundled-types.gen';
import type { CasesClient } from '../../client';
import { getCasesClientFromStepsContext, safeParseCaseForWorkflowOutput } from './utils';

const pushSingleCase = async (
  client: CasesClient,
  caseId: string,
  logger: { warn(message: string): void }
) => {
  const theCase = await client.cases.get({ id: caseId, includeComments: false });
  if (!theCase.connector || theCase.connector.type === ConnectorTypes.enum['.none']) {
    return theCase;
  }
  return pRetry(
    () => client.cases.push({ caseId, connectorId: theCase.connector.id, pushType: 'automatic' }),
    {
      maxTimeout: 5000,
      retries: 3,
      factor: 2,
      onFailedAttempt: (error) => {
        logger.warn(
          `Pushing case (${caseId}) to connector its connector (${theCase.connector.id}) failed: (try #${error.attemptNumber}, ${error.retriesLeft} retries left)`
        );
      },
    }
  );
};

export const pushCasesStepDefinition = (
  getCasesClient: (request: KibanaRequest) => Promise<CasesClient>
) =>
  createServerStepDefinition({
    ...pushCasesStepCommonDefinition,
    handler: async (context) => {
      const { case_ids: caseIds } = context.input;

      try {
        const client = await getCasesClientFromStepsContext(context, getCasesClient);
        const pushedCases = await pMap(
          caseIds,
          async (id) => {
            try {
              return await pushSingleCase(client, id, context.logger);
            } catch (err) {
              context.logger.error(`Error pushing case ${id}: ${err}`);
              return null;
            }
          },
          { concurrency: 25 }
        );

        const output = safeParseCaseForWorkflowOutput(pushCasesStepCommonDefinition.outputSchema, {
          cases: pushedCases,
        });

        return { output };
      } catch (error) {
        return { error };
      }
    },
  });
