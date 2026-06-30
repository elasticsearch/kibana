/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PluginInitializer, PluginInitializerContext } from '@kbn/core/public';
import { ProductDocBasePlugin } from './plugin';
import type {
  ProductDocBasePluginSetup,
  ProductDocBasePluginStart,
  PluginSetupDependencies,
  PluginStartDependencies,
  PublicPluginConfig,
} from './types';

export type { ProductDocBasePluginSetup, ProductDocBasePluginStart };

export {
  useProductDocStatus,
  useInstallProductDoc,
  useUninstallProductDoc,
  useDefaultInferenceId,
  REACT_QUERY_KEYS,
  type UseProductDocStatusOptions,
  type UseInstallProductDocOptions,
  type UseUninstallProductDocOptions,
} from './hooks';

export const plugin: PluginInitializer<
  ProductDocBasePluginSetup,
  ProductDocBasePluginStart,
  PluginSetupDependencies,
  PluginStartDependencies
> = (pluginInitializerContext: PluginInitializerContext<PublicPluginConfig>) =>
  new ProductDocBasePlugin(pluginInitializerContext);
