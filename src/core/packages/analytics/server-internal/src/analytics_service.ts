/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { of, ReplaySubject, type Observable, type Subscription } from 'rxjs';
import apm from 'elastic-apm-node';
import { trace } from '@opentelemetry/api';
import type { AnalyticsClient } from '@elastic/ebt/client';
import { createAnalytics } from '@elastic/ebt/client';
import { registerPerformanceMetricEventType } from '@kbn/ebt-tools';
import type { CoreContext } from '@kbn/core-base-server-internal';
import type { AnalyticsServiceStart, AnalyticsServicePreboot } from '@kbn/core-analytics-server';
import type { InternalAnalyticsServiceSetup } from './contracts';

export class AnalyticsService {
  private readonly analyticsClient: AnalyticsClient;
  /**
   * Source of truth for the user's global opt-in preference, fed by the registered producer
   * (the platform-owned telemetry service). Exposed via `isOptedIn$` on the start contract.
   */
  private readonly isOptedIn$ = new ReplaySubject<boolean>(1);
  private optInStatusSubscription?: Subscription;

  constructor(core: CoreContext) {
    this.analyticsClient = createAnalytics({
      isDev: core.env.mode.dev,
      logger: core.logger.get('analytics'),
      getTraceContext: () => ({
        id: apm.currentTraceIds?.['trace.id'] ?? trace.getActiveSpan()?.spanContext().traceId,
      }),
    });

    this.registerBuildInfoAnalyticsContext(core);
    registerPerformanceMetricEventType(this.analyticsClient);
  }

  /**
   * Registers the observable that becomes the source of truth for the global opt-in status.
   * Each emission both feeds the consumer-facing `isOptedIn$` and drives the analytics client's
   * global consent.
   * @internal Only meant to be called by the platform-owned telemetry producer.
   */
  private registerOptInStatus$ = (isOptedIn$: Observable<boolean>): void => {
    // A new registration replaces any previous source of truth.
    this.optInStatusSubscription?.unsubscribe();
    this.optInStatusSubscription = isOptedIn$.subscribe((isOptedIn) => {
      this.analyticsClient.optIn({ global: { enabled: isOptedIn } });
      this.isOptedIn$.next(isOptedIn);
    });
  };

  public preboot(): AnalyticsServicePreboot {
    return {
      optIn: this.analyticsClient.optIn,
      registerContextProvider: this.analyticsClient.registerContextProvider,
      removeContextProvider: this.analyticsClient.removeContextProvider,
      registerEventType: this.analyticsClient.registerEventType,
      registerShipper: this.analyticsClient.registerShipper,
      reportEvent: this.analyticsClient.reportEvent,
      telemetryCounter$: this.analyticsClient.telemetryCounter$,
    };
  }

  public setup(): InternalAnalyticsServiceSetup {
    return {
      optIn: this.analyticsClient.optIn,
      registerContextProvider: this.analyticsClient.registerContextProvider,
      removeContextProvider: this.analyticsClient.removeContextProvider,
      registerEventType: this.analyticsClient.registerEventType,
      registerShipper: this.analyticsClient.registerShipper,
      reportEvent: this.analyticsClient.reportEvent,
      telemetryCounter$: this.analyticsClient.telemetryCounter$,
      registerOptInStatus$: this.registerOptInStatus$,
    };
  }

  public start(): AnalyticsServiceStart {
    return {
      optIn: this.analyticsClient.optIn,
      reportEvent: this.analyticsClient.reportEvent,
      telemetryCounter$: this.analyticsClient.telemetryCounter$,
      isOptedIn$: this.isOptedIn$.asObservable(),
    };
  }

  public async stop() {
    this.optInStatusSubscription?.unsubscribe();
    this.isOptedIn$.complete();
    await this.analyticsClient.shutdown();
  }

  /**
   * Enriches the event with the build information.
   * @param core The core context.
   * @internal
   */
  private registerBuildInfoAnalyticsContext(core: CoreContext) {
    this.analyticsClient.registerContextProvider({
      name: 'build info',
      context$: of({
        isDev: core.env.mode.dev,
        isDistributable: core.env.packageInfo.dist,
        version: core.env.packageInfo.version,
        branch: core.env.packageInfo.branch,
        buildNum: core.env.packageInfo.buildNum,
        buildSha: core.env.packageInfo.buildSha,
      }),
      schema: {
        isDev: {
          type: 'boolean',
          _meta: { description: 'Is it running in development mode?' },
        },
        isDistributable: {
          type: 'boolean',
          _meta: { description: 'Is it running from a distributable?' },
        },
        version: { type: 'keyword', _meta: { description: 'Version of the Kibana instance.' } },
        branch: {
          type: 'keyword',
          _meta: { description: 'Branch of source running Kibana from.' },
        },
        buildNum: { type: 'long', _meta: { description: 'Build number of the Kibana instance.' } },
        buildSha: { type: 'keyword', _meta: { description: 'Build SHA of the Kibana instance.' } },
      },
    });
  }
}
