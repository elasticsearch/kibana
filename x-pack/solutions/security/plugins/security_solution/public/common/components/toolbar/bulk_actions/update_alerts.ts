/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UpdateByQueryResponse } from '@elastic/elasticsearch/lib/api/types';
import type { RuntimeFieldType } from '../../../../../common/api/detection_engine/signals/set_signal_status/set_signals_status_route.gen';
import type { AlertClosingReason } from '../../../../../common/types';
import type { Status } from '../../../../../common/api/detection_engine';
import {
  updateAlertStatusByIds,
  updateAlertStatusByQuery,
} from '../../../../detections/containers/detection_engine/alerts/api';
import type { BulkCloseRuntimeMappings } from './runtime_mappings_for_bulk_close';

export interface UpdatedAlertsResponse {
  updated: number;
  version_conflicts: UpdateByQueryResponse['version_conflicts'];
}

interface UpdatedAlertsProps {
  status: Status;
  query?: object;
  signalIds?: string[];
  signal?: AbortSignal;
  reason?: AlertClosingReason;
  /**
   * Optional map of field name to ES runtime field type. The server synthesizes
   * a `_source[fieldName]`-reading runtime field for each entry. Use this for
   * fields that are present on the alert `_source` but not in the alerts index
   * mapping — for example, runtime fields from a rule's source index that the
   * alerting framework copied onto the alert at rule-execution time.
   *
   * For data view runtime fields (including scripted fields), prefer
   * `runtimeMappings` instead — it preserves the full mapping (type + script)
   * so Elasticsearch evaluates the caller's Painless rather than falling back to
   * a `_source` read. Using this param for a scripted runtime field discards the
   * script and causes the close query to match a different set of alerts than the
   * grid displayed.
   */
  runtimeFields?: Record<string, RuntimeFieldType>;
  /**
   * Optional verbatim runtime field mappings forwarded directly to the
   * `_update_by_query` as `runtime_mappings`. Use this instead of `runtimeFields`
   * when closing via a data view runtime field: the full mapping (including any
   * Painless `script.source`) is preserved, so the close query operates on the
   * same set of alerts that the grid matched.
   *
   * Build this from `dataView.getRuntimeMappings()` using
   * {@link toBulkCloseRuntimeMappings} from `runtime_mappings_for_bulk_close.ts`.
   */
  runtimeMappings?: BulkCloseRuntimeMappings;
}

/**
 * Update alert status by query or signalIds.
 * Either query or signalIds must be provided.
 * `signalIds` is the preferred way to update alerts because it is more cost effective on Serverless.
 *
 * @throws An error if response is not OK
 */
export const updateAlertStatus = async ({
  status,
  query,
  signalIds,
  signal,
  reason,
  runtimeFields,
  runtimeMappings,
}: UpdatedAlertsProps): Promise<UpdatedAlertsResponse> => {
  if (signalIds && signalIds.length > 0) {
    const { updated } = await updateAlertStatusByIds({ status, signalIds, signal, reason });
    return {
      updated: updated ?? 0,
      version_conflicts: 0,
    };
  }
  if (query) {
    const { updated, version_conflicts: conflicts } = await updateAlertStatusByQuery({
      status,
      query,
      signal,
      reason,
      runtimeFields,
      runtimeMappings,
    });
    return {
      updated: updated ?? 0,
      version_conflicts: conflicts,
    };
  }
  throw new Error('Either query or signalIds must be provided');
};
