/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createSecurityDocumentProfileProviders } from './security/security_profile_providers';
import type { DiscoverServices } from '../../build_services';
import type {
  DataSourceProfileService,
  DocumentProfileService,
  RootProfileService,
} from '../profiles';
import { createClassicNavRootProfileProvider } from './common/classic_nav_root_profile';
import { createSearchRootProfileProvider } from './common/search_root_profile';
import { createChangePointDataSourceProfileProvider } from './common/change_point_data_source_profile';
import { createDeprecationLogsDataSourceProfileProvider } from './common/deprecation_logs_data_source_profile';
import { createPatternsDataSourceProfileProvider } from './common/patterns_data_source_profile';
import { registerEnabledProfileProviders } from './register_enabled_profile_providers';
import { createExampleDataSourceProfileProvider } from './example/example_data_source_profile/profile';
import { createExampleDocumentProfileProvider } from './example/example_document_profile';
import {
  createExampleRootProfileProvider,
  createExampleSolutionViewRootProfileProvider,
} from './example/example_root_profile';
import { createObservabilityLogsDataSourceProfileProviders } from './observability/logs_data_source_profile';
import { createObservabilityDocumentProfileProviders } from './observability/observability_profile_providers';
import { createObservabilityRootProfileProvider } from './observability/observability_root_profile/profile';
import { createObservabilityTracesDataSourceProfileProviders } from './observability/traces_data_source_profile/create_profile_providers';
import type {
  ProfileProviderServices,
  ProfileProviderSharedServices,
} from './profile_provider_services';
import { createSecurityRootProfileProvider } from './security/security_root_profile';
import { createSecurityDataSourceProfileProvider } from './security/security_data_source_profile';
import { createMetricsDataSourceProfileProvider } from './common/metrics_data_source_profile';
import { createSparklineDataSourceProfileProvider } from './common/sparkline_data_source_profile';

/**
 * Register profile providers for root, data source, and document contexts to the profile profile services
 * @param options Register profile provider options
 */
export const registerProfileProviders = ({
  rootProfileService,
  dataSourceProfileService,
  documentProfileService,
  enabledExperimentalProfileIds,
  sharedServices,
  services,
}: {
  /**
   * Root profile service
   */
  rootProfileService: RootProfileService;
  /**
   * Data source profile service
   */
  dataSourceProfileService: DataSourceProfileService;
  /**
   * Document profile service
   */
  documentProfileService: DocumentProfileService;
  /**
   * Array of experimental profile IDs which are enabled in `kibana.yml`
   */
  enabledExperimentalProfileIds: string[];
  /**
   * Shared services for profile providers
   */
  sharedServices: ProfileProviderSharedServices;
  /**
   * The base Discover services
   */
  services: DiscoverServices;
}) => {
  const providerServices: ProfileProviderServices = { ...sharedServices, ...services };
  const rootProfileProviders = createRootProfileProviders(providerServices);
  const dataSourceProfileProviders = createDataSourceProfileProviders(providerServices);
  const documentProfileProviders = createDocumentProfileProviders(providerServices);

  registerEnabledProfileProviders({
    profileService: rootProfileService,
    providers: rootProfileProviders,
    enabledExperimentalProfileIds,
    services,
  });

  registerEnabledProfileProviders({
    profileService: dataSourceProfileService,
    providers: dataSourceProfileProviders,
    enabledExperimentalProfileIds,
    services,
  });

  registerEnabledProfileProviders({
    profileService: documentProfileService,
    providers: documentProfileProviders,
    enabledExperimentalProfileIds,
    services,
  });
};

/**
 * Creates the available root profile providers
 * @param providerServices The profile provider services
 * @returns An array of available root profile providers
 */
const createRootProfileProviders = (providerServices: ProfileProviderServices) => [
  createExampleRootProfileProvider(),
  createExampleSolutionViewRootProfileProvider(),
  createClassicNavRootProfileProvider(providerServices),
  createSearchRootProfileProvider(),
  createSecurityRootProfileProvider(providerServices),
  createObservabilityRootProfileProvider(providerServices),
];

/**
 * Creates the available data source profile providers
 * @param providerServices The profile provider services
 * @returns An array of available data source profile providers
 */
const createDataSourceProfileProviders = (providerServices: ProfileProviderServices) => [
  createExampleDataSourceProfileProvider(),
  createPatternsDataSourceProfileProvider(providerServices),
  createChangePointDataSourceProfileProvider(providerServices),
  createMetricsDataSourceProfileProvider(),
  createDeprecationLogsDataSourceProfileProvider(),
  createSparklineDataSourceProfileProvider(providerServices),
  createSecurityDataSourceProfileProvider(providerServices),
  ...createObservabilityTracesDataSourceProfileProviders(providerServices),
  ...createObservabilityLogsDataSourceProfileProviders(providerServices),
];

/**
 * Creates the available document profile providers
 * @param providerServices The profile provider services
 * @returns An array of available document profile providers
 */
const createDocumentProfileProviders = (providerServices: ProfileProviderServices) => [
  createExampleDocumentProfileProvider(),
  ...createSecurityDocumentProfileProviders(providerServices),
  ...createObservabilityDocumentProfileProviders(providerServices),
];
