/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ApmBase } from '@elastic/apm-rum';
import type {
  Plugin,
  CoreStart,
  CoreSetup,
  HttpStart,
  PluginInitializerContext,
  ApplicationStart,
  DocLinksStart,
} from '@kbn/core/public';
import type {
  ScreenshotModePluginSetup,
  ScreenshotModePluginStart,
} from '@kbn/screenshot-mode-plugin/public';
import type { HomePublicPluginSetup } from '@kbn/home-plugin/public';
import { ElasticV3BrowserShipper } from '@elastic/ebt/shippers/elastic_v3/browser';
import { isSyntheticsMonitor } from '@kbn/analytics-collection-utils';
import { BehaviorSubject, type Observable, map, switchMap, tap } from 'rxjs';
import { buildShipperHeaders, createBuildShipperUrl } from '../common/ebt_v3_endpoint';

import type { TelemetryConfigLabels } from '../server/config';
import { TelemetrySender, TelemetryService, TelemetryNotifications } from './services';
import { renderWelcomeTelemetryNotice } from './render_welcome_telemetry_notice';

/**
 * Publicly exposed APIs from the Telemetry Service
 */
export interface TelemetryServicePublicApis {
  /**
   * Is the cluster opted-in to telemetry?
   * @deprecated Subscribe to {@link TelemetryServicePublicApis.isOptedIn$ | isOptedIn$} instead.
   * Reading this synchronously at `start()` time or initial render may return the stale injected
   * default before the user's saved preference has been fetched from the server.
   */
  getIsOptedIn: () => boolean | null;
  /**
   * Emits the user's opt-in preference.
   *
   * It withholds the synchronous injected/default value and emits the first time the preference is
   * resolved from the server, then emits again whenever it changes. Replays the latest value to late
   * subscribers.
   */
  isOptedIn$: Observable<boolean>;
  /** Is the user allowed to change the opt-in/out status? **/
  userCanChangeSettings: boolean;
  /**
   * Can phone-home telemetry calls be made? This depends on whether we have opted-in and on whether
   * Kibana is rendering a report / running synthetics.
   * @deprecated Subscribe to {@link TelemetryServicePublicApis.canSendTelemetry$ | canSendTelemetry$}
   * instead. Reading this synchronously at `start()` time or initial render may return a value derived
   * from the stale injected default before the user's saved preference has been fetched from the server.
   */
  canSendTelemetry: () => boolean;
  /**
   * Emits whether phone-home telemetry calls can be made: the user is opted in AND Kibana is not in a
   * "skip" mode (screenshot/synthetics). It withholds the synchronous injected default and emits once
   * the preference is resolved from the server, then on every change. Replays the latest value to late
   * subscribers.
   */
  canSendTelemetry$: Observable<boolean>;
  /** Is the cluster allowed to change the opt-in/out status? **/
  getCanChangeOptInStatus: () => boolean;
  /** Fetches an unencrypted telemetry payload so we can show it to the user **/
  fetchExample: () => Promise<unknown[]>;
  /**
   * Overwrite the opt-in status.
   * It will send a final request to the remote telemetry cluster to report about the opt-in/out change.
   * @param optedIn Whether the user is opting-in (`true`) or out (`false`).
   * @param signal An AbortSignal to cancel any ongoing requests if the caller decides to
   */
  setOptIn: (optedIn: boolean, signal?: AbortSignal) => Promise<boolean>;
}

/**
 * Public's setup exposed APIs by the telemetry plugin
 */
export interface TelemetryPluginSetup {
  /** {@link TelemetryService} **/
  telemetryService: TelemetryServicePublicApis;
}

/**
 * Public's start exposed APIs by the telemetry plugin
 */
export interface TelemetryConstants {
  /** Elastic's privacy statement url **/
  getPrivacyStatementUrl: () => string;
}

export interface TelemetryPluginStart {
  /** {@link TelemetryServicePublicApis} **/
  telemetryService: TelemetryServicePublicApis;
  /** Notification helpers **/
  telemetryNotifications: {
    /** Notify that the user has been presented with the opt-in/out notice. */
    setOptedInNoticeSeen: () => Promise<void>;
  };
  /** Set of publicly exposed telemetry constants **/
  telemetryConstants: TelemetryConstants;
}

interface TelemetryPluginSetupDependencies {
  screenshotMode: ScreenshotModePluginSetup;
  home?: HomePublicPluginSetup;
}

interface TelemetryPluginStartDependencies {
  screenshotMode: ScreenshotModePluginStart;
}

declare global {
  interface Window {
    elasticApm?: ApmBase;
  }
}

/**
 * Public-exposed configuration
 */
export interface TelemetryPluginConfig {
  /** The banner is expected to be shown when needed **/
  banner: boolean;
  /** Does the cluster allow changing the opt-in/out status via the UI? **/
  allowChangingOptInStatus: boolean;
  /** Is the cluster opted-in? **/
  optIn: boolean | null;
  /** Specify if telemetry should send usage to the prod or staging remote telemetry service **/
  sendUsageTo: 'prod' | 'staging';
  /** Should the telemetry payloads be sent from the server or the browser? **/
  sendUsageFrom: 'browser' | 'server';
  /** Should notify the user about the opt-in status? **/
  telemetryNotifyUserAboutOptInDefault?: boolean;
  /** Does the user have enough privileges to change the settings? **/
  userCanChangeSettings?: boolean;
  /** Should we hide the privacy statement notice? Useful on some environments, e.g. Cloud */
  hidePrivacyStatement?: boolean;
  /** Extra labels to add to the telemetry context */
  labels: Record<string, unknown>;
  /** Whether to use Serverless-specific channels when reporting Snapshot Telemetry */
  appendServerlessChannelsSuffix: boolean;
  /** Should use the local EBT shipper to persist events in the local ES */
  localShipper: boolean;
}

function getTelemetryConstants(docLinks: DocLinksStart): TelemetryConstants {
  return {
    getPrivacyStatementUrl: () => docLinks.links.legal.privacyStatement,
  };
}

export class TelemetryPlugin
  implements
    Plugin<
      TelemetryPluginSetup,
      TelemetryPluginStart,
      TelemetryPluginSetupDependencies,
      TelemetryPluginStartDependencies
    >
{
  private readonly currentKibanaVersion: string;
  private readonly config: TelemetryPluginConfig;
  private readonly telemetryLabels$: BehaviorSubject<TelemetryConfigLabels>;
  private telemetrySender?: TelemetrySender;
  private telemetryNotifications?: TelemetryNotifications;
  // Definitely assigned in `setup()` (which always runs before `start()` and any deferred callback
  // that reads it), so consumers can treat it as always present.
  private telemetryService!: TelemetryService;
  private canUserChangeSettings: boolean = true;

  constructor(initializerContext: PluginInitializerContext<TelemetryPluginConfig>) {
    this.currentKibanaVersion = initializerContext.env.packageInfo.version;
    this.config = initializerContext.config.get();
    this.telemetryLabels$ = new BehaviorSubject<TelemetryConfigLabels>(this.config.labels);
  }

  public setup(
    coreSetup: CoreSetup,
    { screenshotMode, home }: TelemetryPluginSetupDependencies
  ): TelemetryPluginSetup {
    const { analytics, http, notifications, getStartServices } = coreSetup;
    const config = this.config;
    const currentKibanaVersion = this.currentKibanaVersion;
    this.telemetryService = new TelemetryService({
      config,
      isScreenshotMode: this.shouldSkipTelemetry(screenshotMode),
      http,
      notifications,
      currentKibanaVersion,
    });

    let telemetryConstants: TelemetryConstants;

    getStartServices().then(([{ docLinks }]) => {
      telemetryConstants = getTelemetryConstants(docLinks);
    });

    analytics.registerContextProvider({
      name: 'telemetry labels',
      context$: this.telemetryLabels$.pipe(
        tap((labels) => {
          // Hack to update the APM agent's labels.
          // In the future we might want to expose APM as a core service to make reporting metrics much easier.
          window.elasticApm?.addLabels(labels);
        }),
        map((labels) => ({ labels }))
      ),
      schema: {
        labels: {
          type: 'pass_through',
          _meta: {
            description: 'Custom labels added to the telemetry.labels config in the kibana.yml',
          },
        },
      },
    });

    const sendTo = this.getSendToEnv(config.sendUsageTo);
    analytics.registerShipper(ElasticV3BrowserShipper, {
      channelName: 'kibana-browser',
      version: currentKibanaVersion,
      buildShipperHeaders,
      buildShipperUrl: createBuildShipperUrl(sendTo),
    });

    if (config.localShipper) {
      // Make it async to exclude the shipper from the initial page load since this config will likely be false most of the time.
      import('./local_shipper')
        .then(({ initializeLocalShipper }) => initializeLocalShipper(coreSetup))
        .catch(() => {});
    }

    this.telemetrySender = new TelemetrySender(this.telemetryService, async () => {
      await this.refreshConfig();
      analytics.optIn({
        global: {
          enabled: this.telemetryService.isOptedIn && !this.shouldSkipTelemetry(screenshotMode),
        },
      });
    });

    if (home && !this.config.hidePrivacyStatement) {
      home.welcomeScreen.registerOnRendered(() => {
        if (this.telemetryService.userCanChangeSettings) {
          this.telemetryNotifications?.setOptInStatusNoticeSeen();
        }
      });

      home.welcomeScreen.registerTelemetryNoticeRenderer(() =>
        renderWelcomeTelemetryNotice(
          this.telemetryService,
          http.basePath.prepend,
          telemetryConstants
        )
      );
    }

    return {
      telemetryService: this.getTelemetryServicePublicApis(),
    };
  }

  public start(
    { analytics, http, overlays, application, docLinks, ...startServices }: CoreStart,
    { screenshotMode }: TelemetryPluginStartDependencies
  ): TelemetryPluginStart {
    if (!this.telemetryService) {
      throw Error('Telemetry plugin failed to initialize properly.');
    }

    this.canUserChangeSettings = this.getCanUserChangeSettings(application);
    this.telemetryService.userCanChangeSettings = this.canUserChangeSettings;
    const telemetryConstants = getTelemetryConstants(docLinks);

    const telemetryNotifications = new TelemetryNotifications({
      http,
      overlays,
      telemetryService: this.telemetryService,
      telemetryConstants,
      analytics,
      ...startServices,
    });
    this.telemetryNotifications = telemetryNotifications;

    if (this.shouldSkipTelemetry(screenshotMode)) {
      // In screenshot/synthetics mode we don't query the server. Seed `isOptedIn$` with the
      // synchronous injected default so subscribers still receive a value.
      this.telemetryService.config = this.config;
    } else {
      // Fetch the user's saved preference as early as possible so `telemetryService.isOptedIn$` emits
      // the real value without waiting for the first `currentAppId$` emission (which only fires after
      // every plugin's `start()` has run). This is the fix for the stale-at-startup behavior.
      this.refreshConfig().catch(() => {
        // Best-effort: the `currentAppId$` subscription below will retry on the first app navigation.
      });
    }

    application.currentAppId$
      .pipe(
        switchMap(async () => {
          // Disable telemetry and terminate early if Kibana is running in a special "skip" mode
          if (this.shouldSkipTelemetry(screenshotMode)) {
            analytics.optIn({ global: { enabled: false } });
            return;
          }

          // Refresh and get telemetry config
          const updatedConfig = await this.refreshConfig();

          analytics.optIn({
            global: {
              enabled: this.telemetryService.isOptedIn,
            },
          });

          const isUnauthenticated = this.getIsUnauthenticated(http);
          if (isUnauthenticated) {
            return;
          }

          const telemetryBanner = updatedConfig?.banner;

          this.maybeStartTelemetryPoller();
          if (telemetryBanner) {
            this.maybeShowOptedInNotificationBanner();
          }
        })
      )
      .subscribe();

    return {
      telemetryService: this.getTelemetryServicePublicApis(),
      telemetryNotifications: {
        setOptedInNoticeSeen: () => telemetryNotifications.setOptInStatusNoticeSeen(),
      },
      telemetryConstants,
    };
  }

  public stop() {
    this.telemetrySender?.stop();
  }

  private getSendToEnv(sendUsageTo: string): 'production' | 'staging' {
    return sendUsageTo === 'prod' ? 'production' : 'staging';
  }

  /**
   * Kibana should skip telemetry collection if reporting is taking a screenshot
   * or Synthetics monitoring is navigating Kibana.
   * @param screenshotMode {@link ScreenshotModePluginSetup}
   * @internal
   */
  private shouldSkipTelemetry(screenshotMode: ScreenshotModePluginSetup): boolean {
    return screenshotMode.isScreenshotMode() || isSyntheticsMonitor();
  }

  private getTelemetryServicePublicApis(): TelemetryServicePublicApis {
    const { telemetryService } = this;
    return {
      getIsOptedIn: () => telemetryService.getIsOptedIn(),
      isOptedIn$: telemetryService.isOptedIn$,
      setOptIn: (optedIn) => telemetryService.setOptIn(optedIn),
      canSendTelemetry: () => telemetryService.canSendTelemetry(),
      canSendTelemetry$: telemetryService.canSendTelemetry$,
      userCanChangeSettings: telemetryService.userCanChangeSettings,
      getCanChangeOptInStatus: () => telemetryService.getCanChangeOptInStatus(),
      fetchExample: () => telemetryService.fetchExample(),
    };
  }

  /**
   * Retrieve the up-to-date configuration.
   *
   * The fetch (and its concurrency/race handling against `setOptIn`) lives in the service; here we
   * only publish the refreshed labels to the analytics context provider.
   * @internal
   */
  private async refreshConfig(): Promise<TelemetryPluginConfig> {
    const updatedConfig = await this.telemetryService.refreshConfig();
    this.telemetryLabels$.next(updatedConfig.labels);
    return updatedConfig;
  }

  /**
   * Can the user edit the saved objects?
   * This is a security feature, not included in the OSS build, so we need to fallback to `true`
   * in case it is `undefined`.
   * @param application CoreStart.application
   * @internal
   */
  private getCanUserChangeSettings(application: ApplicationStart): boolean {
    return (application.capabilities?.savedObjectsManagement?.edit as boolean | undefined) ?? true;
  }

  private getIsUnauthenticated(http: HttpStart) {
    const { anonymousPaths } = http;
    return anonymousPaths.isAnonymous(window.location.pathname);
  }

  private maybeStartTelemetryPoller() {
    if (!this.telemetrySender) {
      return;
    }

    this.telemetrySender.startChecking();
  }

  private maybeShowOptedInNotificationBanner() {
    if (!this.telemetryNotifications) {
      return;
    }
    const shouldShowBanner = this.telemetryNotifications.shouldShowOptInStatusNoticeBanner();
    if (shouldShowBanner) {
      this.telemetryNotifications.renderOptInStatusNoticeBanner();
    }
  }
}
