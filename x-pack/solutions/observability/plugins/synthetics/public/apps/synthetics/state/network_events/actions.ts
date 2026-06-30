/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createAsyncAction } from '../utils/actions';
import type { SyntheticsNetworkEventsApiResponse } from '../../../../../common/runtime_types';

export interface FetchNetworkEventsParams {
  checkGroup: string;
  stepIndex: number;
  remoteName?: string;
  timestamp?: string;
}

export interface FetchNetworkEventsFailPayload {
  checkGroup: string;
  stepIndex: number;
  error: Error;
}
type NetworkSuccessPayload = Pick<FetchNetworkEventsParams, 'checkGroup' | 'stepIndex'> &
  SyntheticsNetworkEventsApiResponse;

export const getNetworkEvents = createAsyncAction<
  FetchNetworkEventsParams,
  NetworkSuccessPayload,
  FetchNetworkEventsFailPayload
>('GET_NETWORK_EVENTS');
