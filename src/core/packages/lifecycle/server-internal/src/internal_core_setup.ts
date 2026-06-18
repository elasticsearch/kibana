/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { InternalAnalyticsServiceSetup } from '@kbn/core-analytics-server-internal';
import type { CapabilitiesSetup } from '@kbn/core-capabilities-server';
import type { DocLinksServiceSetup } from '@kbn/core-doc-links-server';
import type { I18nServiceSetup } from '@kbn/core-i18n-server';
import type { InternalElasticsearchServiceSetup } from '@kbn/core-elasticsearch-server-internal';
import type { InternalEnvironmentServiceSetup } from '@kbn/core-environment-server-internal';
import type { InternalExecutionContextSetup } from '@kbn/core-execution-context-server-internal';
import type { InternalContextSetup } from '@kbn/core-http-context-server-internal';
import type { InternalDeprecationsServiceSetup } from '@kbn/core-deprecations-server-internal';
import type { InternalUserActivityServiceSetup } from '@kbn/core-user-activity-server-internal';
import type { InternalHttpResourcesSetup } from '@kbn/core-http-resources-server-internal';
import type { InternalHttpServiceSetup } from '@kbn/core-http-server-internal';
import type { InternalLoggingServiceSetup } from '@kbn/core-logging-server-internal';
import type { InternalMetricsServiceSetup } from '@kbn/core-metrics-server-internal';
import type { InternalRenderingServiceSetup } from '@kbn/core-rendering-server-internal';
import type { InternalSavedObjectsServiceSetup } from '@kbn/core-saved-objects-server-internal';
import type { InternalStatusServiceSetup } from '@kbn/core-status-server-internal';
import type { InternalUiSettingsServiceSetup } from '@kbn/core-ui-settings-server-internal';
import type { InternalCoreUsageDataSetup } from '@kbn/core-usage-data-base-server-internal';
import type { InternalCustomBrandingSetup } from '@kbn/core-custom-branding-server-internal';
import type { InternalUserSettingsServiceSetup } from '@kbn/core-user-settings-server-internal';
import type { InternalSecurityServiceSetup } from '@kbn/core-security-server-internal';
import type { InternalUserProfileServiceSetup } from '@kbn/core-user-profile-server-internal';
import type { InternalFeatureFlagsSetup } from '@kbn/core-feature-flags-server-internal';
import type { PricingServiceSetup } from '@kbn/core-pricing-server';
import type { InternalCoreDiServiceSetup } from '@kbn/core-di-internal';
import type { DataStreamsSetup } from '@kbn/core-data-streams-server';
import type { UserStorageServiceSetup } from '@kbn/core-user-storage-server';

/** @internal */
export interface InternalCoreSetup {
  analytics: InternalAnalyticsServiceSetup;
  capabilities: CapabilitiesSetup;
  context: InternalContextSetup;
  docLinks: DocLinksServiceSetup;
  http: InternalHttpServiceSetup;
  elasticsearch: InternalElasticsearchServiceSetup;
  executionContext: InternalExecutionContextSetup;
  featureFlags: InternalFeatureFlagsSetup;
  i18n: I18nServiceSetup;
  savedObjects: InternalSavedObjectsServiceSetup;
  status: InternalStatusServiceSetup;
  uiSettings: InternalUiSettingsServiceSetup;
  environment: InternalEnvironmentServiceSetup;
  rendering: InternalRenderingServiceSetup;
  httpResources: InternalHttpResourcesSetup;
  logging: InternalLoggingServiceSetup;
  metrics: InternalMetricsServiceSetup;
  deprecations: InternalDeprecationsServiceSetup;
  userActivity: InternalUserActivityServiceSetup;
  coreUsageData: InternalCoreUsageDataSetup;
  customBranding: InternalCustomBrandingSetup;
  userSettings: InternalUserSettingsServiceSetup;
  security: InternalSecurityServiceSetup;
  userProfile: InternalUserProfileServiceSetup;
  pricing: PricingServiceSetup;
  injection: InternalCoreDiServiceSetup;
  dataStreams: DataStreamsSetup;
  userStorage: UserStorageServiceSetup;
  _plugins?: Map<string, any>;
}
