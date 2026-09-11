/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PluginOpaqueId } from '@kbn/core-base-common';
import type { CoreContext } from '@kbn/core-base-server-internal';
import { MockContextConstructor } from './context_service.test.mocks';
import { ContextService } from './context_service';

const pluginDependencies = new Map<PluginOpaqueId, PluginOpaqueId[]>();

describe('ContextService', () => {
  describe('#preboot()', () => {
    test('createContextContainer returns a new container configured with pluginDependencies', () => {
      const coreId = Symbol();
      const service = new ContextService({ coreId } as CoreContext);
      const preboot = service.preboot({ pluginDependencies });
      expect(preboot.createContextContainer()).toBeDefined();
      // No plugin start contract exists during preboot, so no loader is passed and the
      // container's rejecting default stands in for `context.loadPluginContract()`.
      expect(MockContextConstructor).toHaveBeenCalledWith(pluginDependencies, coreId, undefined);
    });
  });

  describe('#setup()', () => {
    test('createContextContainer returns a new container configured with pluginDependencies', () => {
      const coreId = Symbol();
      const service = new ContextService({ coreId } as CoreContext);

      service.preboot({ pluginDependencies: new Map() });

      const setup = service.setup({ pluginDependencies });
      expect(setup.createContextContainer()).toBeDefined();
      expect(MockContextConstructor).toHaveBeenCalledWith(pluginDependencies, coreId, undefined);
    });

    test('forwards the plugin contract loader to the container', () => {
      const coreId = Symbol();
      const service = new ContextService({ coreId } as CoreContext);
      const loadPluginContract = jest.fn();

      const setup = service.setup({ pluginDependencies, loadPluginContract });
      expect(setup.createContextContainer()).toBeDefined();
      expect(MockContextConstructor).toHaveBeenCalledWith(
        pluginDependencies,
        coreId,
        loadPluginContract
      );
    });
  });
});
