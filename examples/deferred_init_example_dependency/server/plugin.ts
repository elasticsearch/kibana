/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PluginInitializerContext, Plugin, Logger } from '@kbn/core/server';

/**
 * `deferredInitExampleDependency`'s start contract. An ordinary (non-lazy) plugin: its `start()`
 * runs at boot like any other plugin's. It exists so `deferred_init_example` can demonstrate that
 * a lazy plugin keeps ordinary `requiredPlugins`, and that their start contracts are injected into
 * its `lazyInitialize()` and `start()` exactly as they would be for any plugin -- no accessor
 * needed, because every non-lazy plugin has started long before a lazy plugin's deferred phases
 * run.
 */
export interface DeferredInitExampleDependencyStartContract {
  getGreeting(): string;
}

export class DeferredInitExampleDependencyServerPlugin
  implements Plugin<object, DeferredInitExampleDependencyStartContract>
{
  private readonly logger: Logger;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public setup(): object {
    this.logger.debug('deferredInitExampleDependency: Setup');
    return {};
  }

  public start(): DeferredInitExampleDependencyStartContract {
    this.logger.debug('deferredInitExampleDependency: Started');
    return {
      getGreeting: () => 'Hello from deferredInitExampleDependency, a normal non-lazy plugin',
    };
  }

  public stop(): void {}
}
