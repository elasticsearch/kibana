/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors as EsErrors } from '@elastic/elasticsearch';
import { isResponseError } from '@kbn/es-errors';
import type { Logger } from '@kbn/logging';
import { isEqual } from 'lodash';
import pRetry from 'p-retry';
import {
  extractProfilesEvidence,
  extractSelectedEvidence,
  hasResolvedEvidence,
  hasRootSpan,
  hasTraceDocuments,
  toInstrumentationProfileProbes,
  type EvidenceExtractionResult,
  type InstrumentationProfileEvidenceResult,
  type InstrumentationProfileProbeResult,
} from './evidence/evidence_service';
import { INSTRUMENTATION_PROFILES } from './evidence/profiles';
import type { EvidenceRound, InstrumentationProfile } from './evidence/types';
import type { TraceAccessorWithSearch } from './trace_accessor';
import { getNoTraceDocumentsMessage, TraceReadinessError } from './trace_readiness_errors';

export { TraceReadinessError } from './trace_readiness_errors';

export const STABILITY_WINDOW_MS = 5000;

export type TraceWaitMode = 'stable' | 'complete';
export type AchievedTraceReadiness = TraceWaitMode | 'best_effort';

export interface AwaitTraceReadyOptions {
  retries?: number;
  minTimeout?: number;
  maxTimeout?: number;
  factor?: number;
  stabilityWindowMs?: number;
}

export interface AwaitTraceReadyRequest {
  mode: TraceWaitMode;
  profile?: InstrumentationProfile;
}

export interface AwaitTraceReadyResult extends EvidenceExtractionResult {
  profile: InstrumentationProfile;
  readiness: AchievedTraceReadiness;
}

interface ReadinessBaseline {
  profile: InstrumentationProfile;
  round: EvidenceRound;
  timestamp: number;
}

const summarizeProfiles = (profiles: InstrumentationProfileProbeResult[]): string =>
  profiles
    .map(({ profile, evidence }) => {
      const statuses = [
        `user_query=${evidence.user_query.status}`,
        `agent_response=${evidence.agent_response.status}`,
        `tool_calls=${evidence.tool_calls.status}`,
      ].join(', ');
      return `${profile}(${statuses})`;
    })
    .join('; ');

const profileRequiresStabilityWindow = (profile: InstrumentationProfile): boolean =>
  Object.values(INSTRUMENTATION_PROFILES[profile]).some(({ source }) => source === 'logs');

const isRetryableSearchError = (error: unknown): error is Error => {
  if (isResponseError(error)) {
    const { statusCode } = error;
    return statusCode === 429 || (statusCode !== undefined && statusCode >= 500);
  }

  return error instanceof EsErrors.ConnectionError || error instanceof EsErrors.TimeoutError;
};

const abortRetryOnUnexpectedError = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof TraceReadinessError || isRetryableSearchError(error)) {
      throw error;
    }
    throw new pRetry.AbortError(error instanceof Error ? error : new Error(String(error)));
  }
};

/** Blocks until normalized trace evidence reaches the requested readiness level. */
export const awaitTraceReady = async (
  traceAccessor: TraceAccessorWithSearch,
  request: AwaitTraceReadyRequest,
  log: Logger,
  options: AwaitTraceReadyOptions = {}
): Promise<AwaitTraceReadyResult> => {
  const {
    retries = 8,
    minTimeout = 500,
    maxTimeout = 5000,
    factor = 2,
    stabilityWindowMs = STABILITY_WINDOW_MS,
  } = options;

  let baseline: ReadinessBaseline | undefined;
  let lastEvidence: AwaitTraceReadyResult | undefined;
  let latestProfiles: InstrumentationProfileEvidenceResult[] | undefined;
  let sawDocuments = false;

  const attemptReadiness = async (): Promise<AwaitTraceReadyResult> => {
    if (!sawDocuments && !(await hasTraceDocuments(traceAccessor))) {
      throw new TraceReadinessError(getNoTraceDocumentsMessage(traceAccessor.traceId), 'not_ready');
    }
    sawDocuments = true;

    const selection = await extractSelectedEvidence(traceAccessor, request.profile);
    latestProfiles = selection.profiles ?? latestProfiles;
    const { selected } = selection;

    if (!selected || !hasResolvedEvidence(selected.round)) {
      baseline = undefined;
      lastEvidence = undefined;
      throw new TraceReadinessError(
        `Trace ${
          traceAccessor.traceId
        } is not ready: documents indexed but no gradable evidence yet${
          request.profile ? ` for profile "${request.profile}"` : ''
        }`,
        'not_ready'
      );
    }

    lastEvidence = {
      ...selected,
      readiness: 'best_effort',
    };

    const now = Date.now();
    if (
      !baseline ||
      baseline.profile !== selected.profile ||
      !isEqual(baseline.round, selected.round)
    ) {
      baseline = { profile: selected.profile, round: selected.round, timestamp: now };
      throw new TraceReadinessError(
        `Trace ${traceAccessor.traceId} is not ready: awaiting stable evidence for profile "${selected.profile}"`,
        'not_ready'
      );
    }

    const requiredWindowMs =
      request.mode === 'stable' || profileRequiresStabilityWindow(selected.profile)
        ? stabilityWindowMs
        : 0;
    if (now - baseline.timestamp < requiredWindowMs) {
      throw new TraceReadinessError(
        `Trace ${traceAccessor.traceId} is not ready: evidence has not remained stable for ${requiredWindowMs}ms`,
        'not_ready'
      );
    }

    if (request.mode === 'complete') {
      if (!selected.round.response.message.trim() || !(await hasRootSpan(traceAccessor))) {
        throw new TraceReadinessError(
          `Trace ${traceAccessor.traceId} is not ready: awaiting a root span and completed response for profile "${selected.profile}"`,
          'not_ready'
        );
      }
    }

    return {
      ...selected,
      readiness: request.mode,
    };
  };

  try {
    return await pRetry(() => abortRetryOnUnexpectedError(attemptReadiness), {
      retries,
      factor,
      minTimeout,
      maxTimeout,
      onFailedAttempt: (error) => {
        log.debug(
          `Trace ${traceAccessor.traceId} not ready on attempt ${error.attemptNumber}; retrying`
        );
      },
    });
  } catch (error) {
    if (!(error instanceof TraceReadinessError)) {
      throw error;
    }

    if (lastEvidence) {
      log.warn(
        `Trace ${traceAccessor.traceId} did not reach ${request.mode} readiness within the budget; returning best-effort evidence for profile "${lastEvidence.profile}"`
      );
      return lastEvidence;
    }

    if (sawDocuments) {
      const profiles = latestProfiles ?? (await extractProfilesEvidence(traceAccessor));
      const probes = toInstrumentationProfileProbes(profiles);
      const requestedProfile = request.profile ? ` for profile "${request.profile}"` : '';
      throw new TraceReadinessError(
        `Trace ${
          traceAccessor.traceId
        } has documents but evidence is unresolvable${requestedProfile}. Probed profiles: ${summarizeProfiles(
          probes
        )}`,
        'unresolvable',
        probes
      );
    }

    throw error;
  }
};
