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
import type { WorkflowExecutionEngineModel } from '@kbn/workflows';
import { toWorkflowExecutionEngineModel } from '@kbn/workflows';
import { preprocessAlertInputs } from './utils/preprocess_alert_inputs';
import type { RouteDependencies } from '../types';
import { API_VERSION, AVAILABILITY, OAS_TAG } from '../utils/route_constants';
import { handleRouteError } from '../utils/route_error_handlers';
import { WORKFLOW_EXECUTE_SECURITY } from '../utils/route_security';
import { idParamSchema } from '../utils/schemas';
import { withAvailabilityCheck } from '../utils/with_availability_check';

export function registerRunWorkflowRoute(deps: RouteDependencies) {
  const { router, api, logger, spaces, audit } = deps;
  router.versioned
    .post({
      path: '/api/workflows/workflow/{id}/run',
      access: 'public',
      security: WORKFLOW_EXECUTE_SECURITY,
      summary: 'Run a workflow',
      description:
        'Execute a workflow by its ID with the provided inputs. The workflow must be enabled and have a valid definition. Returns an execution ID that can be used to monitor progress.',
      options: {
        tags: [OAS_TAG],
        availability: AVAILABILITY,
      },
    })
    .addVersion(
      {
        version: API_VERSION,
        options: {
          oasOperationObject: () => path.join(__dirname, '../examples/run_workflow.yaml'),
        },
        validate: {
          request: {
            params: idParamSchema,
            body: schema.object({
              inputs: schema.recordOf(schema.string(), schema.any(), {
                meta: { description: 'Key-value inputs for the workflow execution.' },
              }),
              metadata: schema.maybe(
                schema.recordOf(schema.string(), schema.any(), {
                  meta: { description: 'Optional metadata for the execution.' },
                })
              ),
            }),
          },
        },
      },
      withAvailabilityCheck(async (context, request, response) => {
        try {
          const { id } = request.params;
          const spaceId = spaces.getSpaceId(request);
          const workflow = await api.getWorkflow(id, spaceId);
          if (!workflow) {
            return response.notFound();
          }
          if (!workflow.valid) {
            return response.badRequest({ body: { message: 'Workflow is not valid.' } });
          }
          if (!workflow.definition) {
            return response.customError({
              statusCode: 500,
              body: { message: 'Workflow definition is missing.' },
            });
          }
          if (!workflow.enabled) {
            return response.badRequest({
              body: { message: 'Workflow is disabled. Enable it to run it.' },
            });
          }

          const { inputs, metadata } = request.body;

          let processedInputs = inputs;
          const event = inputs.event as { triggerType?: string; alertIds?: unknown[] } | undefined;
          const hasAlertTrigger =
            event?.triggerType === 'alert' && event?.alertIds && event.alertIds.length > 0;
          if (hasAlertTrigger) {
            processedInputs = await preprocessAlertInputs(inputs, context, spaceId, logger);
          }

          const workflowForExecution: WorkflowExecutionEngineModel =
            toWorkflowExecutionEngineModel(workflow);
          const workflowExecutionId = await api.runWorkflow(
            workflowForExecution,
            spaceId,
            processedInputs,
            request,
            undefined,
            metadata
          );
          audit.logWorkflowRun(request, {
            workflowId: id,
            executionId: workflowExecutionId,
          });
          return response.ok({ body: { workflowExecutionId } });
        } catch (error) {
          audit.logWorkflowRun(request, {
            workflowId: request.params.id,
            error,
          });
          return handleRouteError(response, error, {
            logger,
            logContext: {
              route: 'POST /api/workflows/workflow/{id}/run',
              workflowId: request.params.id,
              spaceId: spaces.getSpaceId(request),
            },
          });
        }
      })
    );
}
