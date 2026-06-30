/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AlertClosingReason } from '../../../../../common/types';
import type { Status } from '../../../../../common/api/detection_engine';
import type { RuntimeFieldType } from '../../../../../common/api/detection_engine/signals/set_signal_status/set_signals_status_route.gen';

export interface BasicSignals {
  signal: AbortSignal;
}
export interface QueryAlerts extends BasicSignals {
  query: object;
}

export interface AlertsResponse {
  took: number;
  timeout: boolean;
}

export interface AlertSearchResponse<Hit = {}, Aggregations = {} | undefined>
  extends AlertsResponse {
  _shards: {
    total: number;
    successful: number;
    skipped: number;
    failed: number;
  };
  aggregations?: Aggregations;
  hits: {
    total: {
      value: number;
      relation: string;
    };
    max_score?: number | null;
    hits: Hit[];
  };
}

export interface UpdateAlertStatusByQueryProps {
  query: object;
  status: Status;
  signal?: AbortSignal;
  reason?: AlertClosingReason;
  /**
   * Optional map of field name to ES runtime field type. Server synthesizes
   * a `_source`-reading runtime field per entry and attaches it to the
   * underlying `_update_by_query` so the close filter can reference fields
   * that aren't natively mapped on the alerts index (e.g. runtime fields
   * defined on the rule's source index — workaround for
   * elastic/security-ml#677).
   */
  runtimeFields?: Record<string, RuntimeFieldType>;
}

export interface UpdateAlertStatusByIdsProps {
  signalIds: string[];
  status: Status;
  signal?: AbortSignal;
  reason?: AlertClosingReason;
}

export interface AlertsIndex {
  name: string;
  index_mapping_outdated: boolean;
}

export interface CheckSignalIndex {
  name: string;
  index_mapping_outdated: boolean;
  indexExists: boolean;
}

export type CasesFromAlertsResponse = Array<{ id: string; title: string }>;

export interface Privilege {
  username: string;
  has_all_requested: boolean;
  cluster: {
    monitor_ml: boolean;
    manage_index_templates: boolean;
    monitor_transform: boolean;
    manage_api_key: boolean;
    manage_security: boolean;
    manage_own_api_key: boolean;
    all: boolean;
    monitor: boolean;
    manage: boolean;
    manage_transform: boolean;
    manage_ml: boolean;
    manage_pipeline: boolean;
  };
  index: {
    [indexName: string]: {
      all: boolean;
      maintenance: boolean;
      read: boolean;
      create_index: boolean;
      index: boolean;
      monitor: boolean;
      delete: boolean;
      manage: boolean;
      delete_index: boolean;
      create_doc: boolean;
      view_index_metadata: boolean;
      create: boolean;
      write: boolean;
    };
  };
  application: {};
  is_authenticated: boolean;
  has_encryption_key: boolean;
}
