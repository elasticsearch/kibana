/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const PLUGIN_ID = 'deferredInitExample';
// Internal-user writes are performed as `kibana_system`, which is only authorized on the
// `.kibana*` namespace (and a few feature namespaces). A dedicated `.kibana*`-matching index is
// also a faithful stand-in for "migrations + ES init" (which operate on Kibana-owned indices) and
// is never resolved by the saved-object migration flow, so it cannot destabilize boot.
export const INDEX_NAME = '.kibana_deferred_init_example';
export const DATA_ROUTE = '/api/deferred_init_example/doc';
// Reads the in-memory state `lazyInitialize` warmed on the instance serving the request. Nothing
// cluster-side backs it: it only exists because deferred init runs once on every instance.
export const INSTANCE_STATE_ROUTE = '/api/deferred_init_example/instance_state';
export const DOC_ID = 'default';
// Fake delay standing in for slow saved-object migrations, so the initializing loader is
// comfortably observable. Added on top of `initDelayMs` (the default-state init delay).
export const MIGRATIONS_DELAY_MS = 3000;
