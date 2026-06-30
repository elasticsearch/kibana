/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Plugin, CoreSetup, CoreStart, PluginInitializerContext } from '@kbn/core/server';
import type { FleetStartContract } from '@kbn/fleet-plugin/server';

import type { IngestHubServerSetupDeps, IngestHubServerStartDeps } from './types';
import { registerIamPermissionsRoute } from './routes/iam_permissions';

export class IngestHubPlugin
  implements Plugin<void, void, IngestHubServerSetupDeps, IngestHubServerStartDeps>
{
  private fleetStart: FleetStartContract | undefined;
  private readonly initializerContext: PluginInitializerContext;

  constructor(initializerContext: PluginInitializerContext) {
    this.initializerContext = initializerContext;
  }

  public setup(core: CoreSetup<IngestHubServerStartDeps, void>): void {
    const logger = this.initializerContext.logger.get();
    const router = core.http.createRouter();

    registerIamPermissionsRoute(
      router,
      () => {
        if (!this.fleetStart) {
          throw new Error('IngestHub: Fleet start contract not available');
        }
        return this.fleetStart;
      },
      logger
    );
  }

  public start(_core: CoreStart, plugins: IngestHubServerStartDeps): void {
    this.fleetStart = plugins.fleet;
  }

  public stop(): void {}
}
