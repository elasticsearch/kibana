/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  CoreSetup,
  CoreStart,
  Plugin,
  PluginInitializerContext,
  AppMountParameters,
  PackageInfo,
} from '@kbn/core/public';
import { from } from 'rxjs';
import { map } from 'rxjs';
import { i18n } from '@kbn/i18n';
import type { SharePluginSetup, SharePluginStart } from '@kbn/share-plugin/public';
import type { DiscoverStart } from '@kbn/discover-plugin/public';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core/public';

import type { HomePublicPluginSetup } from '@kbn/home-plugin/public';
import type {
  ExploratoryViewPublicSetup,
  ExploratoryViewPublicStart,
} from '@kbn/exploratory-view-plugin/public';
import type { EmbeddableStart, EmbeddableSetup } from '@kbn/embeddable-plugin/public';
import type {
  TriggersAndActionsUIPublicPluginSetup,
  TriggersAndActionsUIPublicPluginStart,
} from '@kbn/triggers-actions-ui-plugin/public';
import type { DataPublicPluginSetup, DataPublicPluginStart } from '@kbn/data-plugin/public';

import type { FleetStart } from '@kbn/fleet-plugin/public';
import type {
  ObservabilityPublicSetup,
  ObservabilityPublicStart,
} from '@kbn/observability-plugin/public';
import type { IStorageWrapper } from '@kbn/kibana-utils-plugin/public';
import type { Start as InspectorPluginStart } from '@kbn/inspector-plugin/public';
import type { CasesPublicStart } from '@kbn/cases-plugin/public';
import type { CloudSetup, CloudStart } from '@kbn/cloud-plugin/public';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import type { DocLinksStart } from '@kbn/core-doc-links-browser';
import type { UsageCollectionStart } from '@kbn/usage-collection-plugin/public';
import type {
  ObservabilitySharedPluginSetup,
  ObservabilitySharedPluginStart,
} from '@kbn/observability-shared-plugin/public';

import type { LicenseManagementUIPluginSetup } from '@kbn/license-management-plugin/public/plugin';
import type {
  ObservabilityAIAssistantPublicSetup,
  ObservabilityAIAssistantPublicStart,
} from '@kbn/observability-ai-assistant-plugin/public';
import type { ServerlessPluginSetup, ServerlessPluginStart } from '@kbn/serverless/public';
import type { UiActionsSetup, UiActionsStart } from '@kbn/ui-actions-plugin/public';
import type { PresentationUtilPluginStart } from '@kbn/presentation-util-plugin/public';
import type { DashboardStart } from '@kbn/dashboard-plugin/public';
import type { SLOPublicStart } from '@kbn/slo-plugin/public';
import type { ChartsPluginStart } from '@kbn/charts-plugin/public';
import type { FieldsMetadataPublicStart } from '@kbn/fields-metadata-plugin/public';
import type { FieldFormatsStart } from '@kbn/field-formats-plugin/public';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/public';
import type { SettingsStart } from '@kbn/core-ui-settings-browser';
import type { ContentManagementPublicStart } from '@kbn/content-management-plugin/public';
import type { KqlPluginStart } from '@kbn/kql/public';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-browser';
import { registerSyntheticsEmbeddables } from './apps/embeddables/register_embeddables';
import { kibanaService } from './utils/kibana_service';
import { PLUGIN } from '../common/constants/plugin';
import { OVERVIEW_ROUTE } from '../common/constants/ui';
import { locators } from './apps/locators';
import { syntheticsAlertTypeInitializers } from './apps/synthetics/lib/alert_types';
import { registerSyntheticsUiActions } from './apps/embeddables/ui_actions/register_ui_actions';

export interface ClientPluginsSetup {
  home?: HomePublicPluginSetup;
  data: DataPublicPluginSetup;
  exploratoryView: ExploratoryViewPublicSetup;
  observability: ObservabilityPublicSetup;
  observabilityShared: ObservabilitySharedPluginSetup;
  observabilityAIAssistant?: ObservabilityAIAssistantPublicSetup;
  share: SharePluginSetup;
  triggersActionsUi: TriggersAndActionsUIPublicPluginSetup;
  cloud?: CloudSetup;
  embeddable: EmbeddableSetup;
  serverless?: ServerlessPluginSetup;
  uiActions: UiActionsSetup;
}

export interface ClientPluginsStart {
  fleet: FleetStart;
  data: DataPublicPluginStart;
  kql: KqlPluginStart;
  unifiedSearch: UnifiedSearchPublicPluginStart;
  discover: DiscoverStart;
  inspector: InspectorPluginStart;
  contentManagement: ContentManagementPublicStart;
  embeddable: EmbeddableStart;
  exploratoryView: ExploratoryViewPublicStart;
  observability: ObservabilityPublicStart;
  observabilityShared: ObservabilitySharedPluginStart;
  observabilityAIAssistant?: ObservabilityAIAssistantPublicStart;
  share: SharePluginStart;
  triggersActionsUi: TriggersAndActionsUIPublicPluginStart;
  cases?: CasesPublicStart;
  dataViews: DataViewsPublicPluginStart;
  fieldFormats: FieldFormatsStart;
  spaces?: SpacesPluginStart;
  cloud?: CloudStart;
  appName: string;
  storage: IStorageWrapper;
  application: CoreStart['application'];
  notifications: CoreStart['notifications'];
  http: CoreStart['http'];
  docLinks: DocLinksStart;
  uiSettings: CoreStart['uiSettings'];
  usageCollection: UsageCollectionStart;
  serverless: ServerlessPluginStart;
  licenseManagement?: LicenseManagementUIPluginSetup;
  licensing: LicensingPluginStart;
  slo?: SLOPublicStart;
  presentationUtil: PresentationUtilPluginStart;
  dashboard: DashboardStart;
  charts: ChartsPluginStart;
  uiActions: UiActionsStart;
  fieldsMetadata: FieldsMetadataPublicStart;
  settings: SettingsStart;
  agentBuilder?: AgentBuilderPluginStart;
}

export interface SyntheticsPluginServices extends Partial<CoreStart> {
  embeddable: EmbeddableStart;
  data: DataPublicPluginStart;
  triggersActionsUi: TriggersAndActionsUIPublicPluginStart;
  storage: IStorageWrapper;
}

export type ClientSetup = void;
export type ClientStart = void;

export class SyntheticsPlugin
  implements Plugin<ClientSetup, ClientStart, ClientPluginsSetup, ClientPluginsStart>
{
  private readonly _packageInfo: Readonly<PackageInfo>;

  constructor(private readonly initContext: PluginInitializerContext) {
    this._packageInfo = initContext.env.packageInfo;
  }

  public setup(
    coreSetup: CoreSetup<ClientPluginsStart, unknown>,
    plugins: ClientPluginsSetup
  ): void {
    locators.forEach((locator) => {
      plugins.share.url.locators.create(locator);
    });

    registerSyntheticsRoutesWithNavigation(coreSetup, plugins);

    coreSetup.getStartServices().then(([coreStart, clientPluginsStart]) => {
      kibanaService.init({
        coreSetup,
        coreStart,
        startPlugins: clientPluginsStart,
        isDev: this.initContext.env.mode.dev,
        isServerless: this._isServerless,
        isCCSEnabled: !this._isServerless,
      });
    });

    const appKeywords = [
      'Synthetics',
      'availability',
      'browser',
      'checks',
      'digital',
      'reachability',
      'reachable',
      'response duration',
      'response time',
      'monitors',
      'outside in',
      'performance',
      'pings',
      'web performance',
      'web perf',
    ];

    // Register the Synthetics UI plugin
    coreSetup.application.register({
      id: 'synthetics',
      euiIconType: 'logoObservability',
      order: 8400,
      title: PLUGIN.SYNTHETICS,
      category: DEFAULT_APP_CATEGORIES.observability,
      keywords: appKeywords,
      deepLinks: [
        {
          id: 'overview',
          title: this._isServerless
            ? i18n.translate('xpack.synthetics.overviewPage.serverless.linkText', {
                defaultMessage: 'Overview',
              })
            : i18n.translate('xpack.synthetics.overviewPage.linkText', {
                defaultMessage: 'Monitors',
              }),
          path: '/',
          visibleIn: ['globalSearch', 'projectSideNav'],
        },
        {
          id: 'certificates',
          title: i18n.translate('xpack.synthetics.deepLink.certificatesPage.linkText', {
            defaultMessage: 'TLS Certificates',
          }),
          path: '/certificates',
          visibleIn: ['globalSearch', 'projectSideNav'],
        },
      ],
      mount: async (params: AppMountParameters) => {
        kibanaService.appMountParameters = params;
        const { renderApp } = await import('./apps/synthetics/render_app');
        await coreSetup.getStartServices();

        return renderApp(params);
      },
    });

    registerSyntheticsEmbeddables(coreSetup, plugins);
  }

  public start(coreStart: CoreStart, pluginsStart: ClientPluginsStart): void {
    const { triggersActionsUi } = pluginsStart;

    registerSyntheticsUiActions(coreStart, pluginsStart);

    syntheticsAlertTypeInitializers.forEach((init) => {
      const { observabilityRuleTypeRegistry } = pluginsStart.observability;

      const alertInitializer = init({
        core: coreStart,
        plugins: pluginsStart,
      });
      if (!triggersActionsUi.ruleTypeRegistry.has(alertInitializer.id)) {
        observabilityRuleTypeRegistry.register(alertInitializer);
      }
    });
  }

  public stop(): void {}

  private get _isServerless(): boolean {
    return this._packageInfo.buildFlavor === 'serverless';
  }
}

function registerSyntheticsRoutesWithNavigation(
  core: CoreSetup<ClientPluginsStart, unknown>,
  plugins: ClientPluginsSetup
) {
  plugins.observabilityShared.navigation.registerSections(
    from(core.getStartServices()).pipe(
      map(([coreStart]) => {
        if (coreStart.application.capabilities.uptime?.show) {
          return [
            {
              label: 'Synthetics',
              sortKey: 499,
              entries: [
                {
                  label: i18n.translate('xpack.synthetics.overview.SyntheticsHeading', {
                    defaultMessage: 'Monitors',
                  }),
                  app: 'synthetics',
                  path: OVERVIEW_ROUTE,
                  matchFullPath: true,
                  ignoreTrailingSlash: true,
                },
                {
                  label: i18n.translate('xpack.synthetics.certificatesPage.heading', {
                    defaultMessage: 'TLS Certificates',
                  }),
                  app: 'synthetics',
                  path: '/certificates',
                  matchFullPath: true,
                },
              ],
            },
          ];
        }

        return [];
      })
    )
  );
}
