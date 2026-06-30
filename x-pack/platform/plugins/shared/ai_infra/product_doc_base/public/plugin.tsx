/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, CoreStart, Plugin, PluginInitializerContext } from '@kbn/core/public';
import type { Logger } from '@kbn/logging';
import type {
  PublicPluginConfig,
  ProductDocBasePluginSetup,
  ProductDocBasePluginStart,
  PluginSetupDependencies,
  PluginStartDependencies,
} from './types';
import { InstallationService } from './services/installation';
import type { ProductDocInstallParams } from '../common/http_api/installation';

export class ProductDocBasePlugin
  implements
    Plugin<
      ProductDocBasePluginSetup,
      ProductDocBasePluginStart,
      PluginSetupDependencies,
      PluginStartDependencies
    >
{
  logger: Logger;

  constructor(context: PluginInitializerContext<PublicPluginConfig>) {
    this.logger = context.logger.get();
  }
  setup(
    coreSetup: CoreSetup<PluginStartDependencies, ProductDocBasePluginStart>,
    pluginsSetup: PluginSetupDependencies
  ): ProductDocBasePluginSetup {
    return {};
  }

  start(coreStart: CoreStart, pluginsStart: PluginStartDependencies): ProductDocBasePluginStart {
    const installationService = new InstallationService({ http: coreStart.http });

    return {
      installation: {
        getStatus: (params: ProductDocInstallParams) =>
          installationService.getInstallationStatus(params),
        install: (params: ProductDocInstallParams) => installationService.install(params),
        uninstall: (params: ProductDocInstallParams) => installationService.uninstall(params),
        getDefaultInferenceId: (params) => installationService.getDefaultInferenceId(params),
      },
    };
  }
}
