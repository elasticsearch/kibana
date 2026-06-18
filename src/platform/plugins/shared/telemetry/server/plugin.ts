/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { URL } from 'url';
import {
  type Observable,
  startWith,
  firstValueFrom,
  ReplaySubject,
  exhaustMap,
  timer,
  distinctUntilChanged,
  filter,
  takeUntil,
  tap,
  shareReplay,
  map,
  first,
} from 'rxjs';

import { ElasticV3ServerShipper } from '@elastic/ebt/shippers/elastic_v3/server';

import type { UsageCollectionSetup } from '@kbn/usage-collection-plugin/server';
import type {
  TelemetryCollectionManagerPluginSetup,
  TelemetryCollectionManagerPluginStart,
} from '@kbn/telemetry-collection-manager-plugin/server';
import type {
  CoreSetup,
  PluginInitializerContext,
  ISavedObjectsRepository,
  CoreStart,
  Plugin,
  Logger,
} from '@kbn/core/server';
import type { SecurityPluginStart } from '@kbn/security-plugin/server';
import type { InternalAnalyticsServiceSetup } from '@kbn/core-analytics-server-internal';
import { SavedObjectsClient } from '@kbn/core/server';

import apm from 'elastic-apm-node';
import { buildShipperHeaders, createBuildShipperUrl } from '../common/ebt_v3_endpoint';
import {
  type TelemetrySavedObject,
  getTelemetrySavedObject,
  registerTelemetrySavedObject,
  TELEMETRY_SAVED_OBJECT_TYPE,
} from './saved_objects';
import { registerRoutes } from './routes';
import { registerCollection } from './telemetry_collection';
import {
  registerTelemetryUsageCollector,
  registerTelemetryPluginUsageCollector,
} from './collectors';
import type { TelemetryConfigLabels, TelemetryConfigType } from './config';
import { FetcherTask } from './fetcher';
import { OPT_IN_POLL_INTERVAL_MS } from '../common/constants';
import { getTelemetryChannelEndpoint } from '../common/telemetry_config';
import { getTelemetryOptIn } from './telemetry_config';

interface TelemetryPluginsDepsSetup {
  usageCollection: UsageCollectionSetup;
  telemetryCollectionManager: TelemetryCollectionManagerPluginSetup;
}

interface TelemetryPluginsDepsStart {
  telemetryCollectionManager: TelemetryCollectionManagerPluginStart;
  security?: SecurityPluginStart;
}

/**
 * Server's setup exposed APIs by the telemetry plugin
 */
export interface TelemetryPluginSetup {
  /**
   * Resolves into the telemetry Url used to send telemetry.
   * The url is wrapped with node's [URL constructor](https://nodejs.org/api/url.html).
   */
  getTelemetryUrl: () => Promise<URL>;
}

/**
 * Server's start exposed APIs by the telemetry plugin
 */
export interface TelemetryPluginStart {
  /**
   * Resolves `true` if sending usage to Elastic is enabled.
   * Resolves `false` if the user explicitly opted out of sending usage data to Elastic
   * or did not choose to opt-in or out -yet- after a minor or major upgrade (only when previously opted-out).
   *
   * @deprecated Subscribe to `core.analytics.isOptedIn$` instead. The opt-in status is now owned by
   * the Core Analytics service, so consumers no longer need to depend on the `telemetry` plugin.
   */
  getIsOptedIn: () => Promise<boolean>;

  /**
   * An Observable object that can be subscribed to for changes in global telemetry config.
   *
   * Pushes `true` when sending usage to Elastic is enabled.
   * Pushes `false` when the user explicitly opts out of sending usage data to Elastic.
   *
   * Additionally, pushes the actual value on Kibana startup, except if the (previously opted-out) user
   * haven't chosen yet to opt-in or out after a minor or major upgrade. In that case, pushing the new
   * value waits until the user decides.
   *
   * @deprecated Subscribe to `core.analytics.isOptedIn$` instead. The opt-in status is now owned by
   * the Core Analytics service, so consumers no longer need to depend on the `telemetry` plugin.
   */
  isOptedIn$: Observable<boolean>;
}

export class TelemetryPlugin implements Plugin<TelemetryPluginSetup, TelemetryPluginStart> {
  private readonly logger: Logger;
  private readonly currentKibanaVersion: string;
  private readonly initialConfig: TelemetryConfigType;
  private readonly config$: Observable<TelemetryConfigType>;
  private readonly isOptedIn$: Observable<boolean>;
  private isOptedIn?: boolean;
  private readonly isDev: boolean;
  private readonly fetcherTask: FetcherTask;
  private readonly shouldStartSnapshotTelemetryFetcher: boolean;
  /**
   * @internal Used to mark the completion of the old UI Settings migration
   */
  private savedObjectsInternalRepository?: ISavedObjectsRepository;

  /**
   * @internal
   * Used to interact with the Telemetry Saved Object.
   * Some users may not have access to the document but some queries
   * are still relevant to them like fetching when was the last time it was reported.
   *
   * Using the internal client in all cases ensures the permissions to interact the document.
   */
  private readonly savedObjectsInternalClient$ = new ReplaySubject<SavedObjectsClient>(1);

  private readonly pluginStop$ = new ReplaySubject<void>(1);

  private security?: SecurityPluginStart;

  constructor(initializerContext: PluginInitializerContext<TelemetryConfigType>) {
    this.logger = initializerContext.logger.get();
    this.isDev = initializerContext.env.mode.dev;
    this.currentKibanaVersion = initializerContext.env.packageInfo.version;
    this.config$ = initializerContext.config.create();
    this.initialConfig = initializerContext.config.get();
    this.fetcherTask = new FetcherTask({
      ...initializerContext,
      logger: this.logger,
    });

    // Only generate and report the snapshot telemetry in the UI node.
    // This allows better cache optimizations and allowing background tasks to focus on alerts and similar.
    this.shouldStartSnapshotTelemetryFetcher = initializerContext.node.roles.ui;

    // If the opt-in selection cannot be changed, set it as early as possible.
    const { optIn, allowChangingOptInStatus } = this.initialConfig;
    this.isOptedIn = allowChangingOptInStatus === false ? optIn : undefined;

    // Poll for the opt-in status
    this.isOptedIn$ = timer(0, OPT_IN_POLL_INTERVAL_MS).pipe(
      exhaustMap(() => this.getOptInStatus()),
      takeUntil(this.pluginStop$),
      startWith(this.isOptedIn),
      filter((isOptedIn): isOptedIn is boolean => typeof isOptedIn === 'boolean'),
      distinctUntilChanged(),
      tap((optedIn) => (this.isOptedIn = optedIn)),
      shareReplay(1)
    );
  }

  public setup(
    coreSetup: CoreSetup,
    { usageCollection, telemetryCollectionManager }: TelemetryPluginsDepsSetup
  ): TelemetryPluginSetup {
    const { analytics, docLinks, http, savedObjects } = coreSetup;

    this.isOptedIn$.subscribe((optedIn) => {
      const optInStatusMsg = optedIn ? 'enabled' : 'disabled';
      this.logger.info(
        `Telemetry collection is ${optInStatusMsg}. For more information on telemetry settings, refer to ${docLinks.links.telemetry.settings}.`
      );
    });

    // Register the telemetry opt-in status as the source of truth for the Core Analytics service.
    // Core both re-exposes it via `analytics.isOptedIn$` and uses it to drive the analytics client's
    // global consent, so the telemetry plugin no longer needs to call `analytics.optIn` directly.
    //
    // `registerOptInStatus$` is intentionally kept off the public `AnalyticsServiceSetup` contract:
    // only this platform-owned producer is meant to drive the global opt-in status, so we reach it by
    // casting to the internal contract.
    (analytics as InternalAnalyticsServiceSetup).registerOptInStatus$(this.isOptedIn$);

    const currentKibanaVersion = this.currentKibanaVersion;

    const sendTo = this.getSendToEnv(this.initialConfig.sendUsageTo);
    analytics.registerShipper(ElasticV3ServerShipper, {
      channelName: 'kibana-server',
      version: currentKibanaVersion,
      buildShipperHeaders,
      buildShipperUrl: createBuildShipperUrl(sendTo),
    });

    analytics.registerContextProvider<{ labels: TelemetryConfigLabels }>({
      name: 'telemetry labels',
      context$: this.config$.pipe(
        map(({ labels }) => ({ labels })),
        tap(({ labels }) =>
          Object.entries(labels).forEach(([key, value]) => apm.setGlobalLabel(key, value))
        )
      ),
      schema: {
        labels: {
          type: 'pass_through',
          _meta: {
            description:
              'Custom labels added to the telemetry.labels config in the kibana.yml. Validated and limited to a known set of labels.',
          },
        },
      },
    });

    const config$ = this.config$;
    const isDev = this.isDev;
    registerCollection(telemetryCollectionManager);
    const router = http.createRouter();

    registerRoutes({
      config$,
      currentKibanaVersion,
      isDev,
      logger: this.logger,
      router,
      telemetryCollectionManager,
      savedObjectsInternalClient$: this.savedObjectsInternalClient$,
      getSecurity: () => this.security,
    });

    registerTelemetrySavedObject((opts) => savedObjects.registerType(opts));
    this.registerUsageCollectors(usageCollection);

    config$
      .pipe(
        filter((cfg) => cfg.localShipper === true),
        first(),
        map(async () => {
          const { initializeLocalShipper } = await import('./local_shipper');
          initializeLocalShipper(this.logger.get('local-shipper'), coreSetup);
        })
      )
      .subscribe();

    return {
      getTelemetryUrl: async () => {
        const { appendServerlessChannelsSuffix, sendUsageTo } = await firstValueFrom(config$);
        const telemetryUrl = getTelemetryChannelEndpoint({
          appendServerlessChannelsSuffix,
          env: sendUsageTo,
          channelName: 'snapshot',
        });

        return new URL(telemetryUrl);
      },
    };
  }

  public start(
    core: CoreStart,
    { telemetryCollectionManager, security }: TelemetryPluginsDepsStart
  ) {
    const { analytics, savedObjects } = core;

    const savedObjectsInternalRepository = savedObjects.createInternalRepository([
      TELEMETRY_SAVED_OBJECT_TYPE,
    ]);
    this.savedObjectsInternalRepository = savedObjectsInternalRepository;
    this.savedObjectsInternalClient$.next(new SavedObjectsClient(savedObjectsInternalRepository));

    this.security = security;

    if (this.shouldStartSnapshotTelemetryFetcher) {
      // Only generate and report the snapshot telemetry if we are on the appropriate node role
      this.startFetcher(core, telemetryCollectionManager);
    }

    return {
      getIsOptedIn: async () => this.isOptedIn === true,
      isOptedIn$: analytics.isOptedIn$,
    };
  }

  public stop() {
    this.pluginStop$.next();
    this.pluginStop$.complete();
    this.savedObjectsInternalClient$.complete();
    this.fetcherTask.stop();
  }

  private getSendToEnv(sendUsageTo: string): 'production' | 'staging' {
    return sendUsageTo === 'prod' ? 'production' : 'staging';
  }

  private async getOptInStatus(): Promise<boolean | undefined> {
    const internalRepositoryClient = await firstValueFrom(this.savedObjectsInternalClient$, {
      defaultValue: undefined,
    });
    if (!internalRepositoryClient) return;

    let telemetrySavedObject: TelemetrySavedObject | undefined;
    try {
      telemetrySavedObject = await getTelemetrySavedObject(internalRepositoryClient);
    } catch (err) {
      this.logger.debug('Failed to check telemetry opt-in status: ' + err.message);
      // If we can't get the saved object due to any error other than 404, skip this round.
      return;
    }

    const config = await firstValueFrom(this.config$);
    const allowChangingOptInStatus = config.allowChangingOptInStatus;
    const configTelemetryOptIn = typeof config.optIn === 'undefined' ? null : config.optIn;
    const currentKibanaVersion = this.currentKibanaVersion;
    const isOptedIn = getTelemetryOptIn({
      currentKibanaVersion,
      telemetrySavedObject,
      allowChangingOptInStatus,
      configTelemetryOptIn,
    });

    if (typeof isOptedIn === 'boolean') {
      return isOptedIn;
    }
  }

  private startFetcher(
    core: CoreStart,
    telemetryCollectionManager: TelemetryCollectionManagerPluginStart
  ) {
    // We start the fetcher having updated everything we need to use the config settings
    this.fetcherTask.start(core, { telemetryCollectionManager });
  }

  private registerUsageCollectors(usageCollection: UsageCollectionSetup) {
    const getSavedObjectsClient = () => this.savedObjectsInternalRepository;

    registerTelemetryPluginUsageCollector(usageCollection, {
      currentKibanaVersion: this.currentKibanaVersion,
      config$: this.config$,
      getSavedObjectsClient,
    });
    registerTelemetryUsageCollector(usageCollection, this.config$);
  }
}
