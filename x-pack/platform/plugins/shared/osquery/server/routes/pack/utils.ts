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
import type { AgentPolicy, PackagePolicy } from '@kbn/fleet-plugin/common';
import type { Shard } from '../../../common/utils/converters';
import { DEFAULT_PLATFORM } from '../../../common/constants';
import type { RRuleScheduleConfig, ScheduleType } from '../../../common';
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

export interface PackQueryInput {
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

// Default pick list for pack query SOs — byte-identical to the pre-rrule
// shape. Used when `schedule_type` is unset (the only path under
// `rruleScheduling: false`) and when a query inherits the pack's schedule in
// interval mode.
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

// Same fields minus `interval` — used when a query opts into rrule mode. The
// SO never carries both `interval` and `rrule_schedule` for one query (mutual
// exclusivity is enforced by building two disjoint pick lists rather than
// mutating one).
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

export const convertSOQueriesToPack = (queries: SOPackQuery[] | Record<string, PackQueryInput>) =>
  reduce(
    queries as Record<string, SOPackQuery>,
    (
      acc: Record<string, PackQueryInput>,
      { id: queryId, ecs_mapping, query, platform, ...rest }: SOPackQuery,
      key: string
    ) => {
      const index = queryId ?? key;
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

/**
 * Per-query response-boundary gate (response-side mirror of the wire-boundary
 * gate in `convertSOQueriesToPackConfig`). When the rrule feature flag is off,
 * strip per-query `schedule_type` and `rrule_schedule` from every query so the
 * "pretend this never happened" contract holds at the response boundary
 * regardless of what the SO carries. Per-query `interval` continues to
 * surface (legacy field).
 *
 * Accepts both the SO-array shape (`SOPackQuery[]`) and the converted-record
 * shape (`Record<string, PackQueryInput>`) so it can be applied uniformly
 * before any route's response build. When the flag is on, returns the input
 * unchanged (no allocation, no copy) so the hot path stays cheap.
 */
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

/**
 * Drop the per-query override fields that don't match the new pack mode.
 * Used on a PUT that transitions `schedule_type` (interval ↔ rrule, or clears
 * the mode) so the SO write and read-API responses don't carry stale
 * prior-mode overrides. Returns the same query verbatim when the per-query
 * `schedule_type` already matches `newPackMode`, when the query carries no
 * mode-specific fields, or when `newPackMode` is undefined (mode cleared —
 * drop both override flavours).
 */
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

export interface ConvertSOQueriesToPackConfigOptions {
  spaceId?: string;
  packSchedule?: PackScheduleInput;
  /**
   * Wire-boundary rollback gate. When `false`, ignore `packSchedule`
   * entirely (no `default_rrule_schedule`), drop per-query `rrule_schedule`,
   * fall back to per-query `interval` if present. `default_space_id`
   * continues to emit regardless of the flag.
   *
   * Required: callers must explicitly resolve this from
   * `osqueryContext.experimentalFeatures.rruleScheduling`. Failing closed
   * here prevents a missing wiring from silently shipping RRULE state to
   * Fleet when the feature is off.
   */
  isRruleFeatureEnabled: boolean;
}

export interface PackConfigOutput {
  default_native_schedule?: { interval: number };
  default_rrule_schedule?: RRuleScheduleConfig;
  default_space_id?: string;
  queries: Record<string, Record<string, unknown>>;
}

/**
 * Build the Fleet agent-policy `packs.{key}.queries` config plus pack-level
 * defaults from a pack's SO queries and optional pack-level schedule.
 *
 * Output shape:
 *   {
 *     default_native_schedule?: { interval: number };
 *     default_rrule_schedule?: RRuleScheduleConfig;
 *     default_space_id?: string;
 *     queries: Record<queryId, { query, schedule_id, start_date, ...overrides }>;
 *   }
 *
 * Per-query fields are emitted ONLY when they override the pack default (or
 * when there is no pack default — legacy mode). The mode invariant is
 * preserved: no query carries both `interval` and `rrule_schedule`, and no
 * query carries a mode different from the pack default.
 */
export const convertSOQueriesToPackConfig = (
  queries: SOPackQuery[] | Record<string, PackQueryInput>,
  options: ConvertSOQueriesToPackConfigOptions
): PackConfigOutput => {
  const { spaceId, packSchedule, isRruleFeatureEnabled } = options;

  // Single source of truth for the wire-boundary rollback gate: when the flag
  // is off, `packSchedule` is ignored in full — no `default_rrule_schedule`
  // AND no `default_native_schedule`. Per-query fallback to legacy `interval`
  // happens in the loop below.
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
        ...rest
      }: SOPackQuery,
      key: number
    ) => {
      const resultType = snapshot === false ? { removed, snapshot } : {};
      const index = queryId ? queryId : key;

      let scheduleFields: Record<string, unknown> = {};

      if (!isRruleFeatureEnabled) {
        // Wire-boundary rollback gate: ignore RRULE state entirely.
        // Fall back to legacy: per-query `interval` if present, otherwise
        // no schedule field on the query.
        if (interval !== undefined) {
          scheduleFields = { interval };
        }
      } else if (packMode === 'rrule') {
        // Pack runs rrule. Inherit by default; per-query override only when
        // the query opts into rrule explicitly. Any per-query `interval` on
        // the SO is stale — strip it (mode invariant).
        if (querySchedType === 'rrule' && queryRrule) {
          scheduleFields = { rrule_schedule: queryRrule };
        }
      } else if (packMode === 'interval') {
        // Pack runs interval. Inherit by default; per-query interval
        // override only when the query's `interval` differs from the pack
        // default. Any per-query `rrule_schedule` on the SO is stale.
        // Covers both explicit `schedule_type: 'interval'` overrides and
        // legacy queries without `schedule_type`; rrule overrides on an
        // interval pack are rejected at the validator but defensively
        // ignored here too.
        if (
          querySchedType !== 'rrule' &&
          interval !== undefined &&
          interval !== packSchedule?.interval
        ) {
          scheduleFields = { interval };
        }
      } else {
        // Legacy pack (no pack-level schedule): per-query `interval` only,
        // byte-identical to pre-feature output.
        if (interval !== undefined) {
          scheduleFields = { interval };
        }
      }

      // Suppress the legacy top-level `start_date` for rrule-mode queries.
      // The authoritative time-of-day lives in `rrule_schedule.start_date`;
      // emitting both causes osquerybeat to honour the stale create-time
      // top-level value instead of the user-chosen override.
      const startDateField =
        isRruleFeatureEnabled && (packMode === 'rrule' || querySchedType === 'rrule')
          ? {}
          : legacyStartDate !== undefined
          ? { start_date: legacyStartDate }
          : {};

      queriesOut[index] = omitBy(
        {
          ...rest,
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

  // `packMode` is forced to `undefined` when the flag is off, so neither
  // branch fires under rollback — no redundant flag check needed here.
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

/**
 * Strict RFC 3339 datetime regex matching the OpenAPI Zod `.datetime()` shape
 * and beats's `time.Parse(time.RFC3339, ...)` parser. Requires:
 * - YYYY-MM-DD
 * - `T` separator (uppercase)
 * - HH:MM:SS
 * - Optional fractional seconds
 * - Timezone offset `Z` or `±HH:MM`
 */
// Tightened component ranges (hour 00-23, minute/second 00-59, day 01-31,
// month 01-12) so the regex itself rejects the wall-clock values beats's
// `time.Parse(time.RFC3339, ...)` rejects without us having to round-trip
// through a parser. Calendar validity (Feb-31, leap-year Feb-29) is checked
// by `moment.parseZone(..., true)` below.
const RFC_3339_REGEX =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Strict RFC 3339 datetime validator. Rejects loose strings like
 * `"2024-01-01"` (no time component) which `Date.parse` would accept, AND
 * rejects calendar-invalid dates like `"2024-02-31T00:00:00Z"` that the JS
 * `Date` parser silently normalizes (Feb-31 → Mar-2). Beats's Go
 * `time.Parse(time.RFC3339, ...)` rejects these and aborts the entire RRULE
 * scheduler update on the agent, halting every other RRULE pack on the
 * policy — so we reject at the API edge.
 *
 * The regex enforces shape; `moment.parseZone(..., ISO_8601, true)` enforces
 * calendar validity (rejects Feb-31, Feb-29 in a non-leap year, etc.).
 */
export const isValidRfc3339 = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  if (!RFC_3339_REGEX.test(value)) return false;

  return moment.parseZone(value, moment.ISO_8601, true).isValid();
};

/**
 * Validate an `RRuleScheduleConfig` object at the API request boundary.
 * Returns `null` on success or a human-readable error message on failure.
 *
 * @param recurrenceSeconds - Conservative lower bound of the RRULE period in
 *   seconds (derived by the caller via {@link safeDerivePeriodSeconds}). When
 *   provided, the splay is also checked against the half-period rule enforced
 *   by osquerybeat: `splay ≤ period / 2`. When omitted, only the absolute 12h
 *   cap is checked (backward-compatible behaviour).
 */
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

/**
 * Validate the schedule fields on a pack-level create/update body and on
 * each per-query override. Enforces:
 * - Mutual exclusivity (no both `interval` and `rrule_schedule`).
 * - Pack-level discriminator presence when fields are present.
 * - Per-query same-mode constraint: every override SHALL match the
 *   pack's schedule_type.
 * - Field-level validity via `validateRruleConfig` (RFC 3339, parseability,
 *   splay cap, end_date > start_date).
 *
 * Returns `null` on success or a human-readable error message on failure.
 */
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
  // Pack-level mutual exclusivity.
  if (packInterval != null && packRrule) {
    return 'Pack cannot specify both pack-level interval and rrule_schedule';
  }

  // Pack-level discriminator: if schedule_type is set, the matching field
  // must be present; if a schedule field is set, schedule_type must match.
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
    // schedule_type unset: do not allow standalone pack-level interval /
    // rrule_schedule without the discriminator.
    if (packRrule) {
      return 'Pack rrule_schedule requires schedule_type "rrule"';
    }

    if (packInterval != null) {
      return 'Pack interval requires schedule_type "interval"';
    }
  }

  if (!queries) return null;

  for (const [queryId, query] of Object.entries(queries)) {
    // Per-query mutual exclusivity.
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

    // Same-mode constraint — when the pack has a mode, every query
    // override SHALL match.
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
  has(packagePolicy, `inputs[0].config.osquery.value.packs.${spaceId}--${packName}`) ||
  has(packagePolicy, `inputs[0].config.osquery.value.packs.${packName}`);

export const removePackFromPolicy = (
  draft: PackagePolicy,
  packName: string,
  spaceId: string
): void => {
  unset(draft, `inputs[0].config.osquery.value.packs.${spaceId}--${packName}`);
  unset(draft, `inputs[0].config.osquery.value.packs.${packName}`);
};

export const makePackKey = (packName: string, spaceId: string) => `${spaceId}--${packName}`;
/**
 * Filter and validate caller-supplied policy ids against the set of osquery
 * package-policy-supported agent policies. The `policyIds` argument is REQUIRED
 * and must be explicit — callers MUST resolve any "preserve current attachments"
 * semantic upstream (e.g. on the update path, fall back to the pack's existing
 * agent-policy references before calling). A bare `[]` here means: detach from
 * every policy, which was the silent default that previously caused the PUT-
 * without-`policy_ids` strip bug.
 */
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
