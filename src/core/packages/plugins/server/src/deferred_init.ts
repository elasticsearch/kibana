/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DeferredInitState } from '@kbn/core-deferred-init-common';

/**
 * Lifecycle state of a lazy plugin's deferred phases (`lazyInitialize()` followed by `start()`)
 * on this Kibana instance.
 *
 * - `idle`: registered but not yet triggered. Boot pays nothing for it.
 * - `initializing`: `lazyInitialize()` or the deferred `start()` is currently running.
 * - `available`: both phases completed; the start contract exists and routes serve normally.
 * - `failed`: the last attempt threw. Retried on a backoff, and on demand once retries are spent.
 *
 * @public
 * @experimental
 */
export type InitState = DeferredInitState;
