/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ServiceFlyoutSource } from './constants';
import type { LatencyAggregationType } from '../../../../common/latency_aggregation_types';

export interface ServiceFlyoutOptions {
  initialTransactionType?: string;
  rangeFrom?: string;
  rangeTo?: string;
  kuery?: string;
  source?: ServiceFlyoutSource;
  /** Initial latency aggregation type, e.g. inherited from a rule or the host page. */
  latencyAggregationType?: LatencyAggregationType;
}
