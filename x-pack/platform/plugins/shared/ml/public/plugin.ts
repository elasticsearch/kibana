/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type {
  AppMountParameters,
  CoreSetup,
  CoreStart,
  Plugin,
  PluginInitializerContext,
} from '@kbn/core/public';
import { BehaviorSubject, mergeMap } from 'rxjs';
import { take } from 'rxjs';

import type { ObservabilityAIAssistantPublicStart } from '@kbn/observability-ai-assistant-plugin/public';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
import type { ManagementSetup } from '@kbn/management-plugin/public';
import type { LocatorPublic, SharePluginSetup, SharePluginStart } from '@kbn/share-plugin/public';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { HomePublicPluginSetup } from '@kbn/home-plugin/public';
import type { EmbeddableSetup, EmbeddableStart } from '@kbn/embeddable-plugin/public';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import type { LensPublicStart } from '@kbn/lens-plugin/public';

import { AppStatus, type AppUpdater, DEFAULT_APP_CATEGORIES } from '@kbn/core/public';
import type { UiActionsSetup, UiActionsStart } from '@kbn/ui-actions-plugin/public';

import type { LicenseManagementUIPluginSetup } from '@kbn/license-management-plugin/public';
import type { LicensingPluginSetup, LicensingPluginStart } from '@kbn/licensing-plugin/public';
import type { SecurityPluginStart } from '@kbn/security-plugin/public';
import type { SavedObjectsManagementPluginStart } from '@kbn/saved-objects-management-plugin/public';
import type { ContentManagementPublicStart } from '@kbn/content-management-plugin/public';

import type { MapsStartApi, MapsSetupApi } from '@kbn/maps-plugin/public';
import type {
  TriggersAndActionsUIPublicPluginSetup,
  TriggersAndActionsUIPublicPluginStart,
} from '@kbn/triggers-actions-ui-plugin/public';
import type { DataVisualizerPluginStart } from '@kbn/data-visualizer-plugin/public';
import type { PluginSetupContract as AlertingSetup } from '@kbn/alerting-plugin/public';
import type { UsageCollectionSetup } from '@kbn/usage-collection-plugin/public';
import type { FieldFormatsSetup } from '@kbn/field-formats-plugin/public';
import type { DashboardStart } from '@kbn/dashboard-plugin/public';
import type { ChartsPluginStart } from '@kbn/charts-plugin/public';
import type { CasesPublicSetup, CasesPublicStart } from '@kbn/cases-plugin/public';
import type { SavedSearchPublicPluginStart } from '@kbn/saved-search-plugin/public';
import type { DataViewEditorStart } from '@kbn/data-view-editor-plugin/public';
import type { DataViewFieldEditorStart } from '@kbn/data-view-field-editor-plugin/public';
import type { FieldFormatsRegistry } from '@kbn/field-formats-plugin/common';
import { ENABLE_ESQL } from '@kbn/esql-utils';
import type { FieldsMetadataPublicStart } from '@kbn/fields-metadata-plugin/public';
import type { MlCapabilities } from '@kbn/ml-common-types/capabilities';
import type { FileUploadPluginStart } from '@kbn/file-upload-plugin/public';
import type { KqlPluginStart } from '@kbn/kql/public';
import type { CPSPluginSetup, CPSPluginStart } from '@kbn/cps/public/types';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-browser';
import { ProjectRoutingAccess } from '@kbn/cps-utils/types';
import type { MlSharedServices } from './application/services/get_shared_ml_services';
import { getMlSharedServices } from './application/services/get_shared_ml_services';
import { registerManagementSections } from './application/management';
import type { MlLocatorParams } from './locator';
import { MlLocatorDefinition, type MlLocator } from './locator';
import { registerHomeFeature } from './register_home_feature';
import { isFullLicense, isMlEnabled } from '../common/license';
import {
  initEnabledFeatures,
  type MlFeatures,
  ML_APP_ROUTE,
  PLUGIN_ICON_SOLUTION,
  PLUGIN_ID,
  type ConfigSchema,
  type ExperimentalFeatures,
  initExperimentalFeatures,
  initModelDeploymentSettings,
  type NLPSettings,
} from '../common/constants/app';
import type { ElasticModels } from './application/services/elastic_models_service';
import type { MlApi } from './application/services/ml_api_service';
import { AnomalySwimLane } from './shared_components';
import { MlManagementLocatorInternal } from './locator/ml_management_locator';
import { TelemetryService } from './application/services/telemetry/telemetry_service';
import type { ITelemetryClient } from './application/services/telemetry/types';
import { registerEmbeddables } from './embeddables';
import { registerMlUiActions } from './ui_actions';

export interface MlStartDependencies {
  agentBuilder?: AgentBuilderPluginStart;
  cases?: CasesPublicStart;
  charts: ChartsPluginStart;
  contentManagement: ContentManagementPublicStart;
  dashboard: DashboardStart;
  data: DataPublicPluginStart;
  dataViewEditor: DataViewEditorStart;
  dataViewFieldEditor: DataViewFieldEditorStart;
  dataVisualizer: DataVisualizerPluginStart;
  embeddable: EmbeddableStart;
  fieldFormats: FieldFormatsRegistry;
  lens: LensPublicStart;
  licensing: LicensingPluginStart;
  maps?: MapsStartApi;
  observabilityAIAssistant?: ObservabilityAIAssistantPublicStart;
  savedObjectsManagement: SavedObjectsManagementPluginStart;
  savedSearch: SavedSearchPublicPluginStart;
  security: SecurityPluginStart;
  share: SharePluginStart;
  spaces?: SpacesPluginStart;
  triggersActionsUi?: TriggersAndActionsUIPublicPluginStart;
  uiActions: UiActionsStart;
  unifiedSearch: UnifiedSearchPublicPluginStart;
  kql: KqlPluginStart;
  telemetry: ITelemetryClient;
  fieldsMetadata: FieldsMetadataPublicStart;
  fileUpload: FileUploadPluginStart;
  cps: CPSPluginStart;
}

export interface MlSetupDependencies {
  alerting?: AlertingSetup;
  cases?: CasesPublicSetup;
  embeddable: EmbeddableSetup;
  fieldFormats: FieldFormatsSetup;
  home?: HomePublicPluginSetup;
  kibanaVersion: string;
  licenseManagement?: LicenseManagementUIPluginSetup;
  licensing: LicensingPluginSetup;
  management?: ManagementSetup;
  maps?: MapsSetupApi;
  share: SharePluginSetup;
  triggersActionsUi?: TriggersAndActionsUIPublicPluginSetup;
  uiActions: UiActionsSetup;
  usageCollection?: UsageCollectionSetup;
  cps: CPSPluginSetup;
}

export type MlCoreSetup = CoreSetup<MlStartDependencies, MlPluginStart>;

export class MlPlugin implements Plugin<MlPluginSetup, MlPluginStart> {
  private appUpdater$ = new BehaviorSubject<AppUpdater>(() => ({}));

  private locator: undefined | MlLocator;

  private managementLocator: undefined | MlManagementLocatorInternal;

  private sharedMlServices: MlSharedServices | undefined;

  private isServerless: boolean = false;
  private enabledFeatures: MlFeatures = {
    ad: true,
    dfa: true,
    nlp: true,
  };
  private experimentalFeatures: ExperimentalFeatures = {
    ruleFormV2: false,
  };
  private nlpSettings: NLPSettings = {};

  private telemetry = new TelemetryService();

  constructor(private initializerContext: PluginInitializerContext<ConfigSchema>) {
    this.isServerless = initializerContext.env.packageInfo.buildFlavor === 'serverless';
    initEnabledFeatures(this.enabledFeatures, initializerContext.config.get());
    initExperimentalFeatures(this.experimentalFeatures, initializerContext.config.get());
    initModelDeploymentSettings(this.nlpSettings, initializerContext.config.get());
  }

  setup(
    core: MlCoreSetup,
    pluginsSetup: MlSetupDependencies
  ): {
    locator?: LocatorPublic<MlLocatorParams>;
    managementLocator?: MlManagementLocatorInternal;
    elasticModels?: ElasticModels;
  } {
    this.sharedMlServices = getMlSharedServices(core.http);
    const deps = {
      home: pluginsSetup.home,
      licenseManagement: pluginsSetup.licenseManagement,
      management: pluginsSetup.management,
      usageCollection: pluginsSetup.usageCollection,
    };

    this.telemetry.setup({ analytics: core.analytics });

    const telemetryClient = this.telemetry.start();

    core.application.register({
      id: PLUGIN_ID,
      title: i18n.translate('xpack.ml.plugin.title', {
        defaultMessage: 'Machine Learning',
      }),
      order: 5000,
      euiIconType: PLUGIN_ICON_SOLUTION,
      appRoute: ML_APP_ROUTE,
      category: DEFAULT_APP_CATEGORIES.kibana,
      updater$: this.appUpdater$,
      mount: async (params: AppMountParameters) => {
        const [coreStart, pluginsStart] = await core.getStartServices();
        const { renderApp } = await import('./application/app');
        return renderApp(
          coreStart,
          {
            cases: pluginsStart.cases,
            charts: pluginsStart.charts,
            contentManagement: pluginsStart.contentManagement,
            dashboard: pluginsStart.dashboard,
            data: pluginsStart.data,
            dataViewEditor: pluginsStart.dataViewEditor,
            dataViewFieldEditor: pluginsStart.dataViewFieldEditor,
            dataVisualizer: pluginsStart.dataVisualizer,
            embeddable: { ...pluginsSetup.embeddable, ...pluginsStart.embeddable },
            fieldFormats: pluginsStart.fieldFormats,
            kibanaVersion: this.initializerContext.env.packageInfo.version,
            lens: pluginsStart.lens,
            licensing: pluginsStart.licensing,
            maps: pluginsStart.maps,
            observabilityAIAssistant: pluginsStart.observabilityAIAssistant,
            savedObjectsManagement: pluginsStart.savedObjectsManagement,
            savedSearch: pluginsStart.savedSearch,
            security: pluginsStart.security,
            share: pluginsStart.share,
            triggersActionsUi: pluginsStart.triggersActionsUi,
            uiActions: pluginsStart.uiActions,
            unifiedSearch: pluginsStart.unifiedSearch,
            telemetry: telemetryClient,
            fieldsMetadata: pluginsStart.fieldsMetadata,
            fileUpload: pluginsStart.fileUpload,
            kql: pluginsStart.kql,
            cps: pluginsStart.cps,
            ...deps,
          },
          params,
          this.isServerless,
          pluginsSetup.cps?.cpsEnabled ?? false,
          this.enabledFeatures,
          this.experimentalFeatures,
          this.nlpSettings
        );
      },
    });

    if (pluginsSetup.share) {
      this.locator = pluginsSetup.share.url.locators.create(new MlLocatorDefinition());
      this.managementLocator = new MlManagementLocatorInternal(pluginsSetup.share);
    }

    if (this.enabledFeatures.ad) {
      registerEmbeddables(pluginsSetup.embeddable, core, pluginsSetup.usageCollection);
    }
    registerMlUiActions(pluginsSetup.uiActions, core);

    const licensing = pluginsSetup.licensing.license$.pipe(take(1));
    licensing
      .pipe(
        mergeMap(async (license) => {
          const mlEnabled = isMlEnabled(license);
          const fullLicense = isFullLicense(license);
          const [coreStart, pluginStart] = await core.getStartServices();
          const { capabilities } = coreStart.application;
          const mlCapabilities = capabilities.ml as MlCapabilities;

          const isEsqlEnabled = core.uiSettings.get(ENABLE_ESQL);

          // register various ML plugin features which require a full license
          // note including registerHomeFeature in register_helper would cause the page bundle size to increase significantly
          if (mlEnabled) {
            // add ML to home page
            if (pluginsSetup.home) {
              registerHomeFeature(pluginsSetup.home);
            }

            if (pluginsSetup.management && fullLicense && mlCapabilities.canGetMlInfo) {
              registerManagementSections(
                pluginsSetup.management,
                core,
                { telemetry: telemetryClient, ...deps },
                this.isServerless,
                pluginsSetup.cps?.cpsEnabled ?? false,
                this.enabledFeatures,
                this.nlpSettings,
                this.experimentalFeatures,
                mlCapabilities
              );
            }

            const { registerSearchLinks, registerCasesAttachments } = await import(
              './register_helper'
            );
            registerSearchLinks(
              this.appUpdater$,
              fullLicense,
              mlCapabilities,
              this.isServerless,
              isEsqlEnabled
            );

            if (
              pluginsSetup.triggersActionsUi &&
              ((fullLicense && mlCapabilities.canUseMlAlerts && mlCapabilities.canGetJobs) ||
                // Register rules for basic license to show them in the UI as disabled
                !fullLicense)
            ) {
              // This module contains async imports itself, and it is conditionally loaded based on the license. We'll save
              // traffic if we load it async.
              const { registerMlAlerts } = await import('./alerting/register_ml_alerts');

              registerMlAlerts(
                pluginsSetup.triggersActionsUi,
                core.getStartServices,
                mlCapabilities,
                pluginsSetup.alerting
              );
            }

            if (fullLicense && mlCapabilities.canGetMlInfo) {
              if (this.enabledFeatures.ad) {
                if (pluginsSetup.cases) {
                  registerCasesAttachments(
                    pluginsSetup.cases,
                    coreStart,
                    pluginStart,
                    pluginsSetup.usageCollection
                  );
                }

                if (pluginStart.agentBuilder) {
                  const { registerAgentBuilderAttachments } = await import(
                    './agent_builder/register_agent_builder_attachments'
                  );
                  registerAgentBuilderAttachments(pluginStart.agentBuilder, {
                    application: coreStart.application,
                    unifiedSearch: pluginStart.unifiedSearch,
                    embeddable: pluginStart.embeddable,
                    locator: this.locator,
                  });
                }

                pluginStart.cps?.cpsManager?.registerAppAccess('ml', (location: string) =>
                  location.includes('ml/aiops') ||
                  location.includes('ml/jobs/new_job/datavisualizer') ||
                  location.includes('ml/datavisualizer/esql') ||
                  location.includes('ml/data_drift')
                    ? ProjectRoutingAccess.EDITABLE
                    : ProjectRoutingAccess.DISABLED
                );

                if (pluginsSetup.maps) {
                  // This module contains async imports itself, and it is conditionally loaded if maps is enabled. We'll save
                  // traffic if we load it async.
                  const { registerMapExtension } = await import('./maps/register_map_extension');

                  // Pass canGetJobs as minimum permission to show anomalies card in maps layers
                  await registerMapExtension(pluginsSetup.maps, core, {
                    canGetJobs: mlCapabilities.canGetJobs,
                    canCreateJobs: mlCapabilities.canCreateJob,
                  });
                }
              }
            }
          } else {
            // if ml is disabled in elasticsearch, disable ML in kibana
            this.appUpdater$.next(() => ({
              status: AppStatus.inaccessible,
            }));
          }
        })
      )
      .subscribe();

    return {
      locator: this.locator,
      managementLocator: this.managementLocator,
      elasticModels: this.sharedMlServices.elasticModels,
    };
  }

  start(
    core: CoreStart,
    deps: MlStartDependencies
  ): {
    locator?: LocatorPublic<MlLocatorParams>;
    managementLocator?: MlManagementLocatorInternal;
    elasticModels?: ElasticModels;
    mlApi?: MlApi;
    components: { AnomalySwimLane: typeof AnomalySwimLane };
  } {
    return {
      locator: this.locator,
      managementLocator: this.managementLocator,
      elasticModels: this.sharedMlServices?.elasticModels,
      mlApi: this.sharedMlServices?.mlApi,
      components: {
        AnomalySwimLane,
      },
    };
  }

  public stop() {}
}

export type MlPluginSetup = ReturnType<MlPlugin['setup']>;
export type MlPluginStart = ReturnType<MlPlugin['start']>;
