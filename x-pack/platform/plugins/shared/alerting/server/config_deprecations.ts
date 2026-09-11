/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConfigDeprecationProvider } from '@kbn/core/server';

export const autocompleteConfigDeprecationProvider: ConfigDeprecationProvider = ({
  renameFromRoot,
  deprecate,
  unused,
}) => [
  unused('ruleChangeTracking.enabled', { level: 'warning' }),
  deprecate('maxEphemeralActionsPerAlert', '9.0.0', {
    level: 'warning',
    message: `The setting "xpack.alerting.maxEphemeralActionsPerAlert" is deprecated and currently ignored by the system. Please remove this setting.`,
  }),
  renameFromRoot('xpack.alerting.maintenanceWindow.enabled', 'xpack.maintenanceWindows.enabled', {
    level: 'warning',
  }),
];
