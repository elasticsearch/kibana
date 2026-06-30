/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import path from 'path';
import { schema } from '@kbn/config-schema';
import { preprocessAlertInputs } from './utils/preprocess_alert_inputs';
import type { RouteDependencies } from '../types';
import { API_VERSION, AVAILABILITY, OAS_TAG } from '../utils/route_constants';
import { handleRouteError } from '../utils/route_error_handlers';
import { WORKFLOW_EXECUTE_SECURITY } from '../utils/route_security';
import { withAvailabilityCheck } from '../utils/with_availability_check';

export function registerTestWorkflowRoute(deps: RouteDependencies) {
  const { router, api, logger, spaces, audit } = deps;
  router.versioned
    .post({
      path: '/api/workflows/test',
      access: 'public',
      security: WORKFLOW_EXECUTE_SECURITY,
      summary: 'Test a workflow',
      description:
        'Execute a workflow in test mode without requiring it to be saved or enabled. Provide either a workflow ID to test a saved workflow, a YAML definition to test an unsaved draft, or both to test a modified version of an existing workflow.',
      options: {
        tags: [OAS_TAG],
        availability: AVAILABILITY,
      },
    })
    .addVersion(
      {
        version: API_VERSION,
        options: {
          oasOperationObject: () => path.join(__dirname, '../examples/test_workflow.yaml'),
        },
        validate: {
          request: {
            body: schema.object({
              workflowId: schema.maybe(
                schema.string({ meta: { description: 'ID of an existing workflow to test.' } })
              ),
              workflowYaml: schema.maybe(
                schema.string({ meta: { description: 'YAML definition to test.' } })
              ),
              inputs: schema.recordOf(schema.string(), schema.any(), {
                meta: { description: 'Key-value inputs for the test execution.' },
              }),
            }),
          },
        },
      },
      withAvailabilityCheck(async (context, request, response) => {
        try {
          const { workflowId, workflowYaml, inputs: rawInputs } = request.body;

          if (!workflowId && !workflowYaml) {
            return response.badRequest({
              body: {
                message: "Either 'workflowId' or 'workflowYaml' or both must be provided",
              },
            });
          }

          const spaceId = spaces.getSpaceId(request);

          let inputs = rawInputs;
          const event = rawInputs.event as
            | { triggerType?: string; alertIds?: unknown[] }
            | undefined;
          const hasAlertTrigger =
            event?.triggerType === 'alert' && event?.alertIds && event.alertIds.length > 0;
          if (hasAlertTrigger) {
            inputs = await preprocessAlertInputs(inputs, context, spaceId, logger);
          }

          const workflowExecutionId = await api.testWorkflow({
            workflowId,
            workflowYaml,
            inputs,
            spaceId,
            request,
          });

          audit.logWorkflowTest(request, {
            workflowExecutionId,
            workflowId,
          });

          return response.ok({ body: { workflowExecutionId } });
        } catch (error) {
          audit.logWorkflowTest(request, {
            workflowExecutionId: '',
            workflowId: request.body.workflowId,
            error,
          });
          return handleRouteError(response, error, {
            logger,
            logContext: {
              route: 'POST /api/workflows/test',
              workflowId: request.body.workflowId,
              spaceId: spaces.getSpaceId(request),
            },
          });
        }
      })
    );
}
