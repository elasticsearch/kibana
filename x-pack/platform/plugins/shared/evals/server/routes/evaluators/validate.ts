/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isValidTraceId } from '@opentelemetry/api';
import {
  API_VERSIONS,
  EVALS_VALIDATE_URL,
  INTERNAL_API_ACCESS,
  ValidateRequestBody,
  type ValidateResponse,
} from '@kbn/evals-common';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import type { z } from '@kbn/zod/v4';
import { EVALS_API_PRIVILEGES } from '../../../common';
import { normalizeEvidence } from '../../evaluators/evidence/evidence_service';
import { getInstrumentationProfile } from '../../evaluators/evidence/resolve_instrumentation';
import { getIssuePath } from '../../evaluators/evidence/schema_issues';
import { createTraceAccessor } from '../../evaluators/trace_accessor';
import type { EvaluatorDefinition } from '../../evaluators/types';
import type { RouteDependencies } from '../register_routes';

const getUnmetPaths = (error: z.ZodError): string[] => [
  ...new Set(error.issues.map((issue) => getIssuePath(issue.path))),
];

const getRemediation = (unmetPaths: string[], profile: string): string | undefined => {
  if (unmetPaths.length === 0) {
    return undefined;
  }

  if (profile !== 'elastic-inference') {
    return 'evidence not present in trace';
  }

  const remediationByPathPrefix: Record<string, string> = {
    'response.message': 'enable includeLlmResponses',
    'input.message': 'enable includeUserPrompts',
    steps: 'enable includeToolDetails',
  };

  for (const [prefix, remediation] of Object.entries(remediationByPathPrefix)) {
    if (unmetPaths.some((path) => path === prefix || path.startsWith(`${prefix}.`))) {
      return remediation;
    }
  }

  return 'evidence not present in trace';
};

export const registerValidateRoute = ({
  router,
  evaluatorRegistry,
  getSpaceId,
}: RouteDependencies) => {
  router.versioned
    .post({
      path: EVALS_VALIDATE_URL,
      access: INTERNAL_API_ACCESS,
      enableQueryVersion: true,
      security: {
        authz: { requiredPrivileges: [EVALS_API_PRIVILEGES.manage] },
      },
      summary: 'Validate evaluator evidence requirements against a trace',
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v1,
        validate: {
          request: {
            body: buildRouteValidationWithZod(ValidateRequestBody),
          },
        },
      },
      async (context, request, response) => {
        const { subject, evaluators } = request.body;
        if (subject.mode === 'multi-turn') {
          return response.badRequest({
            body: { message: 'multi-turn evaluation is not yet supported' },
          });
        }

        if (subject.mode === 'single-turn' && subject.traces.length !== 1) {
          return response.badRequest({
            body: { message: 'single-turn mode requires exactly one trace' },
          });
        }

        const spaceId = getSpaceId ? await getSpaceId(request) : DEFAULT_SPACE_ID;
        const scopedRegistry = evaluatorRegistry.asScoped({ spaceId });

        const resolvedEvaluators: Array<{
          config: (typeof evaluators)[number];
          definition: EvaluatorDefinition;
        }> = [];
        for (const config of evaluators) {
          const definition = await scopedRegistry.get(config.name, config.version);
          if (!definition) {
            const message = config.version
              ? `Evaluator not found: ${config.name}@${config.version}`
              : `Evaluator not found: ${config.name}`;
            return response.badRequest({ body: { message } });
          }
          resolvedEvaluators.push({ config, definition });
        }

        const [{ trace_id: traceId }] = subject.traces;
        if (!isValidTraceId(traceId)) {
          return response.badRequest({
            body: { message: 'Invalid trace_id: must be a 32-character hex string' },
          });
        }

        const activeProfile = subject.instrumentation?.profile ?? 'elastic-inference';
        const resolvedMapping = getInstrumentationProfile(activeProfile);

        const coreContext = await context.core;
        const traceAccessor = createTraceAccessor({
          traceId,
          esClient: coreContext.elasticsearch.client.asInternalUser,
        });

        // A dry run, so it neither waits for the trace nor requires one to exist: callers use
        // it to check whether an evaluator's evidence requirements *could* be satisfied, and
        // an absent trace is reported per evaluator as unmet rather than as a failed request.
        const round = await normalizeEvidence(traceAccessor, resolvedMapping);

        const validationResults: ValidateResponse['evaluators'] = resolvedEvaluators.map(
          ({ definition }) => {
            if (!definition.evidenceSchema) {
              return {
                name: definition.name,
                version: definition.version,
                ready: true,
                unmet: [],
              };
            }

            const parsed = definition.evidenceSchema.safeParse(round);
            if (parsed.success) {
              return {
                name: definition.name,
                version: definition.version,
                ready: true,
                unmet: [],
              };
            }

            const unmet = getUnmetPaths(parsed.error);
            const remediation = getRemediation(unmet, activeProfile);

            return {
              name: definition.name,
              version: definition.version,
              ready: false,
              unmet,
              ...(remediation ? { remediation } : {}),
            };
          }
        );

        return response.ok({
          body: {
            evaluators: validationResults,
          },
        });
      }
    );
};
