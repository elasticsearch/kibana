/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AbortReason } from '@kbn/kibana-utils-plugin/common';

/**
 * This API can cancel in-flight requests. Calling cancelRequests before the requests are initiated should also prevent them from being started.
 */
export interface CanCancelRequests {
  cancelRequests: (reason?: AbortReason) => void;
}

export const apiCanCancelRequests = (api: unknown): api is CanCancelRequests => {
  return Boolean(api && typeof (api as CanCancelRequests).cancelRequests === 'function');
};
