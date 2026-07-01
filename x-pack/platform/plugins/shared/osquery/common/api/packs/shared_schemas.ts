/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as t from 'io-ts';
import { toNumberRt } from '@kbn/io-ts-utils';

// String-length cap on string fields. Defense at the API edge against
// blob-sized payloads (RRULE, splay, dates) — SO `unknowns: 'allow'` would
// otherwise persist them. Fine-grained validity is enforced by
// `validateRruleConfig`/`parseRRule` in the route handler.
export const boundedString = (maxLength: number) =>
  new t.Type<string, string, unknown>(
    'BoundedString',
    (u): u is string => typeof u === 'string',
    (u, c) => {
      if (typeof u !== 'string') return t.failure(u, c, 'expected string');
      if (u.length > maxLength)
        return t.failure(u, c, `string must not exceed ${maxLength} characters`);

      return t.success(u);
    },
    t.identity
  );

/**
 * RRULE schedule config — wire shape mirroring `RRuleScheduleConfig`
 * in `common/schedule.ts`. Field-level validity (RFC 3339, RRULE
 * parseability, splay cap) is enforced in the route handler so a single
 * error message is returned per offending field.
 *
 * On create the discriminator branch requires `rrule` + `start_date`;
 * see {@link rruleScheduleConfigPartialRt} for the update-body shape
 * that allows PATCH-style merges against the existing SO.
 */
export const rruleScheduleConfigRt = t.intersection([
  t.type({
    rrule: boundedString(2048),
    start_date: boundedString(64),
  }),
  t.partial({
    end_date: boundedString(64),
    splay: boundedString(64),
    timeout: toNumberRt,
  }),
]);

/**
 * Update-body variant of {@link rruleScheduleConfigRt}: every field is
 * optional so a client can change just `rrule` / `splay` / `start_date`
 * without restating the rest. The route handler merges the partial
 * against the existing SO before running `validatePackScheduleFields`,
 * which still enforces the strict shape post-merge (rrule + start_date
 * required, RFC 3339, parseability, splay cap, etc.).
 */
export const rruleScheduleConfigPartialRt = t.partial({
  rrule: boundedString(2048),
  start_date: boundedString(64),
  end_date: boundedString(64),
  splay: boundedString(64),
  timeout: toNumberRt,
});

const basePackQueryFields = {
  interval: toNumberRt,
  snapshot: t.boolean,
  removed: t.boolean,
  platform: t.string,
  version: t.string,
  ecs_mapping: t.record(
    t.string,
    t.type({
      field: t.union([t.string, t.undefined]),
      value: t.union([t.string, t.array(t.string), t.undefined]),
    })
  ),
  schedule_type: t.union([t.literal('interval'), t.literal('rrule')]),
};

export const packQueryRecordRt = t.record(
  t.string,
  t.intersection([
    t.type({
      query: t.string,
    }),
    t.partial({
      ...basePackQueryFields,
      rrule_schedule: rruleScheduleConfigRt,
    }),
  ])
);

/**
 * Update-body variant of {@link packQueryRecordRt}: per-query
 * `rrule_schedule` accepts a partial object so a same-mode override edit
 * (e.g. bumping only `splay`) round-trips through the API. The route
 * handler merges per-query partials against the existing per-query
 * `rrule_schedule` on the SO before validation.
 */
export const packQueryRecordPartialRt = t.record(
  t.string,
  t.intersection([
    t.type({
      query: t.string,
    }),
    t.partial({
      ...basePackQueryFields,
      // The query's existing stored `id`. Lets a rename edit (where the map key
      // changes) carry the original id so the route preserves the query's
      // `schedule_id` instead of minting a new one and severing its history.
      id: t.string,
      rrule_schedule: rruleScheduleConfigPartialRt,
    }),
  ])
);
