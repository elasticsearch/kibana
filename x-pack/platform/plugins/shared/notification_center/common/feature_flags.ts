/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Feature flag definitions used by the Notification Center plugin.
 */

/**
 * Master gate for everything user-visible in the Notification Center UI. Off
 * by default. Individual notification types are gated separately.
 */
export const NOTIFICATION_CENTER_UI_ENABLED_FLAG = 'notificationCenter.uiEnabled';
export const NOTIFICATION_CENTER_UI_ENABLED_DEFAULT = false;

/**
 * Per-notification-type flag strategy.
 *
 * Each notification type is gated by its own boolean feature flag rather than a
 * single list, so the Feature Flags service can roll a type out independently
 * (percentage rollout, per-customer targeting, …).
 */

/**
 * Registering a type is two edits: add its `<typeId>: '<literal key>'`
 * entry here, and add the matching flag definition as a YAML file in the
 * external `elastic/kibana-feature-flags` repository (GitOps).
 *
 * By convention a key is `notificationCenter.types.<typeId>`
 */
export const NOTIFICATION_TYPE_FLAGS = {
  modelStatus: 'notificationCenter.types.modelStatus',
} as const;

/**
 * Union of registered notification type ids
 */
export type NotificationTypeId = keyof typeof NOTIFICATION_TYPE_FLAGS;

/**
 * Per-type flags are off by default if no value is found in LaunchDarkly
 */
export const NOTIFICATION_TYPE_ENABLED_DEFAULT = false;
