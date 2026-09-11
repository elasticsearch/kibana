/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  isEmpty,
  pick,
  reduce,
  isArray,
  filter,
  uniq,
  map,
  mapKeys,
  has,
  unset,
  difference,
  intersection,
  flatMap,
  omitBy,
  isUndefined,
  mapValues,
} from 'lodash';
import moment from 'moment-timezone';
import { satisfies } from 'semver';
import type { SavedObjectsClientContract } from '@kbn/core/server';
import type { AgentPolicy, PackagePolicy } from '@kbn/fleet-plugin/common';
import { PACKAGE_POLICY_SAVED_OBJECT_TYPE } from '@kbn/fleet-plugin/common';
import type { AgentPolicyServiceInterface, PackagePolicyClient } from '@kbn/fleet-plugin/server';
import { OSQUERY_INTEGRATION_NAME } from '../../../common';
import type { Shard } from '../../../common/utils/converters';
import { DEFAULT_PLATFORM } from '../../../common/constants';
import type { RRuleScheduleConfig, ScheduleType } from '../../../common';
// Type-only, so the `types.ts` -> `utils.ts` import below stays erased at
// compile time and no runtime cycle is introduced.
import type { TargetingWarning } from './types';
import { MAX_SPLAY_SECONDS } from '../../../common';
import { removeMultilines } from '../../../common/utils/build_query/remove_multilines';
import { convertECSMappingToArray, convertECSMappingToObject } from '../utils';
import { parseRRule } from '../../../common/utils/rrule_parser';
import {
  parseSplayPermissive,
  isSplayWithinHalfRecurrence,
  sumCompoundSeconds,
} from '../../../common/utils/splay_utils';
import { safeDerivePeriodSeconds } from '../../../common/utils/rrule_period';

// V4 backfill's start_date fallback when a pack SO lacks `created_at`.
// The wire builder suppresses this sentinel from interval-mode queries.
export const START_DATE_EPOCH_FALLBACK = '1970-01-01T00:00:00.000Z';

export interface PackQueryInput {
  /**
   * The query's existing stored `id`, optionally sent on an update body so a
   * rename edit (changed map key) can still resolve the original query and
   * preserve its `schedule_id`. Not used on create (id derives from the key).
   */
  id?: string;
  name?: string;
  query: string;
  interval?: number;
  platform?: string;
  version?: string;
  snapshot?: boolean;
  removed?: boolean;
  timeout?: number;
  schedule_id?: string;
  start_date?: string;
  ecs_mapping?: Record<string, unknown>;
  /** Per-query schedule type override. */
  schedule_type?: ScheduleType;
  /** Per-query RRULE override (only present when `schedule_type === 'rrule'`). */
  rrule_schedule?: RRuleScheduleConfig;
}

export interface SOPackQuery extends Omit<PackQueryInput, 'name'> {
  id: string;
  name: string;
}

// Byte-identical to the pre-rrule pick list.
const INTERVAL_MODE_PICK = [
  'name',
  'query',
  'interval',
  'platform',
  'version',
  'snapshot',
  'removed',
  'timeout',
  'schedule_id',
  'start_date',
] as const;

const RRULE_MODE_PICK = [
  'name',
  'query',
  'platform',
  'version',
  'snapshot',
  'removed',
  'timeout',
  'schedule_id',
  'start_date',
] as const;

export const convertPackQueriesToSO = (queries: Record<string, PackQueryInput>): SOPackQuery[] =>
  reduce(
    queries,
    (acc: SOPackQuery[], value: PackQueryInput, key: string) => {
      const ecsMapping = value.ecs_mapping
        ? convertECSMappingToArray(value.ecs_mapping as Record<string, object>)
        : undefined;

      const baseFields = pick(
        value,
        value.schedule_type === 'rrule' ? RRULE_MODE_PICK : INTERVAL_MODE_PICK
      );

      // Defense in depth: if a query carries `rrule_schedule` without
      // `schedule_type`, drop it. The route validator rejects this earlier;
      // this branch covers code paths that bypass the validator.
      let scheduleOverride: Partial<SOPackQuery> = {};
      if (value.schedule_type === 'rrule') {
        scheduleOverride = pick(value, ['schedule_type', 'rrule_schedule']);
      } else if (value.schedule_type === 'interval') {
        scheduleOverride = pick(value, ['schedule_type']);
      }

      acc.push({
        id: key,
        ...baseFields,
        ...scheduleOverride,
        ...(ecsMapping ? { ecs_mapping: ecsMapping } : {}),
      } as SOPackQuery);

      return acc;
    },
    []
  );

// Single source of truth for the stored-query key: id when present, else array index.
// The `query.id` truthiness check intentionally treats an empty-string id as
// ABSENT (a malformed '' id must fall back to the index/key, not be honored).
// FROZEN once V4 has shipped: feeds the deterministic schedule_id UUIDv5, so a
// change here silently changes migration output (as SCHEDULE_ID_NAME_PREFIX).
export const deriveEffectiveQueryKey = (
  query: { id?: string },
  indexOrKey: string | number
): string => (query.id ? query.id : String(indexOrKey));

// Shape-agnostic emptiness check for a pack's `queries` (array or record).
// Shared by the V4 mint guard and the reconciler's per-pack skip so they can't
// drift (the reconciler checks at its write site, being wire-first).
// Typed as a guard so a truthy result narrows away null/undefined.
export const hasQueries = <T extends unknown[] | Record<string, unknown>>(
  queries: T | null | undefined
): queries is T =>
  Array.isArray(queries) ? queries.length > 0 : Object.keys(queries ?? {}).length > 0;

export const convertSOQueriesToPack = (queries: SOPackQuery[] | Record<string, PackQueryInput>) =>
  reduce(
    queries as Record<string, SOPackQuery>,
    (
      acc: Record<string, PackQueryInput>,
      { id: queryId, ecs_mapping, query, platform, ...rest }: SOPackQuery,
      key: string
    ) => {
      const index = deriveEffectiveQueryKey({ id: queryId }, key);
      acc[index] = {
        ...rest,
        query,
        ...(!isEmpty(ecs_mapping)
          ? isArray(ecs_mapping)
            ? { ecs_mapping: convertECSMappingToObject(ecs_mapping) }
            : { ecs_mapping }
          : {}),
        ...(platform === DEFAULT_PLATFORM || platform === undefined ? {} : { platform }),
      };

      return acc;
    },
    {} as Record<string, PackQueryInput>
  );

/** Per-query fields preserved across an edit-save (keyed by stored query id). */
export interface PreservableQueryFields {
  schedule_id?: string;
  start_date?: string;
  rrule_schedule?: PackQueryInput['rrule_schedule'];
}

// Resolves which stored query each outgoing query preserves schedule_id
// from; a stored row is claimed at most once so two queries can't collapse
// onto one join key.
export const resolvePreservedQueries = (
  outgoingQueries: Record<string, PackQueryInput>,
  existingQueriesById: Record<string, PreservableQueryFields>
): Record<string, PreservableQueryFields> => {
  const consumedExistingIds = new Set<string>();

  const claim = (
    acc: Record<string, PreservableQueryFields>,
    queryKey: string,
    existingId: string | undefined
  ) => {
    if (existingId && !consumedExistingIds.has(existingId) && existingQueriesById[existingId]) {
      consumedExistingIds.add(existingId);
      acc[queryKey] = existingQueriesById[existingId];
    }

    return acc;
  };

  // Pass 1: queries matching by the client-supplied `id` (explicit rename intent).
  // Insertion order is the tie-break: the first claimant of a stored row wins,
  // and `claim` consumes each stored row at most once, so a crafted/duplicate
  // `id` cannot make two queries collapse onto the same schedule_id.
  const byId = Object.entries(outgoingQueries).reduce<Record<string, PreservableQueryFields>>(
    (acc, [queryKey, queryData]) => claim(acc, queryKey, queryData.id),
    {}
  );

  // Pass 2: remaining queries matched by their own map key.
  return Object.keys(outgoingQueries)
    .filter((queryKey) => !byId[queryKey])
    .reduce<Record<string, PreservableQueryFields>>(
      (acc, queryKey) => claim(acc, queryKey, queryKey),
      byId
    );
};

/**
 * Pack-level schedule descriptor passed by route handlers (drawn from the
 * pack SO attributes after the route's gating logic).
 */
export interface PackScheduleInput {
  schedule_type?: ScheduleType | null;
  interval?: number | null;
  rrule_schedule?: RRuleScheduleConfig | null;
}

/**
 * Build the discriminated pack-level schedule slice for a route response.
 * Returns the active-mode field(s) only, gated by the feature flag. When the
 * flag is off, returns an empty object — `schedule_type` and the active-mode
 * field are both hidden, symmetric with the wire-boundary gate.
 */
export const buildScheduleResponseSlice = (
  attributes: Pick<PackScheduleInput, 'schedule_type' | 'interval' | 'rrule_schedule'>,
  isRruleFeatureEnabled: boolean
):
  | { schedule_type: 'rrule'; rrule_schedule: RRuleScheduleConfig }
  | { schedule_type: 'interval'; interval: number }
  | {} => {
  if (!isRruleFeatureEnabled) return {};
  if (attributes.schedule_type === 'rrule' && attributes.rrule_schedule) {
    return { schedule_type: 'rrule', rrule_schedule: attributes.rrule_schedule };
  }

  if (attributes.schedule_type === 'interval' && attributes.interval != null) {
    return { schedule_type: 'interval', interval: attributes.interval };
  }

  return {};
};

// Response-side mirror of the wire-boundary gate: strips per-query rrule
// fields when the flag is off. No-op (no copy) when the flag is on.
export function stripPerQueryRruleFields<T extends SOPackQuery[] | Record<string, PackQueryInput>>(
  queries: T,
  isRruleFeatureEnabled: boolean
): T {
  if (isRruleFeatureEnabled || queries == null) return queries;

  if (isArray(queries)) {
    return queries.map(
      ({ schedule_type: _scheduleType, rrule_schedule: _rruleSchedule, ...rest }) => rest
    ) as T;
  }

  return mapValues(
    queries as Record<string, PackQueryInput>,
    ({ schedule_type: _scheduleType, rrule_schedule: _rruleSchedule, ...rest }) => rest
  ) as T;
}

export const stripPriorModePerQueryFields = (
  query: PackQueryInput,
  newPackMode: ScheduleType | undefined
): PackQueryInput => {
  if (newPackMode === 'rrule') {
    // Drop legacy interval override; preserve a same-mode rrule override.
    const { interval: _interval, ...rest } = query;
    if (rest.schedule_type === 'interval') {
      const { schedule_type: _scheduleType, ...stripped } = rest;

      return stripped;
    }

    return rest;
  }

  if (newPackMode === 'interval') {
    // Drop rrule override; preserve a same-mode interval override.
    const { schedule_type: scheduleType, rrule_schedule: _rruleSchedule, ...rest } = query;
    if (scheduleType === 'rrule') {
      return rest;
    }

    // Bare intervals (stale prebuilt-pack copies) are converged away separately by
    // convergePerQueryIntervals; here we only preserve an explicit same-mode override.
    return scheduleType === undefined ? rest : { ...rest, schedule_type: scheduleType };
  }

  // Mode cleared (or undefined). Drop both flavours of override.
  const {
    schedule_type: _scheduleType,
    rrule_schedule: _rruleSchedule,
    interval: _interval,
    ...rest
  } = query;

  return rest;
};

/**
 * Drop marker-less per-query intervals on write so the stored SO matches what
 * the agent runs: in an interval-mode pack a bare `interval` without an explicit
 * `schedule_type: 'interval'` marker is a stale prebuilt-pack copy the wire gate
 * (`convertSOQueriesToPackConfig`) already ignores. Explicit overrides and rrule
 * queries are left untouched.
 */
export const convergePerQueryIntervals = (
  queries: Record<string, PackQueryInput>,
  packScheduleType: ScheduleType | undefined | null
): Record<string, PackQueryInput> => {
  if (packScheduleType !== 'interval') return queries;

  return Object.fromEntries(
    Object.entries(queries).map(([key, query]) => {
      if (query.schedule_type === 'interval' || query.schedule_type === 'rrule') {
        return [key, query];
      }

      if (query.interval !== undefined) {
        const { interval: _interval, ...rest } = query;

        return [key, rest];
      }

      return [key, query];
    })
  );
};

export interface ConvertSOQueriesToPackConfigOptions {
  spaceId?: string;
  packSchedule?: PackScheduleInput;
  // Required — callers must resolve this explicitly so a missing wiring
  // never silently ships RRULE state to Fleet.
  isRruleFeatureEnabled: boolean;
  // Anchor used when the stored start_date is absent or the epoch sentinel.
  // The pack's created_at. When absent or unparseable the epoch sentinel is
  // emitted — deterministic, so the reconciler's diff gate holds.
  fallbackStartDate?: string;
}

export interface PackConfigOutput {
  default_native_schedule?: { interval: number };
  default_rrule_schedule?: RRuleScheduleConfig;
  default_space_id?: string;
  queries: Record<string, Record<string, unknown>>;
}

// Builds the Fleet packs.{key}.queries config plus pack-level defaults;
// per-query fields only emitted when they override the pack default.
export const convertSOQueriesToPackConfig = (
  queries: SOPackQuery[] | Record<string, PackQueryInput>,
  options: ConvertSOQueriesToPackConfigOptions
): PackConfigOutput => {
  const { spaceId, packSchedule, isRruleFeatureEnabled, fallbackStartDate } = options;
  // Never `now()`: a time-of-write anchor differs on every call, so the
  // reconciler would rewrite the policy (re-anchoring execution numbering) on
  // every restart. Validate rather than `?? EPOCH` — `created_at` is
  // `schema.maybe(schema.string())`, and an anchor beats can't parse (including
  // `''`, which `??` misses) makes it report execution count 0.
  const resolvedFallback = isValidRfc3339(fallbackStartDate)
    ? fallbackStartDate
    : START_DATE_EPOCH_FALLBACK;

  const packMode: ScheduleType | undefined = isRruleFeatureEnabled
    ? packSchedule?.schedule_type ?? undefined
    : undefined;

  const queriesOut: Record<string, Record<string, unknown>> = {};

  reduce(
    queries as SOPackQuery[],
    (
      _acc: null,
      {
        id: queryId,
        ecs_mapping,
        query,
        platform,
        removed,
        snapshot,
        interval,
        schedule_type: querySchedType,
        rrule_schedule: queryRrule,
        start_date: legacyStartDate,
        schedule_id: scheduleId,
        ...rest
      }: SOPackQuery,
      key: number
    ) => {
      const resultType = snapshot === false ? { removed, snapshot } : {};
      const index = deriveEffectiveQueryKey({ id: queryId }, key);

      let scheduleFields: Record<string, unknown> = {};

      if (!isRruleFeatureEnabled) {
        if (interval !== undefined) {
          scheduleFields = { interval };
        }
      } else if (packMode === 'rrule') {
        if (querySchedType === 'rrule' && queryRrule) {
          scheduleFields = { rrule_schedule: queryRrule };
        }
      } else if (packMode === 'interval') {
        // Emit a per-query interval only for an explicit flyout override; a bare
        // stored value must not shadow default_native_schedule.
        if (querySchedType === 'interval' && interval !== undefined) {
          scheduleFields = { interval };
        }
      } else {
        if (interval !== undefined) {
          scheduleFields = { interval };
        }
      }

      // Suppress start_date for rrule-mode (osquerybeat would honour the stale
      // value over the rrule_schedule.start_date anchor).
      // Interval mode must always carry an anchor or osquerybeat's
      // nativeScheduleExecutionCount returns 0 for every run.
      const isRruleMode =
        isRruleFeatureEnabled && (packMode === 'rrule' || querySchedType === 'rrule');
      const startDateField = isRruleMode
        ? {}
        : {
            start_date:
              legacyStartDate !== undefined && legacyStartDate !== START_DATE_EPOCH_FALLBACK
                ? legacyStartDate
                : resolvedFallback,
          };

      queriesOut[index] = omitBy(
        {
          ...rest,
          // Emitted flag-independent: it's a stable results-join key, not an rrule field.
          schedule_id: scheduleId,
          ...startDateField,
          ...scheduleFields,
          query: removeMultilines(query),
          ...(!isEmpty(ecs_mapping)
            ? isArray(ecs_mapping)
              ? { ecs_mapping: convertECSMappingToObject(ecs_mapping) }
              : { ecs_mapping }
            : {}),
          ...(platform === DEFAULT_PLATFORM || platform === undefined ? {} : { platform }),
          ...resultType,
          ...(spaceId ? { space_id: spaceId } : {}),
        },
        isUndefined
      );

      return null;
    },
    null
  );

  const output: PackConfigOutput = { queries: queriesOut };

  if (packMode === 'rrule' && packSchedule?.rrule_schedule) {
    output.default_rrule_schedule = packSchedule.rrule_schedule;
  } else if (packMode === 'interval' && packSchedule?.interval != null) {
    output.default_native_schedule = { interval: packSchedule.interval };
  }

  if (spaceId) {
    output.default_space_id = spaceId;
  }

  return output;
};

/**
 * Format a duration in seconds as a Go-style duration string (e.g. `"1h0m0s"`,
 * `"5m0s"`, `"30s"`). Mirrors the beats log format for the splay error message
 * so the Kibana `400` message is directly searchable alongside agent logs.
 */
const formatGoDurationSeconds = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h${minutes}m${seconds}s`;
  if (minutes > 0) return `${minutes}m${seconds}s`;

  return `${seconds}s`;
};

// Strict RFC 3339 datetime regex matching beats's time.Parse(time.RFC3339, ...) parser.
const RFC_3339_REGEX =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

// Rejects loose/calendar-invalid dates that Date.parse silently accepts —
// beats's RFC3339 parser rejects them and halts the whole RRULE scheduler on the agent.
export const isValidRfc3339 = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  if (!RFC_3339_REGEX.test(value)) return false;

  return moment.parseZone(value, moment.ISO_8601, true).isValid();
};

// Validates an RRuleScheduleConfig at the request boundary; returns an error message or null.
export const validateRruleConfig = (
  config: Partial<RRuleScheduleConfig>,
  recurrenceSeconds?: number
): string | null => {
  if (!config || typeof config !== 'object') {
    return 'rrule_schedule must be an object';
  }

  if (typeof config.rrule !== 'string' || config.rrule.length === 0) {
    return 'rrule_schedule.rrule is required and must be a non-empty string';
  }

  // Parse the string with the actual parser so malformed RRULEs never reach
  // beats. The 2048-char length cap is enforced upstream by the io-ts schema
  // (`boundedString(2048)` in `shared_schemas.ts`).
  try {
    parseRRule(config.rrule);
  } catch (error) {
    return `rrule_schedule.rrule is invalid: ${(error as Error).message}`;
  }

  if (typeof config.start_date !== 'string' || !isValidRfc3339(config.start_date)) {
    return 'rrule_schedule.start_date must be an RFC 3339 datetime (e.g. 2024-01-01T00:00:00Z)';
  }

  if (config.end_date !== undefined) {
    if (!isValidRfc3339(config.end_date)) {
      return 'rrule_schedule.end_date must be an RFC 3339 datetime (e.g. 2024-01-01T00:00:00Z)';
    }

    if (Date.parse(config.end_date) <= Date.parse(config.start_date)) {
      return 'rrule_schedule.end_date must be after rrule_schedule.start_date';
    }
  }

  if (config.splay !== undefined) {
    if (typeof config.splay !== 'string') {
      return 'rrule_schedule.splay must be a string';
    }

    if (config.splay.length > 64) {
      return 'rrule_schedule.splay must not exceed 64 characters';
    }

    let parsedSplay;
    try {
      parsedSplay = parseSplayPermissive(config.splay);
    } catch (error) {
      return `rrule_schedule.splay is invalid: ${(error as Error).message}`;
    }

    const seconds =
      parsedSplay.kind === 'simple'
        ? parsedSplay.value * ({ seconds: 1, minutes: 60, hours: 3600 }[parsedSplay.unit] as number)
        : sumCompoundSeconds(parsedSplay.raw);
    if (seconds > MAX_SPLAY_SECONDS) {
      return `rrule_schedule.splay must not exceed ${MAX_SPLAY_SECONDS} seconds (12 hours)`;
    }

    if (
      recurrenceSeconds !== undefined &&
      !isSplayWithinHalfRecurrence(seconds, recurrenceSeconds)
    ) {
      const halfPeriod = formatGoDurationSeconds(Math.floor(recurrenceSeconds / 2));
      const period = formatGoDurationSeconds(recurrenceSeconds);
      const provided = formatGoDurationSeconds(seconds);

      return `rrule_schedule.splay must be at most ${halfPeriod} (half of minimum interval ${period}), got: ${provided}`;
    }
  }

  if (config.timeout !== undefined) {
    if (typeof config.timeout !== 'number' || config.timeout <= 0) {
      return 'rrule_schedule.timeout must be a positive number (seconds)';
    }
  }

  return null;
};

export interface ResolvedPackSchedule {
  scheduleType: ScheduleType | undefined;
  interval: number | null | undefined;
  rrule_schedule: Partial<RRuleScheduleConfig> | null | undefined;
  transitioned: boolean;
}

export const resolvePackScheduleForUpdate = ({
  current,
  request,
  isRruleFeatureEnabled,
}: {
  current: {
    schedule_type?: ScheduleType | null;
    interval?: number | null;
    rrule_schedule?: RRuleScheduleConfig | null;
  };
  request: {
    schedule_type?: ScheduleType | null;
    interval?: number | null;
    rrule_schedule?: Partial<RRuleScheduleConfig> | null;
    scheduleTypePresent: boolean;
    intervalPresent: boolean;
    rruleSchedulePresent: boolean;
  };
  isRruleFeatureEnabled: boolean;
}): ResolvedPackSchedule => {
  if (!isRruleFeatureEnabled) {
    return {
      scheduleType: current.schedule_type ?? undefined,
      interval: current.interval ?? undefined,
      rrule_schedule: current.rrule_schedule ?? undefined,
      transitioned: false,
    };
  }

  const scheduleType = request.scheduleTypePresent
    ? request.schedule_type ?? undefined
    : current.schedule_type ?? undefined;

  const transitioned =
    request.scheduleTypePresent && request.schedule_type !== current.schedule_type;

  let interval: number | null | undefined;
  if (request.intervalPresent) {
    interval = request.interval ?? null;
  } else if (transitioned && scheduleType !== 'interval') {
    interval = null;
  } else {
    interval = current.interval ?? undefined;
  }

  let rruleSchedule: Partial<RRuleScheduleConfig> | null | undefined;
  if (request.rruleSchedulePresent) {
    if (
      request.rrule_schedule &&
      current.rrule_schedule &&
      !transitioned &&
      scheduleType === 'rrule'
    ) {
      rruleSchedule = { ...current.rrule_schedule, ...request.rrule_schedule };
    } else {
      rruleSchedule = request.rrule_schedule ?? null;
    }
  } else if (transitioned && scheduleType !== 'rrule') {
    rruleSchedule = null;
  } else {
    rruleSchedule = current.rrule_schedule ?? undefined;
  }

  return { scheduleType, interval, rrule_schedule: rruleSchedule, transitioned };
};

export const validatePackScheduleFields = ({
  packScheduleType,
  packInterval,
  packRrule,
  queries,
}: {
  packScheduleType?: ScheduleType | null;
  packInterval?: number | null;
  packRrule?: Partial<RRuleScheduleConfig> | null;
  queries?: Record<
    string,
    {
      interval?: number;
      schedule_type?: ScheduleType;
      rrule_schedule?: Partial<RRuleScheduleConfig>;
    }
  >;
}): string | null => {
  if (packInterval != null && packRrule) {
    return 'Pack cannot specify both pack-level interval and rrule_schedule';
  }

  if (packScheduleType === 'rrule') {
    if (!packRrule) {
      return 'Pack schedule_type "rrule" requires rrule_schedule';
    }

    const packPeriodSeconds = packRrule.rrule
      ? safeDerivePeriodSeconds(packRrule.rrule)
      : undefined;
    const error = validateRruleConfig(packRrule, packPeriodSeconds);
    if (error) return error;
  } else if (packScheduleType === 'interval') {
    if (packInterval == null) {
      return 'Pack schedule_type "interval" requires pack-level interval';
    }

    if (typeof packInterval !== 'number' || packInterval <= 0) {
      return 'Pack interval must be a positive number (seconds)';
    }
  } else {
    if (packRrule) {
      return 'Pack rrule_schedule requires schedule_type "rrule"';
    }

    if (packInterval != null) {
      return 'Pack interval requires schedule_type "interval"';
    }
  }

  if (!queries) return null;

  for (const [queryId, query] of Object.entries(queries)) {
    if (query.interval !== undefined && query.rrule_schedule) {
      return `Query "${queryId}" cannot specify both interval and rrule_schedule`;
    }

    if (!packScheduleType && (query.schedule_type || query.rrule_schedule)) {
      return `Query "${queryId}" specifies schedule_type/rrule_schedule but the pack has no schedule_type; set the pack-level schedule_type first`;
    }

    if (query.schedule_type === 'rrule') {
      if (!query.rrule_schedule) {
        return `Query "${queryId}" schedule_type "rrule" requires rrule_schedule`;
      }

      const queryPeriodSeconds =
        (query.rrule_schedule.rrule
          ? safeDerivePeriodSeconds(query.rrule_schedule.rrule)
          : undefined) ?? (packRrule?.rrule ? safeDerivePeriodSeconds(packRrule.rrule) : undefined);
      const error = validateRruleConfig(query.rrule_schedule, queryPeriodSeconds);
      if (error) return `Query "${queryId}": ${error}`;
    } else if (query.schedule_type === 'interval') {
      if (
        query.interval !== undefined &&
        (typeof query.interval !== 'number' || query.interval <= 0)
      ) {
        return `Query "${queryId}" interval must be a positive number (seconds)`;
      }
    }

    if (packScheduleType && query.schedule_type && query.schedule_type !== packScheduleType) {
      return `Query "${queryId}" schedule_type "${query.schedule_type}" does not match pack schedule_type "${packScheduleType}"; per-query overrides must use the same mode as the pack`;
    }

    if (packScheduleType === 'rrule' && query.interval !== undefined) {
      return `Query "${queryId}" carries interval but the pack uses schedule_type "rrule"; per-query overrides must use the same mode as the pack`;
    }

    if (packScheduleType === 'interval' && query.rrule_schedule) {
      return `Query "${queryId}" carries rrule_schedule but the pack uses schedule_type "interval"; per-query overrides must use the same mode as the pack`;
    }
  }

  return null;
};

export const policyHasPack = (
  packagePolicy: PackagePolicy,
  packName: string,
  spaceId: string
): boolean =>
  has(packagePolicy, `inputs[0].config.osquery.value.packs.${makePackKey(packName, spaceId)}`) ||
  has(packagePolicy, `inputs[0].config.osquery.value.packs.${packName}`);

export const removePackFromPolicy = (
  draft: PackagePolicy,
  packName: string,
  spaceId: string
): void => {
  unset(draft, `inputs[0].config.osquery.value.packs.${makePackKey(packName, spaceId)}`);
  unset(draft, `inputs[0].config.osquery.value.packs.${packName}`);
};

/**
 * Separator between a pack block's space id and pack name on the wire. Both
 * halves can contain it, so it is only ever used to BUILD a key or to strip a
 * known prefix — never to split an arbitrary key into two parts.
 */
export const PACK_KEY_SEPARATOR = '--';

export const makePackKey = (packName: string, spaceId: string) =>
  `${spaceId}${PACK_KEY_SEPARATOR}${packName}`;

/**
 * Drain ALL osquery package policies via keyset `fetchAllItems`. Shared by the
 * create/delete/update routes and the reconciler; replaces the offset-capped
 * `list({ perPage: 1000 })` that silently dropped policies past the first 1000.
 */
export const fetchAllPackagePolicies = async (
  packagePolicyService: PackagePolicyClient | undefined,
  soClient: SavedObjectsClientContract,
  kuery = `${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.package.name:${OSQUERY_INTEGRATION_NAME}`,
  // With Fleet space awareness enabled, policies live in per-space namespaces
  // and the drain only sees the soClient's space unless told otherwise. Pass
  // `['*']` to enumerate every space (Fleet's documented wildcard).
  spaceIds?: string[]
): Promise<PackagePolicy[]> => {
  const packagePolicies: PackagePolicy[] = [];
  if (!packagePolicyService) {
    return packagePolicies;
  }

  for await (const policyBatch of await packagePolicyService.fetchAllItems(soClient, {
    kuery,
    ...(spaceIds ? { spaceIds } : {}),
  })) {
    packagePolicies.push(...policyBatch);
  }

  return packagePolicies;
};

// policyIds is required and explicit; callers resolve "preserve current
// attachments" upstream. An empty array here detaches from every policy.
export const getInitialPolicies = (
  packagePolicies: PackagePolicy[] | never[],
  policyIds: string[],
  shards?: Shard
): { policiesList: string[]; invalidPolicies?: string[] } => {
  const supportedPackagePolicies = filter(packagePolicies, (packagePolicy) =>
    satisfies(packagePolicy.package?.version ?? '', '>=0.6.0')
  );

  const supportedPackagePolicyIds = uniq(flatMap(supportedPackagePolicies, 'policy_ids'));
  // we want to find all policies, because this is a global pack
  if (shards?.['*']) {
    return { policiesList: supportedPackagePolicyIds };
  }

  // Return only policyIds that are present in supportedPackagePolicyIds
  const policiesList = intersection(uniq(policyIds), supportedPackagePolicyIds);
  // Collect leftover policyIds
  const invalidPolicies = difference(uniq(policyIds), policiesList);

  return {
    policiesList,
    ...(invalidPolicies.length && { invalidPolicies }),
  };
};

export const findMatchingShards = (agentPolicies: AgentPolicy[] | undefined, shards?: Shard) => {
  const policyShards: Shard = {};
  if (!isEmpty(shards)) {
    const agentPoliciesIdMap = mapKeys(agentPolicies, 'id');

    map(shards, (shard, shardName) => {
      if (agentPoliciesIdMap[shardName]) {
        policyShards[agentPoliciesIdMap[shardName].id] = shard;
      }
    });
  }

  return policyShards;
};

/**
 * Default shard percentage applied to a pack entry when a targeting agent
 * policy carries no explicit shard value.
 */
export const DEFAULT_PACK_SHARD = 100;

/** A single write target: the Fleet package policy plus every one of the
 * pack's agent policy ids that resolved to it. */
interface PackagePolicyWriteTarget {
  packagePolicy: PackagePolicy;
  agentPolicyIds: string[];
}

/**
 * Groups `agentPolicyIds` by their resolved Fleet package-policy id.
 * A package policy's `policy_ids` is an array, so distinct agent policy ids
 * can resolve to the *same* package policy; grouping first means the caller
 * issues exactly one `packagePolicyService.update` per package policy
 * instead of one concurrent write per agent-policy id (the source of the
 * duplicate-schedule race). Agent policy ids that resolve to no package
 * policy are skipped, matching the previous per-id `.find()` behaviour.
 */
export const groupAgentPolicyIdsByPackagePolicy = (
  agentPolicyIds: string[],
  packagePolicies: PackagePolicy[]
): Map<string, PackagePolicyWriteTarget> => {
  const writeTargetsByPackagePolicyId = new Map<string, PackagePolicyWriteTarget>();

  for (const agentPolicyId of agentPolicyIds) {
    const packagePolicy = packagePolicies.find((policy) =>
      policy.policy_ids.includes(agentPolicyId)
    );
    if (!packagePolicy) continue;

    const existingTarget = writeTargetsByPackagePolicyId.get(packagePolicy.id);
    if (existingTarget) {
      existingTarget.agentPolicyIds.push(agentPolicyId);
    } else {
      writeTargetsByPackagePolicyId.set(packagePolicy.id, {
        packagePolicy,
        agentPolicyIds: [agentPolicyId],
      });
    }
  }

  return writeTargetsByPackagePolicyId;
};

/**
 * Resolves the single, deterministic shard to write for a package policy
 * that is targeted by one or more of the pack's agent policies. When every
 * targeting agent policy carries the same shard (the common case, including
 * 1:1 targeting), that value is returned unchanged. When they differ, the
 * chosen rule is the MAXIMUM shard value: it is order-independent (unlike
 * "first seen"), so repeating the same operation always yields the same
 * result regardless of array/Map iteration order.
 *
 * A shared package policy genuinely can cover several of the pack's agent
 * policies with different shard values, and the wire has exactly one `shard`
 * slot per pack block — so a collapse rule is unavoidable here. Widest-wins
 * is the safe direction: the pack is already delivered to every agent policy
 * on the shared package policy (see `buildTargetingWarning`), so picking the
 * maximum keeps the configured rollout percentage of the most permissive
 * target rather than silently shrinking it.
 *
 * The reduce is seeded with `-Infinity` (the identity for `Math.max`) so a
 * single value — including a negative one — passes through unchanged, keeping
 * exact parity with the previous per-agent-policy `policyShards[id] ?? 100`
 * behaviour. An empty input returns `DEFAULT_PACK_SHARD`.
 */
export const resolveSharedPackagePolicyShard = (
  agentPolicyIds: string[],
  policyShards: Shard
): number => {
  if (agentPolicyIds.length === 0) {
    return DEFAULT_PACK_SHARD;
  }

  return agentPolicyIds.reduce(
    (maxShard, agentPolicyId) =>
      Math.max(maxShard, policyShards[agentPolicyId] ?? DEFAULT_PACK_SHARD),
    -Infinity
  );
};

// ---------------------------------------------------------------------------
// Targeting scope helpers
// ---------------------------------------------------------------------------

/** Classification of a resolved package policy relative to a pack's target set. */
export type PackagePolicyScopeKind = 'exact' | 'over-broad';

/** Result of classifying one resolved package policy. */
export interface PackagePolicyScopeResult {
  packagePolicy: PackagePolicy;
  kind: PackagePolicyScopeKind;
  /** The pack's targeted agent policy ids that this package policy covers. */
  agentPolicyIds: string[];
  /** Agent policy ids in `packagePolicy.policy_ids` that are outside the pack's target set. */
  untargetedAgentPolicyIds: string[];
}

/**
 * Classifies each resolved package policy as `exact` (its `policy_ids` ⊆ the
 * pack's target set) or `over-broad` (covers agent policies outside the target
 * set). Global (`*`-shard) packs are always `exact` — they intend to reach
 * every agent policy.
 *
 * `writeTargets` is the output of `groupAgentPolicyIdsByPackagePolicy`.
 * `isGlobalPack` is true when `shards` contains the `*` key.
 */
export const resolvePackTargetScope = (
  writeTargets: Map<string, PackagePolicyWriteTarget>,
  isGlobalPack: boolean
): PackagePolicyScopeResult[] => {
  const results: PackagePolicyScopeResult[] = [];

  for (const { packagePolicy, agentPolicyIds } of writeTargets.values()) {
    if (isGlobalPack) {
      results.push({
        packagePolicy,
        kind: 'exact',
        agentPolicyIds,
        untargetedAgentPolicyIds: [],
      });
      continue;
    }

    const targetSet = new Set(agentPolicyIds);
    const untargetedAgentPolicyIds = packagePolicy.policy_ids.filter((id) => !targetSet.has(id));

    results.push({
      packagePolicy,
      kind: untargetedAgentPolicyIds.length > 0 ? 'over-broad' : 'exact',
      agentPolicyIds,
      untargetedAgentPolicyIds,
    });
  }

  return results;
};

/**
 * Builds the `targeting_warning` for a pack whose resolved package policies
 * reach agent policies outside its target set, or `undefined` when targeting
 * is exact.
 *
 * Kibana cannot enforce narrower delivery: `osquery_manager` declares
 * `multiple: false`, so Fleet allows only one osquery package policy per agent
 * policy and a dedicated "targeted" policy can never be created for an agent
 * policy that already has one. The warning is therefore the remedy, not a
 * fallback — it names the agent policies that also receive the pack so the user
 * can split the integration in Fleet if they need true isolation. See #285994.
 *
 * An untargeted agent policy that no longer resolves (deleted between the write
 * and this lookup) is reported by id rather than dropped: a warning listing
 * fewer policies than actually receive the pack would understate the blast
 * radius, which is the opposite of this field's purpose.
 */
export const buildTargetingWarning = async (
  scopeResults: PackagePolicyScopeResult[],
  agentPolicyService: AgentPolicyServiceInterface | undefined,
  soClient: SavedObjectsClientContract
): Promise<TargetingWarning | undefined> => {
  const untargetedIds = uniq(
    scopeResults
      .filter((result) => result.kind === 'over-broad')
      .flatMap((result) => result.untargetedAgentPolicyIds)
  );

  if (!untargetedIds.length) {
    return undefined;
  }

  // `ignoreMissing`: a deleted agent policy must not fail the whole lookup.
  const agentPolicies = await agentPolicyService?.getByIds(soClient, untargetedIds, {
    ignoreMissing: true,
  });
  const nameById = new Map((agentPolicies ?? []).map((ap) => [ap.id, ap.name]));

  return {
    untargeted_agent_policy_names: untargetedIds.map((id) => nameById.get(id) ?? id),
  };
};
