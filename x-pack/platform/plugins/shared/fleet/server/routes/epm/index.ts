/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import path from 'path';

import type { RouteSecurity } from '@kbn/core-http-server';

import {
  BulkRollbackAvailableCheckResponseSchema,
  RollbackAvailableCheckResponseSchema,
} from '../../../common/types/rest_spec/epm';

import { parseExperimentalConfigValue } from '../../../common/experimental_features';
import { API_VERSIONS } from '../../../common/constants';
import type { FleetAuthz } from '../../../common';

import {
  calculateRouteAuthz,
  type FleetAuthzRouter,
  getRouteRequiredAuthz,
} from '../../services/security';
import type { FleetAuthzRouteConfig } from '../../services/security/types';

import { EPM_API_ROUTES } from '../../constants';
import {
  GetCategoriesRequestSchema,
  GetPackagesRequestSchema,
  GetInstalledPackagesRequestSchema,
  GetFileRequestSchema,
  GetInfoRequestSchema,
  GetInfoWithoutVersionRequestSchema,
  GetBulkAssetsRequestSchema,
  InstallPackageFromRegistryRequestSchema,
  InstallPackageFromRegistryWithoutVersionRequestSchema,
  InstallPackageByUploadRequestSchema,
  DeletePackageRequestSchema,
  DeletePackageWithoutVersionRequestSchema,
  BulkInstallPackagesFromRegistryRequestSchema,
  GetStatsRequestSchema,
  GetDependenciesRequestSchema,
  GetDependenciesResponseSchema,
  UpdatePackageRequestSchema,
  UpdatePackageWithoutVersionRequestSchema,
  ReviewUpgradeRequestSchema,
  ReviewUpgradeResponseSchema,
  ReauthorizeTransformRequestSchema,
  GetDataStreamsRequestSchema,
  CreateCustomIntegrationRequestSchema,
  GetInputsRequestSchema,
  InstallKibanaAssetsRequestSchema,
  DeleteKibanaAssetsRequestSchema,
  GetCategoriesResponseSchema,
  GetPackagesResponseSchema,
  GetInstalledPackagesResponseSchema,
  GetLimitedPackagesResponseSchema,
  GetStatsResponseSchema,
  GetInputsResponseSchema,
  GetFileResponseSchema,
  GetInfoResponseSchema,
  UpdatePackageResponseSchema,
  InstallPackageResponseSchema,
  InstallKibanaAssetsResponseSchema,
  BulkInstallPackagesFromRegistryResponseSchema,
  DeletePackageResponseSchema,
  GetVerificationKeyIdResponseSchema,
  GetDataStreamsResponseSchema,
  GetBulkAssetsResponseSchema,
  ReauthorizeTransformResponseSchema,
  BulkUpgradePackagesRequestSchema,
  BulkUpgradePackagesResponseSchema,
  GetOneBulkOperationPackagesRequestSchema,
  GetOneBulkOperationPackagesResponseSchema,
  BulkUninstallPackagesRequestSchema,
  CustomIntegrationRequestSchema,
  DeletePackageDatastreamAssetsRequestSchema,
  DeletePackageDatastreamAssetsResponseSchema,
  RollbackPackageRequestSchema,
  RollbackPackageResponseSchema,
  GetKnowledgeBaseRequestSchema,
  GetKnowledgeBaseResponseSchema,
  BulkRollbackPackagesRequestSchema,
  BulkRollbackPackagesResponseSchema,
  BulkNamespaceCustomizationRequestSchema,
  BulkNamespaceCustomizationResponseSchema,
  InstallRuleAssetsRequestSchema,
} from '../../types';
import type { FleetConfigType } from '../../config';
import { FLEET_API_PRIVILEGES } from '../../constants/api_privileges';
import { genericErrorResponse } from '../schema/errors';

import {
  getCategoriesHandler,
  getListHandler,
  getInstalledListHandler,
  getLimitedListHandler,
  getInfoHandler,
  getBulkAssetsHandler,
  installPackageFromRegistryHandler,
  installPackageByUploadHandler,
  deletePackageHandler,
  bulkInstallPackagesFromRegistryHandler,
  getStatsHandler,
  getDependenciesHandler,
  updatePackageHandler,
  getVerificationKeyIdHandler,
  reauthorizeTransformsHandler,
  getDataStreamsHandler,
  createCustomIntegrationHandler,
  getInputsHandler,
  updateCustomIntegrationHandler,
  getKnowledgeBaseHandler,
  rollbackPackageHandler,
  rollbackAvailableCheckHandler,
  bulkRollbackAvailableCheckHandler,
  reviewUpgradeHandler,
} from './handlers';
import { getFileHandler } from './file_handler';
import {
  deletePackageKibanaAssetsHandler,
  installPackageKibanaAssetsHandler,
  installRuleAssetsHandler,
} from './install_assets_handler';
import {
  postBulkUpgradePackagesHandler,
  postBulkUninstallPackagesHandler,
  getOneBulkOperationPackagesHandler,
  postBulkRollbackPackagesHandler,
  postBulkNamespaceCustomizationHandler,
} from './bulk_handler';
import { deletePackageDatastreamAssetsHandler } from './package_datastream_assets_handler';
import { getIlmPoliciesHandler } from './ilm_policies_handler';

const MAX_FILE_SIZE_BYTES = 104857600; // 100MB

export const INSTALL_PACKAGES_AUTHZ: FleetAuthzRouteConfig['fleetAuthz'] = {
  integrations: { installPackages: true },
};

export const INSTALL_PACKAGES_SECURITY: RouteSecurity = {
  authz: {
    requiredPrivileges: [
      FLEET_API_PRIVILEGES.INTEGRATIONS.ALL,
      FLEET_API_PRIVILEGES.AGENT_POLICIES.ALL,
    ],
  },
};

export const READ_PACKAGE_INFO_AUTHZ: FleetAuthzRouteConfig['fleetAuthz'] = {
  integrations: { readPackageInfo: true },
};

export const READ_PACKAGE_INFO_SECURITY: RouteSecurity = {
  authz: {
    requiredPrivileges: [
      {
        anyRequired: [
          FLEET_API_PRIVILEGES.INTEGRATIONS.READ,
          FLEET_API_PRIVILEGES.SETUP,
          FLEET_API_PRIVILEGES.FLEET.ALL,
        ],
      },
    ],
  },
};

export const registerRoutes = (router: FleetAuthzRouter, config: FleetConfigType) => {
  const experimentalFeatures = parseExperimentalConfigValue(
    config.enableExperimental || [],
    config.experimentalFeatures || {}
  );

  router.versioned
    .get({
      path: EPM_API_ROUTES.CATEGORIES_PATTERN,
      security: READ_PACKAGE_INFO_SECURITY,
      summary: `Get package categories`,
      description: `Get a list of integration categories.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/get_categories.yaml'),
        },
        validate: {
          request: GetCategoriesRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => GetCategoriesResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      getCategoriesHandler
    );

  router.versioned
    .get({
      path: EPM_API_ROUTES.LIST_PATTERN,
      security: READ_PACKAGE_INFO_SECURITY,
      summary: `Get packages`,
      description: `Get a list of integration packages available in the registry.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/get_packages.yaml'),
        },
        validate: {
          request: GetPackagesRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => GetPackagesResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      getListHandler
    );

  router.versioned
    .get({
      path: EPM_API_ROUTES.INSTALLED_LIST_PATTERN,
      security: READ_PACKAGE_INFO_SECURITY,
      summary: `Get installed packages`,
      description: `Get a list of all currently installed integration packages.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/get_installed_packages.yaml'),
        },
        validate: {
          request: GetInstalledPackagesRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => GetInstalledPackagesResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      getInstalledListHandler
    );

  router.versioned
    .get({
      path: EPM_API_ROUTES.LIMITED_LIST_PATTERN,
      security: READ_PACKAGE_INFO_SECURITY,
      summary: `Get a limited package list`,
      description: `Get the list of packages that cannot be uninstalled (e.g. elastic_agent, fleet_server).`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/get_limited_packages.yaml'),
        },
        validate: {
          request: {},
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => GetLimitedPackagesResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      getLimitedListHandler
    );

  router.versioned
    .get({
      path: EPM_API_ROUTES.STATS_PATTERN,
      security: READ_PACKAGE_INFO_SECURITY,
      summary: `Get package stats`,
      description: `Get usage statistics for a specific package, such as the number of agent policies using it.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/get_package_stats.yaml'),
        },
        validate: {
          request: GetStatsRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => GetStatsResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      getStatsHandler
    );

  router.versioned
    .get({
      path: EPM_API_ROUTES.DEPENDENCIES_PATTERN,
      security: READ_PACKAGE_INFO_SECURITY,
      summary: `Get package dependencies`,
      description: `Get the list of packages that a specific package depends on.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
        availability: {
          stability: 'stable',
          since: '9.4.0',
        },
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => ({
            responses: {
              200: {
                content: {
                  'application/json': {
                    examples: {
                      dependenciesResponse: {
                        value: {
                          items: [
                            { name: 'aws', version: '^2.0.0', title: 'AWS' },
                            { name: 'system', version: '^1.0.0', title: 'System' },
                          ],
                        },
                      },
                      noDependenciesResponse: {
                        value: {
                          items: [],
                        },
                      },
                    },
                  },
                },
              },
              400: {
                content: {
                  'application/json': {
                    examples: {
                      packageNotFoundResponse: {
                        value: {
                          message: '[my-package-1.0.0] package not found in registry',
                        },
                      },
                    },
                  },
                },
              },
            },
          }),
        },
        validate: {
          request: GetDependenciesRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => GetDependenciesResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      getDependenciesHandler
    );

  router.versioned
    .get({
      path: EPM_API_ROUTES.INPUTS_PATTERN,
      security: READ_PACKAGE_INFO_SECURITY,
      summary: `Get an inputs template`,
      description: `Get an inputs template for a package, used to pre-populate package policy forms.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/get_inputs_template.yaml'),
        },
        validate: {
          request: GetInputsRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => GetInputsResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      getInputsHandler
    );

  router.versioned
    .get({
      path: EPM_API_ROUTES.FILEPATH_PATTERN,
      security: READ_PACKAGE_INFO_SECURITY,
      summary: `Get a package file`,
      description: `Get the contents of a specific file from a package.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/get_package_file.yaml'),
        },
        validate: {
          request: GetFileRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => GetFileResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      getFileHandler
    );

  router.versioned
    // @ts-ignore TODO move to kibana authz https://github.com/elastic/kibana/issues/203170
    .get({
      path: EPM_API_ROUTES.INFO_WITHOUT_VERSION_PATTERN,
      fleetAuthz: (fleetAuthz: FleetAuthz): boolean =>
        calculateRouteAuthz(
          fleetAuthz,
          getRouteRequiredAuthz('get', EPM_API_ROUTES.INFO_WITHOUT_VERSION_PATTERN)
        ).granted,
      summary: `Get a package`,
      description: `Get information about a package by name, returning the latest installed or available version.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/get_package_info.yaml'),
        },
        validate: {
          request: GetInfoWithoutVersionRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => GetInfoResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      getInfoHandler
    );

  router.versioned
    // @ts-ignore TODO move to kibana authz https://github.com/elastic/kibana/issues/203170
    .get({
      path: EPM_API_ROUTES.INFO_PATTERN,
      fleetAuthz: (fleetAuthz: FleetAuthz): boolean =>
        calculateRouteAuthz(fleetAuthz, getRouteRequiredAuthz('get', EPM_API_ROUTES.INFO_PATTERN))
          .granted,
      summary: `Get a package`,
      description: `Get information about a specific version of a package.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/get_package_info.yaml'),
        },
        validate: {
          request: GetInfoRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => GetInfoResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      getInfoHandler
    );

  router.versioned
    .get({
      path: EPM_API_ROUTES.KNOWLEDGE_BASE_PATTERN,
      fleetAuthz: (fleetAuthz: FleetAuthz): boolean =>
        calculateRouteAuthz(
          fleetAuthz,
          getRouteRequiredAuthz('get', EPM_API_ROUTES.KNOWLEDGE_BASE_PATTERN)
        ).granted,
      security: {
        authz: {
          enabled: false,
          reason:
            'This route uses Fleet authorization via fleetAuthz instead of standard Kibana authorization',
        },
      },
      summary: `Get all knowledge base content for a package`,
      options: {
        tags: ['internal', 'oas-tag:Elastic Package Manager (EPM)'],
      },
      access: 'internal',
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v1,
        validate: {
          request: GetKnowledgeBaseRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => GetKnowledgeBaseResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      getKnowledgeBaseHandler
    );

  router.versioned
    .put({
      path: EPM_API_ROUTES.INFO_WITHOUT_VERSION_PATTERN,
      security: INSTALL_PACKAGES_SECURITY,
      summary: `Update package settings`,
      description: `Update settings for a package, such as whether policies are kept up to date automatically.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/put_update_package.yaml'),
        },
        validate: {
          request: UpdatePackageWithoutVersionRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => UpdatePackageResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      updatePackageHandler
    );

  router.versioned
    .put({
      path: EPM_API_ROUTES.INFO_PATTERN,
      security: INSTALL_PACKAGES_SECURITY,
      summary: `Update package settings`,
      description: `Update settings for a specific version of a package.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/put_update_package.yaml'),
        },
        validate: {
          request: UpdatePackageRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => UpdatePackageResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      updatePackageHandler
    );

  router.versioned
    .post({
      path: EPM_API_ROUTES.REVIEW_UPGRADE_PATTERN,
      security: INSTALL_PACKAGES_SECURITY,
      summary: `Review a pending policy upgrade for a package with deprecations`,
      description: `Review and accept or reject a pending policy upgrade for a package that contains deprecations.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
        availability: {
          since: '9.4.0',
          stability: 'stable',
        },
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => ({
            requestBody: {
              content: {
                'application/json': {
                  examples: {
                    acceptUpgrade: {
                      value: { action: 'accept', target_version: '2.0.0' },
                    },
                  },
                },
              },
            },
            responses: {
              200: {
                content: {
                  'application/json': {
                    examples: {
                      successResponse: {
                        value: { success: true },
                      },
                    },
                  },
                },
              },
              400: {
                content: {
                  'application/json': {
                    examples: {
                      badRequestResponse: {
                        value: { message: 'Bad Request' },
                      },
                    },
                  },
                },
              },
            },
          }),
        },
        validate: {
          request: ReviewUpgradeRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => ReviewUpgradeResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      reviewUpgradeHandler
    );

  router.versioned
    .post({
      path: EPM_API_ROUTES.INSTALL_FROM_REGISTRY_WITHOUT_VERSION_PATTERN,
      security: INSTALL_PACKAGES_SECURITY,
      summary: `Install a package from the registry`,
      description: `Install the latest version of a package from the Elastic Package Registry.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/post_install_package.yaml'),
        },
        validate: {
          request: InstallPackageFromRegistryWithoutVersionRequestSchema,
          response: {
            200: {
              body: () => InstallPackageResponseSchema,
              description: 'OK: A successful request.',
            },
            400: {
              body: genericErrorResponse,
              description: 'A bad request.',
            },
          },
        },
      },
      installPackageFromRegistryHandler
    );

  router.versioned
    .post({
      path: EPM_API_ROUTES.INSTALL_FROM_REGISTRY_PATTERN,
      security: INSTALL_PACKAGES_SECURITY,
      summary: `Install a package from the registry`,
      description: `Install a specific version of a package from the Elastic Package Registry.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/post_install_package.yaml'),
        },
        validate: {
          request: InstallPackageFromRegistryRequestSchema,
          response: {
            200: {
              body: () => InstallPackageResponseSchema,
              description: 'OK: A successful request.',
            },
            400: {
              body: genericErrorResponse,
              description: 'A bad request.',
            },
          },
        },
      },
      installPackageFromRegistryHandler
    );

  router.versioned
    .post({
      path: EPM_API_ROUTES.INSTALL_RULE_ASSETS_PATTERN,
      security: INSTALL_PACKAGES_SECURITY,
      summary: `Install Kibana alert rule for a package`,
      description: `Install Kibana alert rule assets for a specific package version.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/post_install_rule_assets.yaml'),
        },
        validate: {
          request: InstallRuleAssetsRequestSchema,
          response: {
            200: {
              body: () => InstallKibanaAssetsResponseSchema,
              description: 'OK: A successful request.',
            },
            400: {
              body: genericErrorResponse,
              description: 'A bad request.',
            },
          },
        },
      },
      installRuleAssetsHandler
    );
  router.versioned
    .post({
      path: EPM_API_ROUTES.INSTALL_KIBANA_ASSETS_PATTERN,
      security: INSTALL_PACKAGES_SECURITY,
      summary: `Install Kibana assets for a package`,
      description: `Install Kibana assets (dashboards, visualizations, etc.) for a specific package version.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () =>
            path.join(__dirname, 'examples/post_install_kibana_assets.yaml'),
        },
        validate: {
          request: InstallKibanaAssetsRequestSchema,
          response: {
            200: {
              body: () => InstallKibanaAssetsResponseSchema,
              description: 'OK: A successful request.',
            },
            400: {
              body: genericErrorResponse,
              description: 'A bad request.',
            },
          },
        },
      },
      installPackageKibanaAssetsHandler
    );

  router.versioned
    .delete({
      path: EPM_API_ROUTES.DELETE_KIBANA_ASSETS_PATTERN,
      security: INSTALL_PACKAGES_SECURITY,
      summary: `Delete Kibana assets for a package`,
      description: `Delete Kibana assets (dashboards, visualizations, etc.) for a specific package version.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/delete_kibana_assets.yaml'),
        },
        validate: {
          request: DeleteKibanaAssetsRequestSchema,
          response: {
            200: {
              body: () => InstallKibanaAssetsResponseSchema,
              description: 'OK: A successful request.',
            },
            400: {
              body: genericErrorResponse,
              description: 'A bad request.',
            },
          },
        },
      },
      deletePackageKibanaAssetsHandler
    );

  router.versioned
    .post({
      path: EPM_API_ROUTES.BULK_UPGRADE_PATTERN,
      security: INSTALL_PACKAGES_SECURITY,
      summary: `Bulk upgrade packages`,
      description: `Upgrade multiple packages to their latest versions.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () =>
            path.join(__dirname, 'examples/post_bulk_upgrade_packages.yaml'),
        },
        validate: {
          request: BulkUpgradePackagesRequestSchema,
          response: {
            200: {
              body: () => BulkUpgradePackagesResponseSchema,
              description: 'OK: A successful request.',
            },
            400: {
              body: genericErrorResponse,
              description: 'A bad request.',
            },
          },
        },
      },
      postBulkUpgradePackagesHandler
    );

  router.versioned
    .post({
      path: EPM_API_ROUTES.BULK_UNINSTALL_PATTERN,
      security: INSTALL_PACKAGES_SECURITY,
      summary: `Bulk uninstall packages`,
      description: `Uninstall multiple packages in a single operation.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () =>
            path.join(__dirname, 'examples/post_bulk_uninstall_packages.yaml'),
        },
        validate: {
          request: BulkUninstallPackagesRequestSchema,
          response: {
            200: {
              body: () => BulkUpgradePackagesResponseSchema,
              description: 'OK: A successful request.',
            },
            400: {
              body: genericErrorResponse,
              description: 'A bad request.',
            },
          },
        },
      },
      postBulkUninstallPackagesHandler
    );

  if (experimentalFeatures.enablePackageRollback) {
    router.versioned
      .post({
        path: EPM_API_ROUTES.BULK_ROLLBACK_PATTERN,
        security: INSTALL_PACKAGES_SECURITY,
        summary: `Bulk rollback packages`,
        description: `Rollback multiple packages to their previous versions.`,
        options: {
          tags: ['oas-tag:Elastic Package Manager (EPM)'],
        },
      })
      .addVersion(
        {
          version: API_VERSIONS.public.v1,
          options: {
            oasOperationObject: () => ({
              requestBody: {
                content: {
                  'application/json': {
                    examples: {
                      bulkRollbackRequest: {
                        value: {
                          packages: [{ name: 'system' }],
                        },
                      },
                    },
                  },
                },
              },
              responses: {
                200: {
                  content: {
                    'application/json': {
                      examples: {
                        successResponse: {
                          value: {
                            taskId: 'taskId',
                          },
                        },
                      },
                    },
                  },
                },
                400: {
                  content: {
                    'application/json': {
                      examples: {
                        badRequestResponse: {
                          value: {
                            message: 'Bad Request',
                          },
                        },
                      },
                    },
                  },
                },
              },
            }),
          },
          validate: {
            request: BulkRollbackPackagesRequestSchema,
            response: {
              200: {
                body: () => BulkRollbackPackagesResponseSchema,
                description: 'OK: A successful request.',
              },
              400: {
                body: genericErrorResponse,
                description: 'A bad request.',
              },
            },
          },
        },
        postBulkRollbackPackagesHandler
      );

    router.versioned
      .get({
        path: EPM_API_ROUTES.BULK_ROLLBACK_INFO_PATTERN,
        security: INSTALL_PACKAGES_SECURITY,
        summary: `Get Bulk rollback packages details`,
        description: `Get the status and results of a bulk package rollback operation.`,
        options: {
          tags: ['oas-tag:Elastic Package Manager (EPM)'],
        },
      })
      .addVersion(
        {
          version: API_VERSIONS.public.v1,
          options: {
            oasOperationObject: () => ({
              responses: {
                200: {
                  content: {
                    'application/json': {
                      examples: {
                        successResponse: {
                          value: {
                            status: 'success',
                          },
                        },
                      },
                    },
                  },
                },
                400: {
                  content: {
                    'application/json': {
                      examples: {
                        badRequestResponse: {
                          value: {
                            message: 'Bad Request',
                          },
                        },
                      },
                    },
                  },
                },
              },
            }),
          },
          validate: {
            request: GetOneBulkOperationPackagesRequestSchema,
            response: {
              200: {
                body: () => GetOneBulkOperationPackagesResponseSchema,
                description: 'OK: A successful request.',
              },
              400: {
                body: genericErrorResponse,
                description: 'A bad request.',
              },
            },
          },
        },
        getOneBulkOperationPackagesHandler
      );
  }

  router.versioned
    .post({
      path: EPM_API_ROUTES.BULK_NAMESPACE_CUSTOMIZATION_PATTERN,
      security: INSTALL_PACKAGES_SECURITY,
      summary: `Bulk enable/disable namespace-level customization for packages`,
      description: `Enable or disable namespace-level index template customization for a list of packages in one call. Use this for IaC-style declarative flows.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => ({
            requestBody: {
              content: {
                'application/json': {
                  examples: {
                    bulkNamespaceCustomizationRequest: {
                      value: {
                        packages: ['system', 'nginx'],
                        enable: ['production', 'staging'],
                        disable: ['dev'],
                      },
                    },
                  },
                },
              },
            },
            responses: {
              200: {
                content: {
                  'application/json': {
                    examples: {
                      successResponse: {
                        value: {
                          items: [
                            {
                              name: 'system',
                              success: true,
                              namespace_customization_enabled_for: ['production', 'staging'],
                            },
                            {
                              name: 'nginx',
                              success: false,
                              error: 'Package nginx is not installed',
                            },
                          ],
                        },
                      },
                    },
                  },
                },
              },
              400: {
                content: {
                  'application/json': {
                    examples: {
                      badRequestResponse: {
                        value: {
                          statusCode: 400,
                          error: 'Bad Request',
                          message:
                            'Namespaces must not appear in both enable and disable: production',
                        },
                      },
                    },
                  },
                },
              },
            },
          }),
        },
        validate: {
          request: BulkNamespaceCustomizationRequestSchema,
          response: {
            200: {
              body: () => BulkNamespaceCustomizationResponseSchema,
              description: 'OK: A successful request.',
            },
            400: {
              body: genericErrorResponse,
              description: 'A bad request.',
            },
          },
        },
      },
      postBulkNamespaceCustomizationHandler
    );

  router.versioned
    .get({
      path: EPM_API_ROUTES.BULK_UNINSTALL_INFO_PATTERN,
      security: INSTALL_PACKAGES_SECURITY,
      summary: `Get Bulk uninstall packages details`,
      description: `Get the status and results of a bulk package uninstall operation.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () =>
            path.join(__dirname, 'examples/get_bulk_operation_details.yaml'),
        },
        validate: {
          request: GetOneBulkOperationPackagesRequestSchema,
          response: {
            200: {
              body: () => GetOneBulkOperationPackagesResponseSchema,
              description: 'OK: A successful request.',
            },
            400: {
              body: genericErrorResponse,
              description: 'A bad request.',
            },
          },
        },
      },
      getOneBulkOperationPackagesHandler
    );

  router.versioned
    .get({
      path: EPM_API_ROUTES.BULK_UPGRADE_INFO_PATTERN,
      security: INSTALL_PACKAGES_SECURITY,
      summary: `Get Bulk upgrade packages details`,
      description: `Get the status and results of a bulk package upgrade operation.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () =>
            path.join(__dirname, 'examples/get_bulk_operation_details.yaml'),
        },
        validate: {
          request: GetOneBulkOperationPackagesRequestSchema,
          response: {
            200: {
              body: () => GetOneBulkOperationPackagesResponseSchema,
              description: 'OK: A successful request.',
            },
            400: {
              body: genericErrorResponse,
              description: 'A bad request.',
            },
          },
        },
      },
      getOneBulkOperationPackagesHandler
    );

  router.versioned
    .post({
      path: EPM_API_ROUTES.BULK_INSTALL_PATTERN,
      security: INSTALL_PACKAGES_SECURITY,
      summary: `Bulk install packages`,
      description: `Install multiple packages from the Elastic Package Registry in a single request.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () =>
            path.join(__dirname, 'examples/post_bulk_install_packages.yaml'),
        },
        validate: {
          request: BulkInstallPackagesFromRegistryRequestSchema,
          response: {
            200: {
              body: () => BulkInstallPackagesFromRegistryResponseSchema,
              description: 'OK: A successful request.',
            },
            400: {
              body: genericErrorResponse,
              description: 'A bad request.',
            },
          },
        },
      },
      bulkInstallPackagesFromRegistryHandler
    );

  // Only allow upload for superuser
  router.versioned
    .post({
      path: EPM_API_ROUTES.INSTALL_BY_UPLOAD_PATTERN,
      options: {
        body: {
          accepts: ['application/gzip', 'application/zip'],
          parse: false,
          maxBytes: MAX_FILE_SIZE_BYTES,
        },
        tags: [`oas-tag:Elastic Package Manager (EPM)`],
      },
      security: INSTALL_PACKAGES_SECURITY,
      summary: `Install a package by upload`,
      description: `Install a package by uploading a .zip or .tar.gz archive (max 100MB). Only available to superusers.`,
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () =>
            path.join(__dirname, 'examples/post_install_package_by_upload.yaml'),
        },
        validate: {
          request: InstallPackageByUploadRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => InstallPackageResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      installPackageByUploadHandler
    );

  router.versioned
    .post({
      path: EPM_API_ROUTES.CUSTOM_INTEGRATIONS_PATTERN,
      security: INSTALL_PACKAGES_SECURITY,
      summary: `Create a custom integration`,
      description: `Create a new custom integration package with user-defined data streams.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () =>
            path.join(__dirname, 'examples/post_create_custom_integration.yaml'),
        },
        validate: {
          request: CreateCustomIntegrationRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => InstallPackageResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      createCustomIntegrationHandler
    );

  router.versioned
    .delete({
      path: EPM_API_ROUTES.DELETE_WITHOUT_VERSION_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [
            FLEET_API_PRIVILEGES.INTEGRATIONS.ALL,
            FLEET_API_PRIVILEGES.AGENT_POLICIES.ALL,
          ],
        },
      },
      summary: `Delete a package`,
      description: `Uninstall a package and remove all its assets.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/delete_package.yaml'),
        },
        validate: {
          request: DeletePackageWithoutVersionRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => DeletePackageResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },

      deletePackageHandler
    );

  router.versioned
    .delete({
      path: EPM_API_ROUTES.DELETE_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [
            FLEET_API_PRIVILEGES.INTEGRATIONS.ALL,
            FLEET_API_PRIVILEGES.AGENT_POLICIES.ALL,
          ],
        },
      },
      summary: `Delete a package`,
      description: `Uninstall a specific version of a package and remove all its assets.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/delete_package.yaml'),
        },
        validate: {
          request: DeletePackageRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => DeletePackageResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },

      deletePackageHandler
    );

  router.versioned
    .get({
      path: EPM_API_ROUTES.VERIFICATION_KEY_ID,
      security: READ_PACKAGE_INFO_SECURITY,
      summary: `Get a package signature verification key ID`,
      description: `Get the GPG key ID used to verify the signatures of packages from the Elastic Package Registry.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/get_verification_key_id.yaml'),
        },
        validate: {
          request: {},
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => GetVerificationKeyIdResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      getVerificationKeyIdHandler
    );

  router.versioned
    .get({
      path: EPM_API_ROUTES.DATA_STREAMS_PATTERN,
      security: READ_PACKAGE_INFO_SECURITY,
      summary: `Get data streams`,
      description: `Get a list of data streams created by installed integration packages.`,
      options: {
        tags: ['oas-tag:Data streams'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/get_data_streams.yaml'),
        },
        validate: {
          request: GetDataStreamsRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => GetDataStreamsResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      getDataStreamsHandler
    );

  router.versioned
    .post({
      path: EPM_API_ROUTES.BULK_ASSETS_PATTERN,
      security: READ_PACKAGE_INFO_SECURITY,
      summary: `Bulk get assets`,
      description: `Retrieve multiple Kibana saved object assets by their IDs and types.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/post_bulk_get_assets.yaml'),
        },
        validate: {
          request: GetBulkAssetsRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => GetBulkAssetsResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      getBulkAssetsHandler
    );

  // Update transforms with es-secondary-authorization headers,
  // append authorized_by to transform's _meta, and start transforms
  router.versioned
    // @ts-ignore TODO move to kibana authz https://github.com/elastic/kibana/issues/203170
    .post({
      path: EPM_API_ROUTES.REAUTHORIZE_TRANSFORMS,
      fleetAuthz: {
        ...INSTALL_PACKAGES_AUTHZ,
        packagePrivileges: {
          transform: {
            actions: {
              canStartStopTransform: {
                executePackageAction: true,
              },
            },
          },
        },
      },
      summary: `Authorize transforms`,
      description: `Reauthorize Elasticsearch transforms installed by a package with secondary authorization headers.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () =>
            path.join(__dirname, 'examples/post_reauthorize_transforms.yaml'),
        },
        validate: {
          request: ReauthorizeTransformRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => ReauthorizeTransformResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      reauthorizeTransformsHandler
    );

  router.versioned
    .put({
      path: EPM_API_ROUTES.UPDATE_CUSTOM_INTEGRATIONS_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [
            FLEET_API_PRIVILEGES.SETTINGS.ALL,
            FLEET_API_PRIVILEGES.INTEGRATIONS.ALL,
          ],
        },
      },
      summary: `Update a custom integration`,
      description: `Update the datasets of an existing custom integration package.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () =>
            path.join(__dirname, 'examples/put_update_custom_integration.yaml'),
        },
        validate: {
          request: CustomIntegrationRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      updateCustomIntegrationHandler
    );

  router.versioned
    .delete({
      path: EPM_API_ROUTES.PACKAGES_DATASTREAM_ASSETS,
      security: INSTALL_PACKAGES_SECURITY,
      summary: `Delete assets for a package`,
      description: `Delete datastream assets for a specific package, by data stream name.`,
      options: {
        tags: ['oas-tag:Elastic Package Manager (EPM)'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () =>
            path.join(__dirname, 'examples/delete_package_datastream_assets.yaml'),
        },
        validate: {
          request: DeletePackageDatastreamAssetsRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => DeletePackageDatastreamAssetsResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      deletePackageDatastreamAssetsHandler
    );

  if (experimentalFeatures.enablePackageRollback) {
    router.versioned
      .post({
        path: EPM_API_ROUTES.ROLLBACK_PATTERN,
        security: INSTALL_PACKAGES_SECURITY,
        summary: `Rollback a package to previous version`,
        description: `Rollback a package to its previously installed version.`,
        options: {
          tags: ['oas-tag:Elastic Package Manager (EPM)'],
          availability: {
            since: '9.1.0',
            stability: 'experimental',
          },
        },
      })
      .addVersion(
        {
          version: API_VERSIONS.public.v1,
          options: {
            oasOperationObject: () => ({
              responses: {
                200: {
                  content: {
                    'application/json': {
                      examples: {
                        successResponse: {
                          value: {
                            version: '1.0.0',
                            success: true,
                          },
                        },
                      },
                    },
                  },
                },
                400: {
                  content: {
                    'application/json': {
                      examples: {
                        badRequestResponse: {
                          value: {
                            message: 'Bad Request',
                          },
                        },
                      },
                    },
                  },
                },
              },
            }),
          },
          validate: {
            request: RollbackPackageRequestSchema,
            response: {
              200: {
                description: 'OK: A successful request.',
                body: () => RollbackPackageResponseSchema,
              },
              400: {
                description: 'A bad request.',
                body: genericErrorResponse,
              },
            },
          },
        },
        rollbackPackageHandler
      );

    router.versioned
      .get({
        path: EPM_API_ROUTES.ROLLBACK_AVAILABLE_CHECK_PATTERN,
        security: READ_PACKAGE_INFO_SECURITY,
        summary: `Check if rollback is available for a package`,
        options: {
          tags: ['internal', 'oas-tag:Elastic Package Manager (EPM)'],
        },
        access: 'internal',
      })
      .addVersion(
        {
          version: API_VERSIONS.internal.v1,
          options: {
            oasOperationObject: () => ({
              responses: {
                200: {
                  content: {
                    'application/json': {
                      examples: {
                        successResponse: {
                          value: {
                            reason: 'reason',
                            isAvailable: false,
                          },
                        },
                      },
                    },
                  },
                },
                400: {
                  content: {
                    'application/json': {
                      examples: {
                        badRequestResponse: {
                          value: {
                            message: 'Bad Request',
                          },
                        },
                      },
                    },
                  },
                },
              },
            }),
          },
          validate: {
            request: RollbackPackageRequestSchema,
            response: {
              200: {
                description: 'OK: A successful request.',
                body: () => RollbackAvailableCheckResponseSchema,
              },
              400: {
                description: 'A bad request.',
                body: genericErrorResponse,
              },
            },
          },
        },
        rollbackAvailableCheckHandler
      );

    router.versioned
      .get({
        path: EPM_API_ROUTES.BULK_ROLLBACK_AVAILABLE_CHECK_PATTERN,
        security: READ_PACKAGE_INFO_SECURITY,
        summary: `Check if rollback is available for installed packages`,
        options: {
          tags: ['internal', 'oas-tag:Elastic Package Manager (EPM)'],
        },
        access: 'internal',
      })
      .addVersion(
        {
          version: API_VERSIONS.internal.v1,
          options: {
            oasOperationObject: () => ({
              responses: {
                200: {
                  content: {
                    'application/json': {
                      examples: {
                        successResponse: {
                          value: {
                            reason: 'reason',
                            isAvailable: false,
                          },
                        },
                      },
                    },
                  },
                },
                400: {
                  content: {
                    'application/json': {
                      examples: {
                        badRequestResponse: {
                          value: {
                            message: 'Bad Request',
                          },
                        },
                      },
                    },
                  },
                },
              },
            }),
          },
          validate: {
            request: {},
            response: {
              200: {
                description: 'OK: A successful request.',
                body: () => BulkRollbackAvailableCheckResponseSchema,
              },
              400: {
                description: 'A bad request.',
                body: genericErrorResponse,
              },
            },
          },
        },
        bulkRollbackAvailableCheckHandler
      );
  }

  router.versioned
    .get({
      path: EPM_API_ROUTES.ILM_POLICIES_PATTERN,
      security: READ_PACKAGE_INFO_SECURITY,
      summary: `Get available ILM policies`,
      description: `Returns the list of user-created ILM policies and whether the current user has the manage_ilm cluster privilege.`,
      options: {
        tags: ['internal', 'oas-tag:Elastic Package Manager (EPM)'],
        availability: {
          since: '9.5.0',
          stability: 'experimental',
        },
      },
      access: 'internal',
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v1,
        validate: {
          request: {},
          response: {
            200: {
              description: 'OK: A successful request.',
            },
          },
        },
      },
      getIlmPoliciesHandler
    );
};
