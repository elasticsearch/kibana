/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { CoreSetup, CoreStart, Plugin, PluginInitializerContext } from '@kbn/core/server';
import { SavedObjectsClient } from '@kbn/core/server';
import {
  GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR,
  GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR_DEFAULT_ONLY,
} from '@kbn/management-settings-ids';
import { isEisAvailableFromInferenceGet } from '@kbn/product-doc-common';
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

// Sentinels that mean no default AI connector/model is configured. Either can
// appear depending on which settings UI last wrote genAiSettings:defaultAIConnector
// (gen_ai_settings vs search_inference_endpoints "Use AI features" toggle).
const AI_DISABLED_SENTINELS = new Set(['NO_DEFAULT_MODEL', 'NO_DEFAULT_CONNECTOR']);

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
  private cloud?: ProductDocBaseSetupDependencies['cloud'];

  constructor(private readonly context: PluginInitializerContext<ProductDocBaseConfig>) {
    this.logger = context.logger.get();
  }
  setup(
    coreSetup: CoreSetup<ProductDocBaseStartDependencies, ProductDocBaseStartContract>,
    { taskManager, cloud }: ProductDocBaseSetupDependencies
  ): ProductDocBaseSetupContract {
    this.cloud = cloud;

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
      esClient: core.elasticsearch.client.asInternalUser,
    });

    this.internalServices = {
      logger: this.logger,
      packageInstaller,
      installClient: productDocClient,
      documentationManager,
      licensing,
      taskManager,
    };

    this.runStartupTasks(core, documentationManager, isServerless, this.cloud).catch(
      (err: Error) => {
        this.logger.error(
          `Unexpected error in product documentation startup tasks: ${err.message}`
        );
      }
    );
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

  private async runStartupTasks(
    core: CoreStart,
    documentationManager: DocumentationManager,
    isServerless: boolean,
    cloud: ProductDocBaseSetupDependencies['cloud']
  ): Promise<void> {
    const uiSettingsSoClient = new SavedObjectsClient(core.savedObjects.createInternalRepository());
    const uiSettingsClient = core.uiSettings.asScopedToClient(uiSettingsSoClient);

    const [defaultAIConnector, defaultAIConnectorOnly] = await Promise.all([
      uiSettingsClient.get<string>(GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR).catch(() => ''),
      uiSettingsClient
        .get<boolean>(GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR_DEFAULT_ONLY)
        .catch(() => false),
    ]);

    const isAiDisabled =
      AI_DISABLED_SENTINELS.has(defaultAIConnector) && defaultAIConnectorOnly === true;

    if (isAiDisabled) {
      this.logger.info('Skipping product documentation auto-install: Use AI features is disabled');
      return;
    }

    const eisAvailable = await isEisAvailableFromInferenceGet(() =>
      core.elasticsearch.client.asInternalUser.inference.get({})
    );
    if (!eisAvailable) {
      this.logger.info(
        'Skipping product documentation auto-install: Elastic Inference Service (EIS) is not available'
      );
      return;
    }

    // Product docs for all projects
    documentationManager.ensureDefaultProductDocumentation().catch((err: Error) => {
      this.logger.error(
        `Error ensuring product documentation for default inference ID: ${err.message}`
      );
    });
    documentationManager.updateAll().catch((err: Error) => {
      this.logger.error(`Error scheduling product documentation updateAll task: ${err.message}`);
    });

    // Security Labs only for serverless security projects
    const isSecurityProject = isServerless ? cloud?.serverless?.projectType === 'security' : false;
    if (isSecurityProject) {
      documentationManager.ensureDefaultSecurityLabs().catch((err: Error) => {
        this.logger.error(
          `Error ensuring Security Labs content for default inference ID: ${err.message}`
        );
      });
      documentationManager.updateSecurityLabsAll().catch((err: Error) => {
        this.logger.error(`Error scheduling Security Labs update task: ${err.message}`);
      });
    }
  }
}
