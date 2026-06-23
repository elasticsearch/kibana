/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AppMountParameters, AppUpdater } from '@kbn/core/public';
import {
  APP_WRAPPER_CLASS,
  DEFAULT_APP_CATEGORIES,
  type CoreSetup,
  type CoreStart,
  type Plugin,
  type PluginInitializerContext,
} from '@kbn/core/public';
import type { Logger } from '@kbn/logging';
import { significantEventsDeepLinkIds, type SigEventsLinkId } from '@kbn/deeplinks-observability';
import { OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS_DISCOVERY } from '@kbn/management-settings-ids';
import { DataStreamsStatsService } from '@kbn/dataset-quality-plugin/public';
import { dynamic } from '@kbn/shared-ux-utility';
import React from 'react';
import { i18n } from '@kbn/i18n';
import { combineLatest, from, map, switchMap } from 'rxjs';
import { css } from '@emotion/css';
import ReactDOM from 'react-dom';
import type {
  ConfigSchema,
  StreamsAppPublicSetup,
  StreamsAppPublicStart,
  StreamsAppSetupDependencies,
  StreamsAppStartDependencies,
} from './types';
import type { StreamsAppServices } from './services/types';
import {
  createDiscoverFlyoutStreamFieldByStreamNameLink,
  createDiscoverFlyoutStreamFieldLink,
  createDiscoverFlyoutStreamProcessingLink,
} from './discover_features';
import { StreamsTelemetryService } from './telemetry/service';
import { registerSignificantEventAttachment } from './components/sig_events/significant_event_attachment/significant_event_attachment';
import { FocusedSignificantEventService } from './services/significant_events/focused_significant_event_service';
import { StreamsAppLocatorDefinition } from '../common/locators';

const StreamsApplication = dynamic(() =>
  import('./application').then((mod) => ({ default: mod.StreamsApplication }))
);

export const renderApp = ({
  appMountParameters,
  services,
  coreStart,
  pluginsStart,
  isServerless,
}: {
  appMountParameters: AppMountParameters;
  services: StreamsAppServices;
  coreStart: CoreStart;
  pluginsStart: StreamsAppStartDependencies;
  isServerless: boolean;
}) => {
  const { element } = appMountParameters;

  const appWrapperClassName = css`
    overflow: auto;
  `;
  const appWrapperElement = document.getElementsByClassName(APP_WRAPPER_CLASS)[1];
  appWrapperElement.classList.add(appWrapperClassName);

  ReactDOM.render(
    <StreamsApplication
      coreStart={coreStart}
      pluginsStart={pluginsStart}
      services={services}
      isServerless={isServerless}
      appMountParameters={appMountParameters}
    />,
    element
  );
  return () => {
    ReactDOM.unmountComponentAtNode(element);
    appWrapperElement.classList.remove(APP_WRAPPER_CLASS);
  };
};

export class StreamsAppPlugin
  implements
    Plugin<
      StreamsAppPublicSetup,
      StreamsAppPublicStart,
      StreamsAppSetupDependencies,
      StreamsAppStartDependencies
    >
{
  logger: Logger;
  telemetry: StreamsTelemetryService = new StreamsTelemetryService();
  private readonly focusedSignificantEventService = new FocusedSignificantEventService();
  private cleanupSignificantEventAttachment?: () => void;

  private readonly version: string;

  constructor(private readonly context: PluginInitializerContext<ConfigSchema>) {
    this.logger = context.logger.get();
    this.version = context.env.packageInfo.version;
  }
  setup(coreSetup: CoreSetup<StreamsAppStartDependencies>): StreamsAppPublicSetup {
    this.telemetry.setup(coreSetup.analytics);
    const startServicesPromise = coreSetup.getStartServices();

    coreSetup.application.register({
      id: 'streams',
      title: i18n.translate('xpack.streams.appTitle', {
        defaultMessage: 'Streams',
      }),
      euiIconType: 'logoElastic',
      appRoute: '/app/streams',
      category: DEFAULT_APP_CATEGORIES.management,
      order: 10000,
      deepLinks: [
        {
          id: 'significantEventsDiscovery' satisfies SigEventsLinkId,
          title: i18n.translate('xpack.streams.significantEventsDiscovery.deepLinkTitle', {
            defaultMessage: 'Significant Events',
          }),
          path: '/_discovery',
          visibleIn: [],
          keywords: ['significant events', 'sig events', 'discovery'],
        },
        {
          id: 'significantEventsKnowledgeIndicators' satisfies SigEventsLinkId,
          title: i18n.translate('xpack.streams.significantEventsDiscovery.kiDeepLinkTitle', {
            defaultMessage: 'Significant Events / KIs',
          }),
          path: '/_discovery/knowledge_indicators',
          visibleIn: [],
          keywords: [
            'knowledge indicators',
            'ki',
            'kis',
            'significant events',
            'sig events',
            'sig events kis',
          ],
        },
        {
          id: 'significantEventsEvents' satisfies SigEventsLinkId,
          title: i18n.translate('xpack.streams.significantEventsDiscovery.eventsDeepLinkTitle', {
            defaultMessage: 'Significant Events / Events',
          }),
          path: '/_discovery/significant_events',
          visibleIn: [],
          keywords: ['events', 'significant events', 'sig events', 'sig events events'],
        },
        {
          id: 'significantEventsRules' satisfies SigEventsLinkId,
          title: i18n.translate('xpack.streams.significantEventsDiscovery.rulesDeepLinkTitle', {
            defaultMessage: 'Significant Events / Rules',
          }),
          path: '/_discovery/queries',
          visibleIn: [],
          keywords: ['rules', 'queries', 'significant events', 'sig events', 'sig events rules'],
        },
      ],
      updater$: from(startServicesPromise).pipe(
        switchMap(([coreStart, pluginsStart]) =>
          combineLatest([
            pluginsStart.streams.navigationStatus$,
            coreStart.uiSettings.get$(OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS_DISCOVERY),
          ]).pipe(
            map(([{ status }, isSignificantEventsDiscoveryEnabled]): AppUpdater => {
              return (app) => {
                if (status !== 'enabled') {
                  return {
                    visibleIn: [],
                    deepLinks: (app.deepLinks ?? []).map((link) => ({ ...link, visibleIn: [] })),
                  };
                }

                return {
                  visibleIn: ['classicSideNav', 'projectSideNav', 'globalSearch'],
                  deepLinks: (app.deepLinks ?? []).map((link) => {
                    if (significantEventsDeepLinkIds.includes(link.id as SigEventsLinkId)) {
                      return {
                        ...link,
                        visibleIn: isSignificantEventsDiscoveryEnabled ? ['globalSearch'] : [],
                      };
                    }

                    return link;
                  }),
                };
              };
            })
          )
        )
      ),
      mount: async (appMountParameters: AppMountParameters<unknown>) => {
        // Load application bundle and Get start services
        const [coreStart, pluginsStart] = await coreSetup.getStartServices();

        const services: StreamsAppServices = {
          dataStreamsClient: new DataStreamsStatsService()
            .start({ http: coreStart.http })
            .getClient(),
          focusedSignificantEventService: this.focusedSignificantEventService,
          telemetryClient: this.telemetry.getClient(),
          version: this.version,
        };

        // Trigger fetch to ensure the time filter has an up-to-date time range when the app mounts.
        // This is done to ensure that dynamic time ranges (like "Last 15 minutes") are applied like they
        // would be in discover or dashboards.
        pluginsStart.data.query.timefilter.timefilter.triggerFetch();

        return renderApp({
          appMountParameters,
          services,
          coreStart,
          pluginsStart,
          isServerless: this.context.env.packageInfo.buildFlavor === 'serverless',
        });
      },
    });

    return {};
  }

  start(coreStart: CoreStart, pluginsStart: StreamsAppStartDependencies): StreamsAppPublicStart {
    if (pluginsStart.agentBuilder) {
      this.cleanupSignificantEventAttachment = registerSignificantEventAttachment({
        agentBuilder: pluginsStart.agentBuilder,
        chrome: coreStart.chrome,
        focusedSignificantEventService: this.focusedSignificantEventService,
      });
    }

    const locator = pluginsStart.share.url.locators.create(new StreamsAppLocatorDefinition());
    pluginsStart.streams.navigationStatus$.subscribe((status) => {
      if (status.status !== 'enabled') return;
      const isServerless = this.context.env.packageInfo.buildFlavor === 'serverless';
      pluginsStart.discoverShared.features.registry.register({
        id: 'streams',
        renderFlyoutStreamField: createDiscoverFlyoutStreamFieldLink({
          streamsRepositoryClient: pluginsStart.streams.streamsRepositoryClient,
          locator,
          http: coreStart.http,
          isServerless,
        }),
        renderFlyoutStreamFieldByStreamName: createDiscoverFlyoutStreamFieldByStreamNameLink({
          streamsRepositoryClient: pluginsStart.streams.streamsRepositoryClient,
          locator,
        }),
        renderFlyoutStreamProcessingLink: createDiscoverFlyoutStreamProcessingLink({
          fieldFormats: pluginsStart.fieldFormats,
          streamsRepositoryClient: pluginsStart.streams.streamsRepositoryClient,
          locator,
          http: coreStart.http,
          isServerless,
        }),
      });
    });

    return {};
  }

  stop() {
    this.cleanupSignificantEventAttachment?.();
  }
}
