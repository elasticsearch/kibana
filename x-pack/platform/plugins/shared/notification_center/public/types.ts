/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * UI plugin setup is gated on `notificationCenter.uiEnabled` feature flag
 */
export type NotificationCenterPublicSetup = Record<string, never>;

export type NotificationCenterPublicStart = Record<string, never>;
