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
import { stringifyWorkflowDefinition } from '@kbn/workflows-yaml';
import type { ExportWorkflowsResponse, WorkflowExportEntry } from '../../../../common/lib/import';
import { WORKFLOW_EXPORT_VERSION } from '../../../../common/lib/import';
import type { RouteDependencies } from '../types';
import { API_VERSION, AVAILABILITY, OAS_TAG } from '../utils/route_constants';
import { handleRouteError } from '../utils/route_error_handlers';
import {
  assertCanReadManagedWorkflow,
  hasWorkflowReadPrivilege,
  WORKFLOW_READ_WITH_MANAGED_SECURITY,
} from '../utils/route_security';
import { withAvailabilityCheck } from '../utils/with_availability_check';

export function registerExportWorkflowsRoute(deps: RouteDependencies) {
  const { router, api, logger, spaces, audit } = deps;
  router.versioned
    .post({
      path: '/api/workflows/export',
      access: 'public',
      security: WORKFLOW_READ_WITH_MANAGED_SECURITY,
      summary: 'Export workflows',
      description: 'Export one or more workflows as JSON with YAML content and metadata.',
      options: {
        tags: [OAS_TAG],
        availability: AVAILABILITY,
      },
    })
    .addVersion(
      {
        version: API_VERSION,
        options: {
          oasOperationObject: () => path.join(__dirname, '../examples/export_workflows.yaml'),
        },
        validate: {
          request: {
            body: schema.object({
              ids: schema.arrayOf(
                schema.string({ maxLength: 255, meta: { description: 'Workflow ID to export.' } }),
                {
                  minSize: 1,
                  maxSize: 500,
                  meta: { description: 'Array of workflow IDs to export.' },
                }
              ),
            }),
          },
        },
      },
      withAvailabilityCheck(async (context, request, response) => {
        try {
          if (!hasWorkflowReadPrivilege(request)) {
            return response.forbidden();
          }
          const spaceId = spaces.getSpaceId(request);
          const { ids } = request.body;

          const workflows = await api.getWorkflowsByIds(ids, spaceId);
          workflows.forEach((workflow) => assertCanReadManagedWorkflow(request, workflow));

          const entries: WorkflowExportEntry[] = workflows.map((workflow) => {
            const yaml =
              typeof workflow.definition === 'object' && workflow.definition !== null
                ? stringifyWorkflowDefinition(workflow.definition)
                : workflow.yaml;
            return { id: workflow.id, yaml };
          });

          if (entries.length === 0) {
            return response.notFound({
              body: { message: 'None of the requested workflows were found' },
            });
          }

          const foundIds = new Set(entries.map((e) => e.id));
          const missingIds = ids.filter((id) => !foundIds.has(id));
          if (missingIds.length > 0) {
            logger.warn(
              `Export skipped ${missingIds.length} missing workflow(s): ${missingIds.join(', ')}`
            );
          }

          const body: ExportWorkflowsResponse = {
            entries,
            manifest: {
              exportedCount: entries.length,
              exportedAt: new Date().toISOString(),
              version: WORKFLOW_EXPORT_VERSION,
            },
          };

          audit.logWorkflowsExported(request, {
            ids: entries.map((e) => e.id),
          });

          return response.ok({ body });
        } catch (error) {
          audit.logWorkflowsExported(request, { error });
          return handleRouteError(response, error);
        }
      })
    );
}
