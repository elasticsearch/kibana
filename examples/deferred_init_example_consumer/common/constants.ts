/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const PLUGIN_ID = 'deferredInitExampleConsumer';
export const LAZY_PLUGIN_ID = 'deferredInitExample';
/** Triggers the lazy plugin (via `context.loadPluginContract`) and waits for it. */
export const DATA_ROUTE = '/api/deferred_init_example_consumer/doc';
/** Reads the lazy plugin's state on this instance without ever triggering it. */
export const STATUS_ROUTE = '/api/deferred_init_example_consumer/status';
