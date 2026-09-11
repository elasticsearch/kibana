/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DocLinksStart } from '@kbn/core-doc-links-browser';
import type { ThemeServiceStart } from '@kbn/core-theme-browser';
import type { AnalyticsServiceStart } from '@kbn/core-analytics-browser';
import type { CoreDiServiceStart } from '@kbn/core-di';
import type { ExecutionContextStart } from '@kbn/core-execution-context-browser';
import type { HttpStart } from '@kbn/core-http-browser';
import type { I18nStart } from '@kbn/core-i18n-browser';
import type { FatalErrorsStart } from '@kbn/core-fatal-errors-browser';
import type { IUiSettingsClient, SettingsStart } from '@kbn/core-ui-settings-browser';
import type { DeprecationsServiceStart } from '@kbn/core-deprecations-browser';
import type { OverlayStart } from '@kbn/core-overlays-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import type { ApplicationStart } from '@kbn/core-application-browser';
import type { ChromeStart } from '@kbn/core-chrome-browser';
import type { CustomBrandingStart } from '@kbn/core-custom-branding-browser';
import type { DeferredInitStart } from '@kbn/core-deferred-init-browser';
import type { PluginsServiceStart } from '@kbn/core-plugins-contracts-browser';
import type { PricingServiceStart } from '@kbn/core-pricing-browser';
import type { SecurityServiceStart } from '@kbn/core-security-browser';
import type { RenderingService } from '@kbn/core-rendering-browser';
import type { UserProfileServiceStart } from '@kbn/core-user-profile-browser';
import type { FeatureFlagsStart } from '@kbn/core-feature-flags-browser';
import type { IUserStorageClient } from '@kbn/core-user-storage-browser';

/**
 * Core services exposed to the `Plugin` start lifecycle
 *
 * @public
 *
 * @internalRemarks We document the properties with \@link tags to improve
 * navigation in the generated docs until there's a fix for
 * https://github.com/Microsoft/web-build-tools/issues/1237
 */
export interface CoreStart {
  /** {@link AnalyticsServiceStart} */
  analytics: AnalyticsServiceStart;
  /** {@link ApplicationStart} */
  application: ApplicationStart;
  /** {@link ChromeStart} */
  chrome: ChromeStart;
  /** {@link CustomBrandingStart} */
  customBranding: CustomBrandingStart;
  /**
   * {@link DeferredInitStart}
   *
   * Optional in the public type: Core always provides this at runtime, but it is typed as
   * optional so the many hand-built `CoreStart` literals across plugins and tests don't all
   * need to construct it. Access it with optional chaining (`core.deferredInit?.`).
   */
  deferredInit?: DeferredInitStart;
  /** {@link DocLinksStart} */
  docLinks: DocLinksStart;
  /** {@link ExecutionContextStart} */
  executionContext: ExecutionContextStart;
  /** {@link FeatureFlagsStart} */
  featureFlags: FeatureFlagsStart;
  /** {@link HttpStart} */
  http: HttpStart;
  /** {@link CoreDiServiceStart} */
  injection: CoreDiServiceStart;
  /** {@link I18nStart} */
  i18n: I18nStart;
  /** {@link NotificationsStart} */
  notifications: NotificationsStart;
  /** {@link OverlayStart} */
  overlays: OverlayStart;
  /** {@link IUiSettingsClient} */
  /** @Deprecated Use {@link CoreStart.settings} instead */
  uiSettings: IUiSettingsClient;
  /** {@link SettingsStart} */
  settings: SettingsStart;
  /** {@link FatalErrorsStart} */
  fatalErrors: FatalErrorsStart;
  /** {@link DeprecationsServiceStart} */
  deprecations: DeprecationsServiceStart;
  /** {@link ThemeServiceStart} */
  theme: ThemeServiceStart;
  /** {@link PluginsServiceStart} */
  plugins: PluginsServiceStart;
  /** {@link PricingServiceStart} */
  pricing: PricingServiceStart;
  /** {@link SecurityServiceStart} */
  security: SecurityServiceStart;
  /** {@link UserProfileServiceStart} */
  userProfile: UserProfileServiceStart;
  /** {@link IUserStorageClient} */
  userStorage: IUserStorageClient;
  /** {@link RenderingService} */
  rendering: RenderingService;
}
