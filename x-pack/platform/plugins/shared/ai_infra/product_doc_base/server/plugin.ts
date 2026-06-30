/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { CoreSetup, CoreStart, Plugin, PluginInitializerContext } from '@kbn/core/server';
import { SavedObjectsClient } from '@kbn/core/server';
import { productDocInstallStatusSavedObjectTypeName } from '../common/consts';
import type { ProductDocBaseConfig } from './config';
import type {
  ProductDocBaseSetupContract,
  ProductDocBaseStartContract,
  ProductDocBaseSetupDependencies,
  ProductDocBaseStartDependencies,
  InternalServices,
} from './types';
import { productDocInstallStatusSavedObjectType } from './saved_objects';
import { PackageInstaller } from './services/package_installer';
import { ProductDocInstallClient } from './services/doc_install_status';
import { DocumentationManager } from './services/doc_manager';
import { SearchService } from './services/search';
import { registerRoutes } from './routes';
import { registerTaskDefinitions } from './tasks';

export class ProductDocBasePlugin
  implements
    Plugin<
      ProductDocBaseSetupContract,
      ProductDocBaseStartContract,
      ProductDocBaseSetupDependencies,
      ProductDocBaseStartDependencies
    >
{
  private logger: Logger;
  private internalServices?: InternalServices;

  constructor(private readonly context: PluginInitializerContext<ProductDocBaseConfig>) {
    this.logger = context.logger.get();
  }
  setup(
    coreSetup: CoreSetup<ProductDocBaseStartDependencies, ProductDocBaseStartContract>,
    { taskManager }: ProductDocBaseSetupDependencies
  ): ProductDocBaseSetupContract {
    const getServices = () => {
      if (!this.internalServices) {
        throw new Error('getServices called before #start');
      }
      return this.internalServices;
    };

    coreSetup.savedObjects.registerType(productDocInstallStatusSavedObjectType);

    registerTaskDefinitions({
      taskManager,
      getServices,
    });

    const router = coreSetup.http.createRouter();
    registerRoutes({
      router,
      getServices,
    });

    return {};
  }

  start(
    core: CoreStart,
    { licensing, taskManager }: ProductDocBaseStartDependencies
  ): ProductDocBaseStartContract {
    const isServerless = this.context.env.packageInfo.buildFlavor === 'serverless';

    const soClient = new SavedObjectsClient(
      core.savedObjects.createInternalRepository([productDocInstallStatusSavedObjectTypeName])
    );
    const productDocClient = new ProductDocInstallClient({
      soClient,
      log: this.logger,
    });

    const productDocConfig = this.context.config.get();
    const packageInstaller = new PackageInstaller({
      esClient: core.elasticsearch.client.asInternalUser,
      productDocClient,
      kibanaVersion: this.context.env.packageInfo.version,
      artifactsFolder: 'ai-kb-artifacts',
      artifactRepositoryUrl: productDocConfig.artifactRepositoryUrl,
      artifactRepositoryProxyUrl: productDocConfig.artifactRepositoryProxyUrl,
      elserInferenceId: this.context.config.get().elserInferenceId,
      logger: this.logger.get('package-installer'),
      isServerless,
    });

    const searchService = new SearchService({
      esClient: core.elasticsearch.client.asInternalUser,
      logger: this.logger.get('search-service'),
    });

    const documentationManager = new DocumentationManager({
      logger: this.logger.get('doc-manager'),
      docInstallClient: productDocClient,
      licensing,
      taskManager,
      auditService: core.security.audit,
      packageInstaller,
    });

    this.internalServices = {
      logger: this.logger,
      packageInstaller,
      installClient: productDocClient,
      documentationManager,
      licensing,
      taskManager,
    };
    documentationManager.updateAll().catch((err) => {
      this.logger.error(`Error scheduling product documentation updateAll task: ${err.message}`);
    });
    documentationManager.updateSecurityLabsAll().catch((err) => {
      this.logger.error(`Error scheduling Security Labs update task: ${err.message}`);
    });
    return {
      management: {
        install: documentationManager.install.bind(documentationManager),
        update: documentationManager.update.bind(documentationManager),
        updateAll: documentationManager.updateAll.bind(documentationManager),
        updateSecurityLabsAll:
          documentationManager.updateSecurityLabsAll.bind(documentationManager),
        uninstall: documentationManager.uninstall.bind(documentationManager),
        getStatus: documentationManager.getStatus.bind(documentationManager),
        getStatuses: documentationManager.getStatuses.bind(documentationManager),
        installSecurityLabs: documentationManager.installSecurityLabs.bind(documentationManager),
        uninstallSecurityLabs:
          documentationManager.uninstallSecurityLabs.bind(documentationManager),
        getSecurityLabsStatus:
          documentationManager.getSecurityLabsStatus.bind(documentationManager),
      },
      search: searchService.search.bind(searchService),
    };
  }
}
