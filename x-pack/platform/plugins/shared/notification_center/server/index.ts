/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PluginConfigDescriptor, PluginInitializer } from '@kbn/core/server';
import { configSchema, type NotificationCenterConfig } from './config';
import type {
  NotificationCenterPluginSetup,
  NotificationCenterPluginStart,
  NotificationCenterSetupDependencies,
  NotificationCenterStartDependencies,
} from './types';

export type { NotificationCenterPluginSetup, NotificationCenterPluginStart } from './types';

export const config: PluginConfigDescriptor<NotificationCenterConfig> = {
  schema: configSchema,
};

export const plugin: PluginInitializer<
  NotificationCenterPluginSetup,
  NotificationCenterPluginStart,
  NotificationCenterSetupDependencies,
  NotificationCenterStartDependencies
> = async (initializerContext) => {
  const { NotificationCenterPlugin } = await import('./plugin');
  return new NotificationCenterPlugin(initializerContext);
};
