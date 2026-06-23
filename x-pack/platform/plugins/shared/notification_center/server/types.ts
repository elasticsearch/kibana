/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Public server-side setup contract.
 *
 * The external `submit(draft)` API that consumers call to push notifications will be added here
 */
export type NotificationCenterPluginSetup = Record<string, never>;

export type NotificationCenterPluginStart = Record<string, never>;

export type NotificationCenterSetupDependencies = Record<string, never>;

export type NotificationCenterStartDependencies = Record<string, never>;
