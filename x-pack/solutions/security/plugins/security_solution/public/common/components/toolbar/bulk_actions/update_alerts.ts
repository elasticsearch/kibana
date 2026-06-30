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
  runtimeFields?: Record<string, RuntimeFieldType>;
}

/**
 * Update alert status by query or signalIds.
 *  Either query or signalIds must be provided
 * `signalIds` is the preferred way to update alerts because it is more cost effective on Serverless.
 *
 * @param status to update to('open' / 'closed' / 'acknowledged')
 * @param index index to be updated
 * @param query optional query object to update alerts by query.
 * @param signalIds optional signalIds to update alerts by signalIds.
 * @param signal to cancel request
 * @param reason to specify the reason of the status update
 * @param runtimeFields optional map of field name to ES runtime field type.
 *   The server synthesizes `_source`-reading runtime fields for each entry
 *   and attaches them to the underlying `_update_by_query` so the close
 *   filter can match fields not natively mapped on the alerts index.
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
    });
    return {
      updated: updated ?? 0,
      version_conflicts: conflicts,
    };
  }
  throw new Error('Either query or signalIds must be provided');
};
