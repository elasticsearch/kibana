/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { KibanaRequest } from '@kbn/core/server';
import { WorkflowsManagementOperationPrivileges } from '@kbn/workflows';
import {
  INTERNAL_CASE_WORKFLOW_RUN_URL,
  MAX_CASE_WORKFLOW_RUN_ID_LENGTH,
} from '../../../../common/constants';
import { RunCaseWorkflowRequestSchema } from '../../../../common/types/api/workflow/latest';
import type { CasesWorkflowRunContext } from '../../../client/workflows/operations';
import type { CasesWorkflowRunService } from '../../../workflows/execution/service';
import { createCasesRoute } from '../create_cases_route';

export const runCaseWorkflowParamsSchema = schema.object({
  workflow_id: schema.string({
    minLength: 1,
    maxLength: MAX_CASE_WORKFLOW_RUN_ID_LENGTH,
  }),
});

interface RunWorkflowRouteDeps {
  service: CasesWorkflowRunService;
  getSpaceId: (request: KibanaRequest) => string;
  /**
   * Resolves a request-scoped Cases client and workflow operations object. This is injected
   * rather than read from `context.cases` to avoid exposing workflow run capabilities to all
   * plugins that depend on the `cases` request context.
   */
  getWorkflowRunContext: (request: KibanaRequest) => Promise<CasesWorkflowRunContext>;
}

export const createRunWorkflowRoute = ({
  service,
  getSpaceId,
  getWorkflowRunContext,
}: RunWorkflowRouteDeps) =>
  createCasesRoute({
    method: 'post',
    path: INTERNAL_CASE_WORKFLOW_RUN_URL,
    // AUTHORIZATION NOTE — this route enforces a two-layer privilege model:
    //
    // 1. Route-level (declared here): `workflowsManagement:execute` — the API action registered
    //    by the `workflow_execute` sub-feature privilege in the Workflows Management feature.
    //    This is a *separate* Kibana feature (minimumLicense: enterprise); a role granting Cases
    //    `all` does NOT implicitly grant it, so admins must explicitly assign the sub-privilege.
    //
    // 2. Handler-level (inside CasesWorkflowRunService): `cases:<owner>/updateCase` — checked
    //    by the internal workflow authorization helper. This is owner-scoped and cannot be
    //    declared statically on the route (which is why `DEFAULT_CASES_ROUTE_SECURITY` opts out
    //    for all other Cases routes). It ensures the caller can only trigger workflows for the
    //    authorized cases within the current space.
    security: {
      authz: {
        requiredPrivileges: [...WorkflowsManagementOperationPrivileges.execute],
      },
    },
    params: {
      params: runCaseWorkflowParamsSchema,
      body: RunCaseWorkflowRequestSchema,
    },
    routerOptions: {
      access: 'internal',
      summary: 'Run a workflow from one or more cases',
      description: 'Runs a workflow with server-owned execution metadata for the authorized cases.',
    },
    handler: async ({ context, request, response }) => {
      const { casesClient, workflowOperations } = await getWorkflowRunContext(request);
      const { workflow_id: workflowId } = request.params;
      const result = await service.run({
        workflowId,
        body: request.body,
        request,
        context,
        casesClient,
        workflowOperations,
        spaceId: getSpaceId(request),
      });

      return response.ok({ body: result });
    },
  });
