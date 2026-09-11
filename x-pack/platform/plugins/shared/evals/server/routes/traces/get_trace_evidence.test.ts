/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';
import { kibanaResponseFactory } from '@kbn/core/server';
import type { MockedVersionedRouter } from '@kbn/core-http-router-server-mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { coreMock, httpServerMock, httpServiceMock } from '@kbn/core/server/mocks';
import {
  API_VERSIONS,
  EVALS_TRACE_EVIDENCE_URL,
  GetTraceEvidenceRequestQuery,
} from '@kbn/evals-common';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import { EVALS_API_PRIVILEGES } from '../../../common';
import * as evidenceServiceModule from '../../evaluators/evidence/evidence_service';
import type { EvidenceRound } from '../../evaluators/evidence/types';
import { createEvaluatorRegistryMock } from '../../evaluators/registry.mock';
import {
  awaitTraceReady,
  TraceReadinessError,
  type AwaitTraceReadyResult,
} from '../../evaluators/trace_readiness';
import { registerGetTraceEvidenceRoute } from './get_trace_evidence';

jest.mock('../../evaluators/evidence/evidence_service');
jest.mock('../../evaluators/trace_readiness', () => ({
  ...jest.requireActual('../../evaluators/trace_readiness'),
  awaitTraceReady: jest.fn(),
}));

const TRACE_ID = '0af7651916cd43dd8448eb211c80319c';
const ROUND: EvidenceRound = {
  input: { message: 'hello' },
  response: { message: 'world' },
  steps: [{ tool_id: 'search', arguments: { second: 2, first: 1 }, result: ['ok'] }],
};
const EVIDENCE = {
  user_query: { status: 'found' as const, field: 'input', sample: 'hello' },
  agent_response: { status: 'found' as const, field: 'output', sample: 'world' },
  tool_calls: { status: 'found' as const, field: 'tool', sample: 'search' },
};
const PROFILE_RESULT = {
  profile: 'elastic-inference' as const,
  round: ROUND,
  evidence: EVIDENCE,
};

describe('GET /internal/evals/traces/{traceId}/evidence', () => {
  const hasTraceDocumentsMock = evidenceServiceModule.hasTraceDocuments as jest.Mock;
  const hasResolvedEvidenceMock = evidenceServiceModule.hasResolvedEvidence as jest.Mock;
  const extractSelectedEvidenceMock = evidenceServiceModule.extractSelectedEvidence as jest.Mock;
  const extractProfilesEvidenceMock = evidenceServiceModule.extractProfilesEvidence as jest.Mock;
  const toInstrumentationProfileProbesMock =
    evidenceServiceModule.toInstrumentationProfileProbes as jest.Mock;
  const awaitTraceReadyMock = awaitTraceReady as jest.MockedFunction<typeof awaitTraceReady>;

  const setup = () => {
    const router = httpServiceMock.createRouter();
    const logger = loggingSystemMock.createLogger();
    registerGetTraceEvidenceRoute({
      router,
      logger,
      canEncrypt: false,
      evaluatorRegistry: createEvaluatorRegistryMock(),
      getInferenceStart: async () => ({ getClient: jest.fn() } as unknown as InferenceServerStart),
      getEncryptedSavedObjectsStart: async () => encryptedSavedObjectsMock.createStart(),
      getInternalRemoteConfigsSoClient: async () => savedObjectsClientMock.create(),
    });

    const versionedRouter = router.versioned as MockedVersionedRouter;
    const route = versionedRouter.getRoute('get', EVALS_TRACE_EVIDENCE_URL);
    const { handler } = route.versions[API_VERSIONS.internal.v1];
    const routeConfig = versionedRouter.get.mock.calls[0][0];
    const coreContext = coreMock.createRequestHandlerContext();
    const context = coreMock.createCustomRequestHandlerContext({ core: coreContext });

    return { handler, routeConfig, context, coreContext, logger };
  };

  const request = ({
    traceId = TRACE_ID,
    profile,
    wait = 'none',
  }: {
    traceId?: string;
    profile?: 'elastic-inference' | 'otel-genai-events';
    wait?: 'none' | 'stable' | 'complete';
  } = {}) =>
    httpServerMock.createKibanaRequest({
      method: 'get',
      path: EVALS_TRACE_EVIDENCE_URL.replace('{traceId}', traceId),
      params: { traceId },
      query: { profile, wait },
    });

  beforeEach(() => {
    jest.clearAllMocks();
    hasTraceDocumentsMock.mockResolvedValue(true);
    hasResolvedEvidenceMock.mockReturnValue(true);
    extractSelectedEvidenceMock.mockResolvedValue({ selected: PROFILE_RESULT });
    extractProfilesEvidenceMock.mockResolvedValue([PROFILE_RESULT]);
    toInstrumentationProfileProbesMock.mockImplementation((profiles: (typeof PROFILE_RESULT)[]) =>
      profiles.map(({ profile, evidence }) => ({ profile, evidence }))
    );
    awaitTraceReadyMock.mockResolvedValue({
      ...PROFILE_RESULT,
      readiness: 'stable',
    } satisfies AwaitTraceReadyResult);
  });

  it('requires read_evals authorization', () => {
    const { routeConfig } = setup();

    expect(routeConfig.security).toEqual({
      authz: { requiredPrivileges: [EVALS_API_PRIVILEGES.read] },
    });
  });

  it('validates query enum values', () => {
    expect(GetTraceEvidenceRequestQuery.safeParse({ wait: 'eventually' }).success).toBe(false);
    expect(GetTraceEvidenceRequestQuery.safeParse({ profile: 'unknown' }).success).toBe(false);
  });

  it('rejects invalid trace IDs before constructing an accessor', async () => {
    const { handler, context } = setup();

    const result = await handler(context, request({ traceId: 'invalid' }), kibanaResponseFactory);

    expect(result.status).toBe(400);
    expect(hasTraceDocumentsMock).not.toHaveBeenCalled();
  });

  it('returns immediate explicit evidence using the current-user client', async () => {
    const { handler, context, coreContext } = setup();

    const result = await handler(
      context,
      request({ profile: 'elastic-inference' }),
      kibanaResponseFactory
    );

    expect(result.status).toBe(200);
    expect(result.payload).toEqual({
      status: 'resolved',
      readiness: 'immediate',
      trace_id: TRACE_ID,
      profile_selection: 'explicit',
      profile: 'elastic-inference',
      evidence: ROUND,
      evidence_status: EVIDENCE,
    });
    expect(extractSelectedEvidenceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        esClient: coreContext.elasticsearch.client.asCurrentUser,
      }),
      'elastic-inference'
    );
  });

  it('returns the recommended round directly from auto-profile extraction', async () => {
    const { handler, context } = setup();

    const result = await handler(context, request(), kibanaResponseFactory);

    expect(result.payload).toEqual(
      expect.objectContaining({
        status: 'resolved',
        profile_selection: 'auto',
        profile: 'elastic-inference',
        evidence: ROUND,
      })
    );
    expect(extractSelectedEvidenceMock).toHaveBeenCalledWith(expect.any(Object), undefined);
  });

  it('returns all-profile diagnostics for an explicit unnormalizable trace', async () => {
    hasResolvedEvidenceMock.mockReturnValue(false);
    const diagnostic = { ...PROFILE_RESULT, round: { ...ROUND, response: { message: '' } } };
    extractProfilesEvidenceMock.mockResolvedValue([diagnostic]);
    const { handler, context } = setup();

    const result = await handler(
      context,
      request({ profile: 'otel-genai-events' }),
      kibanaResponseFactory
    );

    expect(result.payload).toEqual({
      status: 'unresolved',
      readiness: 'immediate',
      trace_id: TRACE_ID,
      profile_selection: 'explicit',
      profile: 'otel-genai-events',
      profile_diagnostics: [{ profile: 'elastic-inference', evidence: EVIDENCE }],
    });
    expect(result.payload).not.toHaveProperty('evidence');
  });

  it('waits with the requested mode and returns achieved readiness', async () => {
    const { handler, context, logger } = setup();

    const result = await handler(
      context,
      request({ profile: 'elastic-inference', wait: 'stable' }),
      kibanaResponseFactory
    );

    expect(result.payload.readiness).toBe('stable');
    expect(awaitTraceReadyMock).toHaveBeenCalledWith(
      expect.any(Object),
      { mode: 'stable', profile: 'elastic-inference' },
      logger
    );
  });

  it('returns 404 when no documents are visible', async () => {
    hasTraceDocumentsMock.mockResolvedValue(false);
    const { handler, context } = setup();

    const result = await handler(context, request(), kibanaResponseFactory);

    expect(result.status).toBe(404);
    expect(result.payload).toEqual({
      message: `Trace ${TRACE_ID} is not ready: no documents indexed in traces-* or logs-* yet`,
    });
  });

  it('maps waited unresolvable evidence to a typed response', async () => {
    awaitTraceReadyMock.mockRejectedValue(
      new TraceReadinessError('unresolvable', 'unresolvable', [
        { profile: 'elastic-inference', evidence: EVIDENCE },
      ])
    );
    const { handler, context } = setup();

    const result = await handler(context, request({ wait: 'complete' }), kibanaResponseFactory);

    expect(result.status).toBe(200);
    expect(result.payload).toEqual(
      expect.objectContaining({
        status: 'unresolved',
        readiness: 'best_effort',
        profile: null,
        profile_diagnostics: [{ profile: 'elastic-inference', evidence: EVIDENCE }],
      })
    );
  });

  it('maps a waited trace with no visible documents to 404', async () => {
    awaitTraceReadyMock.mockRejectedValue(
      new TraceReadinessError('no documents indexed', 'not_ready')
    );
    const { handler, context } = setup();

    const result = await handler(context, request({ wait: 'stable' }), kibanaResponseFactory);

    expect(result.status).toBe(404);
    expect(result.payload).toEqual({ message: 'no documents indexed' });
  });

  it('maps an oversized Elasticsearch response to an actionable 400', async () => {
    hasTraceDocumentsMock.mockRejectedValue(
      new errors.RequestAbortedError(
        'The content length (9000) is bigger than the maximum allowed buffer (42)'
      )
    );
    const { handler, context, logger } = setup();

    const result = await handler(context, request(), kibanaResponseFactory);

    expect(result.status).toBe(400);
    expect(result.payload.message).toContain('The response is too large to process');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('maps unexpected failures to a generic 500', async () => {
    hasTraceDocumentsMock.mockRejectedValue(new Error('sensitive failure details'));
    const { handler, context, logger } = setup();

    const result = await handler(context, request(), kibanaResponseFactory);

    expect(result.status).toBe(500);
    expect(result.payload).toEqual({ message: 'Failed to get trace evidence' });
    expect(logger.error).toHaveBeenCalled();
  });
});
