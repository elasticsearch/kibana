/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isValidTraceId } from '@opentelemetry/api';
import {
  API_VERSIONS,
  EVALS_TRACE_EVIDENCE_URL,
  GetTraceEvidenceRequestParams,
  GetTraceEvidenceRequestQuery,
  INTERNAL_API_ACCESS,
  type GetTraceEvidenceResponse,
} from '@kbn/evals-common';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { EVALS_API_PRIVILEGES } from '../../../common';
import {
  extractProfilesEvidence,
  extractSelectedEvidence,
  hasResolvedEvidence,
  hasTraceDocuments,
  toInstrumentationProfileProbes,
  type InstrumentationProfileProbeResult,
} from '../../evaluators/evidence/evidence_service';
import type { InstrumentationProfile } from '../../evaluators/evidence/types';
import {
  awaitTraceReady,
  TraceReadinessError,
  type AwaitTraceReadyResult,
} from '../../evaluators/trace_readiness';
import { createTraceAccessor } from '../../evaluators/trace_accessor';
import { getNoTraceDocumentsMessage } from '../../evaluators/trace_readiness_errors';
import type { RouteDependencies } from '../register_routes';
import { handleMaximumResponseSizeExceededError } from '../utils/handle_response_size_error';

const toResolvedResponse = ({
  traceId,
  profileSelection,
  result,
}: {
  traceId: string;
  profileSelection: 'explicit' | 'auto';
  result: Omit<AwaitTraceReadyResult, 'readiness'> & {
    readiness: AwaitTraceReadyResult['readiness'] | 'immediate';
  };
}): GetTraceEvidenceResponse => ({
  status: 'resolved',
  readiness: result.readiness,
  trace_id: traceId,
  profile_selection: profileSelection,
  profile: result.profile,
  evidence: result.round,
  evidence_status: result.evidence,
});

const toUnresolvedResponse = ({
  traceId,
  profileSelection,
  profile,
  readiness,
  profiles,
}: {
  traceId: string;
  profileSelection: 'explicit' | 'auto';
  profile: InstrumentationProfile | null;
  readiness: 'immediate' | 'best_effort';
  profiles: InstrumentationProfileProbeResult[];
}): GetTraceEvidenceResponse => ({
  status: 'unresolved',
  readiness,
  trace_id: traceId,
  profile_selection: profileSelection,
  profile,
  profile_diagnostics: profiles,
});

export const registerGetTraceEvidenceRoute = ({ router, logger }: RouteDependencies) => {
  router.versioned
    .get({
      path: EVALS_TRACE_EVIDENCE_URL,
      access: INTERNAL_API_ACCESS,
      security: {
        authz: { requiredPrivileges: [EVALS_API_PRIVILEGES.read] },
      },
      summary: 'Get normalized trace evidence',
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v1,
        validate: {
          request: {
            params: buildRouteValidationWithZod(GetTraceEvidenceRequestParams),
            query: buildRouteValidationWithZod(GetTraceEvidenceRequestQuery),
          },
        },
      },
      async (context, request, response) => {
        const { traceId } = request.params;
        const { profile, wait } = request.query;
        if (!isValidTraceId(traceId)) {
          return response.badRequest({
            body: { message: 'Invalid traceId: must be a 32-character hex string' },
          });
        }

        const profileSelection = profile ? 'explicit' : 'auto';

        try {
          const coreContext = await context.core;
          const traceAccessor = createTraceAccessor({
            traceId,
            esClient: coreContext.elasticsearch.client.asCurrentUser,
          });

          if (wait !== 'none') {
            try {
              const result = await awaitTraceReady(traceAccessor, { mode: wait, profile }, logger);
              return response.ok({
                body: toResolvedResponse({ traceId, profileSelection, result }),
              });
            } catch (error) {
              if (error instanceof TraceReadinessError) {
                if (error.kind === 'not_ready') {
                  return response.notFound({ body: { message: error.message } });
                }

                return response.ok({
                  body: toUnresolvedResponse({
                    traceId,
                    profileSelection,
                    profile: profile ?? null,
                    readiness: 'best_effort',
                    profiles: error.profiles,
                  }),
                });
              }
              throw error;
            }
          }

          if (!(await hasTraceDocuments(traceAccessor))) {
            return response.notFound({
              body: {
                message: getNoTraceDocumentsMessage(traceId),
              },
            });
          }

          const selection = await extractSelectedEvidence(traceAccessor, profile);
          if (selection.selected && hasResolvedEvidence(selection.selected.round)) {
            return response.ok({
              body: toResolvedResponse({
                traceId,
                profileSelection,
                result: { ...selection.selected, readiness: 'immediate' },
              }),
            });
          }

          const profiles = selection.profiles ?? (await extractProfilesEvidence(traceAccessor));
          return response.ok({
            body: toUnresolvedResponse({
              traceId,
              profileSelection,
              profile: profile ?? null,
              readiness: 'immediate',
              profiles: toInstrumentationProfileProbes(profiles),
            }),
          });
        } catch (error) {
          const tooLarge = handleMaximumResponseSizeExceededError({
            error,
            response,
            logger,
            context: 'Get trace evidence',
          });
          if (tooLarge) {
            return tooLarge;
          }

          logger.error(`Failed to get trace evidence: ${error}`);
          return response.customError({
            statusCode: 500,
            body: { message: 'Failed to get trace evidence' },
          });
        }
      }
    );
};
