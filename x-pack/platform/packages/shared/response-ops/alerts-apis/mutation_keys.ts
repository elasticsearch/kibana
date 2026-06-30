/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const mutationKeys = {
  root: 'alerts',
  muteAlertInstance: () => [mutationKeys.root, 'muteAlertInstance'] as const,
  unmuteAlertInstance: () => [mutationKeys.root, 'unmuteAlertInstance'] as const,
  snoozeAlertInstance: () => [mutationKeys.root, 'snoozeAlertInstance'] as const,
  unsnoozeAlertInstance: () => [mutationKeys.root, 'unsnoozeAlertInstance'] as const,
  bulkMuteAlerts: () => [mutationKeys.root, 'bulkMuteAlerts'] as const,
  bulkUnmuteAlerts: () => [mutationKeys.root, 'bulkUnmuteAlerts'] as const,
};
