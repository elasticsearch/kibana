/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { TypeOf } from '@kbn/config-schema';
import { MIN_SCHEDULE_INTERVAL } from '@kbn/alerting-v2-schemas';
import { parseDurationToMs, validateDuration } from './lib/duration';

/** Default value of `xpack.alerting_v2.rules.minimumScheduleInterval`. */
const MINIMUM_SCHEDULE_INTERVAL_DEFAULT = '1m';
/**
 * Lowest value `xpack.alerting_v2.rules.minimumScheduleInterval` may be set to.
 * Tied to the absolute minimum a rule `schedule.every` can be, so functional
 * tests can relax the guardrail and run rules every few seconds. The default
 * remains 1m, so production deployments keep the 1m minimum unless an operator
 * deliberately lowers it.
 */
const MINIMUM_SCHEDULE_INTERVAL_FLOOR = MIN_SCHEDULE_INTERVAL;
/** Highest value `xpack.alerting_v2.rules.minimumScheduleInterval` may be set to. */
const MAX_MINIMUM_SCHEDULE_INTERVAL = '30d';

const rulesSchema = schema.object({
  /**
   * Smallest `schedule.every` a rule is allowed to use. Rules created, updated
   * or enabled with a shorter interval are rejected. Configurable between the
   * absolute rule-schedule minimum and 30d; defaults to 1m.
   */
  minimumScheduleInterval: schema.string({
    defaultValue: MINIMUM_SCHEDULE_INTERVAL_DEFAULT,
    validate: (duration: string): string | undefined => {
      const formatError = validateDuration(duration);
      if (formatError) {
        return formatError;
      }

      const durationMs = parseDurationToMs(duration);
      if (durationMs < parseDurationToMs(MINIMUM_SCHEDULE_INTERVAL_FLOOR)) {
        return `duration cannot be less than ${MINIMUM_SCHEDULE_INTERVAL_FLOOR}`;
      }
      if (durationMs > parseDurationToMs(MAX_MINIMUM_SCHEDULE_INTERVAL)) {
        return `duration cannot exceed ${MAX_MINIMUM_SCHEDULE_INTERVAL}`;
      }
    },
  }),
  /**
   * Upper bound on the combined number of rule runs per minute across all
   * spaces. Creating, updating or enabling a rule that would push the total
   * past this limit is rejected.
   */
  maxScheduledPerMinute: schema.number({ defaultValue: 400, min: 0, max: 32000 }),
});

export const configSchema = schema.object({
  enabled: schema.boolean({ defaultValue: false }),
  invalidateApiKeysTask: schema.object({
    interval: schema.string({ defaultValue: '5m', validate: validateDuration }),
    removalDelay: schema.string({ defaultValue: '1h', validate: validateDuration }),
  }),
  rules: rulesSchema,
});

export type PluginConfig = TypeOf<typeof configSchema>;
export type RulesConfig = TypeOf<typeof rulesSchema>;
