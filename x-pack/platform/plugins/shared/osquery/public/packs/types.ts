/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { RRuleScheduleConfig, ScheduleType } from '../../common/schedule';
import type { Shard } from '../../common/utils/converters';
import type { PackQueryFormData } from './queries/use_pack_query_form';

export interface PackSavedObject {
  saved_object_id: string;
  name: string;
  description: string | undefined;
  queries: Record<string, Omit<PackQueryFormData, 'id'>>;
  version?: number;
  enabled: boolean | undefined;
  created_at: string;
  created_by: string | undefined;
  created_by_profile_uid?: string;
  updated_at: string;
  updated_by: string | undefined;
  updated_by_profile_uid?: string;
  policy_ids: string[];
  references: Array<{ name: string; id: string; type: string }>;
  /**
   * Pack-level schedule type. When absent, no pack-level schedule is set and
   * each query uses its own per-query `interval`. Only emitted when the
   * `rruleScheduling` feature flag is on (D25).
   */
  schedule_type?: ScheduleType;
  /** Pack-level interval (seconds). Only present when `schedule_type === 'interval'`. */
  interval?: number;
  /** Pack-level RRULE schedule. Only present when `schedule_type === 'rrule'`. */
  rrule_schedule?: RRuleScheduleConfig;
}

export type PackItem = PackSavedObject & {
  id: string;
  policy_ids: string[];
  read_only?: boolean;
  shards?: Shard;
};
