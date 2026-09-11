/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { type KibanaContainerModuleLoadOptions } from '@kbn/core-di';
import { cacheInScope } from '@kbn/core-di-internal';
import {
  CapabilitiesProvider,
  CapabilitiesResolver,
  CapabilitiesSwitcher,
  CoreSetup,
  CoreStart,
  type ICapabilitiesResolver,
  Request,
} from '@kbn/core-di-server';

export function loadCapabilities({ bind, onSetup }: KibanaContainerModuleLoadOptions): void {
  onSetup(CapabilitiesProvider, CoreSetup('capabilities'), (_, provider, capabilities) => {
    capabilities.registerProvider(provider);
  });

  onSetup(CapabilitiesSwitcher, CoreSetup('capabilities'), (_, switcher, capabilities) => {
    capabilities.registerSwitcher(switcher.switch, switcher);
  });

  bind(CapabilitiesResolver)
    .toResolvedValue(
      (capabilities, request): ICapabilitiesResolver =>
        (options) =>
          capabilities.resolveCapabilities(request, options),
      [CoreStart('capabilities'), Request]
    )
    .inRequestScope()
    .onActivation(cacheInScope(CapabilitiesResolver));
}
