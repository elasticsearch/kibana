/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/server';
import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import type { CloudSetup } from '@kbn/cloud-plugin/server';
import type { SearchApi } from './services/search';
import type { ProductDocInstallClient } from './services/doc_install_status';
import type { PackageInstaller } from './services/package_installer';
import type { DocumentationManager, DocumentationManagerAPI } from './services/doc_manager';

/* eslint-disable @typescript-eslint/no-empty-interface*/

export interface ProductDocBaseSetupDependencies {
  taskManager: TaskManagerSetupContract;
  /** Serverless project type lives on CloudSetup (not CloudStart). */
  cloud?: CloudSetup;
}

export interface ProductDocBaseStartDependencies {
  licensing: LicensingPluginStart;
  taskManager: TaskManagerStartContract;
}

export interface ProductDocBaseSetupContract {}

export interface ProductDocBaseStartContract {
  search: SearchApi;
  management: DocumentationManagerAPI;
}

export interface InternalServices {
  logger: Logger;
  installClient: ProductDocInstallClient;
  packageInstaller: PackageInstaller;
  documentationManager: DocumentationManager;
  licensing: LicensingPluginStart;
  taskManager: TaskManagerStartContract;
}
