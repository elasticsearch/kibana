/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import moment from 'moment';
import { parseDurationToMs } from '../../infra/time';
import type {
  EngineLogExtractionState,
  LogExtractionConfig,
  RemoteLogExtractionState,
} from '../saved_objects';

export const WINDOW_CAP_GRACE_PERIOD_MS = 30_000;
const MAX_LAG_LOOKBACK_FACTOR = 1.5;

/** `now - delay`. Upper bound of all data eligible to be processed in this cycle. */
export const computeEffectiveWindowEnd = (delay: string): string =>
  moment().utc().subtract(parseDurationToMs(delay), 'millisecond').toISOString();

/** `now - lookbackPeriod`. Fallback start when no resume point is persisted. */
export const computeLookbackStart = (lookbackPeriod: string): string =>
  moment().utc().subtract(parseDurationToMs(lookbackPeriod), 'millisecond').toISOString();

/** Throws if `from > to`. Used to surface clock skew / corrupted resume state. */
export const validateExtractionWindow = (fromDateISO: string, toDateISO: string): void => {
  if (moment(fromDateISO).isAfter(moment(toDateISO))) {
    throw new Error(`From ${fromDateISO} date is after to ${toDateISO} date`);
  }
};

export interface MainExtractionWindow {
  fromDateISO: string;
  effectiveWindowEnd: string;
}

/**
 * Window for the main (origin-local) extraction path.
 *
 * Resume order: `checkpointTimestamp` (last slice end or mid-slice entity cursor) →
 * `lastExecutionTimestamp` (last completed cycle) → lookback fallback.
 */
export const resolveMainExtractionWindow = ({
  config,
  engineState,
}: {
  config: Pick<LogExtractionConfig, 'lookbackPeriod' | 'delay'>;
  engineState: Pick<EngineLogExtractionState, 'checkpointTimestamp' | 'lastExecutionTimestamp'>;
}): MainExtractionWindow => {
  const fromDateISO =
    engineState.checkpointTimestamp ||
    engineState.lastExecutionTimestamp ||
    computeLookbackStart(config.lookbackPeriod);
  const effectiveWindowEnd = computeEffectiveWindowEnd(config.delay);
  return { fromDateISO, effectiveWindowEnd };
};

export interface RemoteExtractionWindow {
  effectiveFromDateISO: string;
  effectiveWindowEnd: string;
  recoveryId: string | undefined;
  isWindowOverride: boolean;
}

/**
 * Window for the remote extraction path.
 *
 * Resume order: explicit `windowOverride` → mid entity-page recovery (`paginationRecoveryId` +
 * `checkpointTimestamp`) → slice-boundary recovery (`checkpointTimestamp` only) → lookback fallback.
 * Logs context for each branch so lagging / recovering state is observable.
 */
export const resolveRemoteExtractionWindow = ({
  config,
  state,
  windowOverride,
  logger,
}: {
  config: Pick<LogExtractionConfig, 'lookbackPeriod' | 'delay'>;
  state: Pick<RemoteLogExtractionState, 'checkpointTimestamp' | 'paginationRecoveryId'>;
  windowOverride?: { fromDateISO: string; toDateISO: string };
  logger: Logger;
}): RemoteExtractionWindow => {
  if (windowOverride != null) {
    return {
      effectiveFromDateISO: windowOverride.fromDateISO,
      effectiveWindowEnd: windowOverride.toDateISO,
      recoveryId: undefined,
      isWindowOverride: true,
    };
  }

  const effectiveWindowEnd = computeEffectiveWindowEnd(config.delay);

  if (state.paginationRecoveryId && state.checkpointTimestamp) {
    const effectiveFromDateISO = state.checkpointTimestamp;
    const recoveryId = state.paginationRecoveryId;
    logger.warn(
      `extraction resuming from broken state: checkpointTimestamp=${effectiveFromDateISO}, paginationRecoveryId=${recoveryId}`
    );
    return { effectiveFromDateISO, effectiveWindowEnd, recoveryId, isWindowOverride: false };
  }

  if (state.checkpointTimestamp) {
    logger.debug(
      `extraction resuming after slice boundary: checkpointTimestamp=${state.checkpointTimestamp}`
    );
    return {
      effectiveFromDateISO: state.checkpointTimestamp,
      effectiveWindowEnd,
      recoveryId: undefined,
      isWindowOverride: false,
    };
  }

  if (state.paginationRecoveryId && !state.checkpointTimestamp) {
    logger.error(
      `extraction can't be resumed from broken state because checkpointTimestamp is null (recovery id is present), defaulting to lookback period`
    );
  }

  const effectiveFromDateISO = computeLookbackStart(config.lookbackPeriod);
  logger.debug(`extraction starting fresh: fromDateISO=${effectiveFromDateISO}`);
  return {
    effectiveFromDateISO,
    effectiveWindowEnd,
    recoveryId: undefined,
    isWindowOverride: false,
  };
};

/**
 * Skip-ahead circuit breaker for stalled extractions.
 *
 * When the gap between `fromDateISO` and `effectiveWindowEnd` exceeds MAX_LAG_LOOKBACK_FACTOR × `lookbackPeriod`,
 * continuing to chip away at the backlog won't let the engine catch up. Reset the window start
 * to `effectiveWindowEnd - frequency` so this cycle still processes a real, frequency-sized
 * slice of recent data, re-anchoring the persisted checkpoint near real-time. The skipped range
 * is intentionally dropped.
 */
export const applyMaxLagCutoff = ({
  fromDateISO,
  effectiveWindowEnd,
  lookbackPeriod,
  frequency,
  logger,
}: {
  fromDateISO: string;
  effectiveWindowEnd: string;
  lookbackPeriod: string;
  frequency: string;
  logger: Logger;
}): string => {
  const fromMs = moment(fromDateISO).valueOf();
  const effectiveEndMs = moment(effectiveWindowEnd).valueOf();
  const lagMs = effectiveEndMs - fromMs;
  const lookbackMs = parseDurationToMs(lookbackPeriod);
  const thresholdMs = MAX_LAG_LOOKBACK_FACTOR * lookbackMs;

  if (lagMs <= thresholdMs) {
    return fromDateISO;
  }

  const frequencyMs = parseDurationToMs(frequency);
  const newFromDateISO = moment(effectiveEndMs - frequencyMs)
    .utc()
    .toISOString();

  const droppedMs = lagMs - frequencyMs;
  logger.warn(
    `Extraction lag exceeded ${thresholdMs} — skipping backlog: from=${fromDateISO}, newFrom=${newFromDateISO}, effectiveEnd=${effectiveWindowEnd}, lagMs=${lagMs}, droppedMs=${droppedMs}`
  );

  return newFromDateISO;
};

export interface CappedExtractionWindow {
  toDateISO: string;
  isCapped: boolean;
}

/**
 * Caps the extraction sub-window end so that probe cost stays bounded in lagging environments.
 *
 * Returns `effectiveWindowEnd` unchanged when the gap from `fromDateISO` is within
 * `maxTimeWindowSize + GRACE_PERIOD`. Otherwise returns `fromDateISO + maxTimeWindowSize` and
 * sets `isCapped = true`. Logs an info line when capping engages so lagging environments are
 * observable in operations.
 */
export const capExtractionWindowEnd = ({
  fromDateISO,
  effectiveWindowEnd,
  maxTimeWindowSize,
  logger,
}: {
  fromDateISO: string;
  effectiveWindowEnd: string;
  maxTimeWindowSize: string;
  logger: Logger;
}): CappedExtractionWindow => {
  const fromMs = moment(fromDateISO).valueOf();
  const effectiveEndMs = moment(effectiveWindowEnd).valueOf();
  const maxWindowSizeMs = parseDurationToMs(maxTimeWindowSize);
  const widthMs = effectiveEndMs - fromMs;

  if (widthMs <= maxWindowSizeMs + WINDOW_CAP_GRACE_PERIOD_MS) {
    return { toDateISO: effectiveWindowEnd, isCapped: false };
  }

  const cappedEnd = moment(fromMs + maxWindowSizeMs)
    .utc()
    .toISOString();
  logger.info(
    `Extraction sub-window capped: from=${fromDateISO}, to=${cappedEnd}, effectiveEnd=${effectiveWindowEnd}, behind=${
      widthMs - maxWindowSizeMs
    }ms`
  );
  return { toDateISO: cappedEnd, isCapped: true };
};
