/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Observable } from 'rxjs';

import type { AppLeaveHandler, AppMountParameters, CoreStart } from '@kbn/core/public';
import type { NavigationTreeDefinition } from '@kbn/core-chrome-browser';
import type { HomePublicPluginSetup } from '@kbn/home-plugin/public';
import type { DataPublicPluginSetup, DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { FieldFormatsStartCommon } from '@kbn/field-formats-plugin/common';
import type { EmbeddableStart } from '@kbn/embeddable-plugin/public';
import type { LensPublicStart } from '@kbn/lens-plugin/public';
import type { NewsfeedPublicPluginStart } from '@kbn/newsfeed-plugin/public';
import type { Start as InspectorStart } from '@kbn/inspector-plugin/public';
import type { UiActionsStart } from '@kbn/ui-actions-plugin/public';
import type { UsageCollectionSetup } from '@kbn/usage-collection-plugin/public';
import type { Storage } from '@kbn/kibana-utils-plugin/public';
import type { FleetStart } from '@kbn/fleet-plugin/public';
import type { PluginStart as ListsPluginStart } from '@kbn/lists-plugin/public';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import type { ProductDocBasePluginStart } from '@kbn/product-doc-base-plugin/public';
import type {
  TriggersAndActionsUIPublicPluginSetup as TriggersActionsSetup,
  TriggersAndActionsUIPublicPluginStart as TriggersActionsStart,
} from '@kbn/triggers-actions-ui-plugin/public';
import type { CasesPublicSetup, CasesPublicStart } from '@kbn/cases-plugin/public';
import type { SecurityPluginSetup, SecurityPluginStart } from '@kbn/security-plugin/public';
import type { TimelinesUIStart } from '@kbn/timelines-plugin/public';
import type { SessionViewStart } from '@kbn/session-view-plugin/public';
import type { KubernetesSecurityStart } from '@kbn/kubernetes-security-plugin/public';
import type { MlPluginSetup, MlPluginStart } from '@kbn/ml-plugin/public';
import type { OsqueryPluginStart } from '@kbn/osquery-plugin/public';
import type { LicensingPluginSetup, LicensingPluginStart } from '@kbn/licensing-plugin/public';
import type { DashboardStart } from '@kbn/dashboard-plugin/public';
import type { IndexPatternFieldEditorStart } from '@kbn/data-view-field-editor-plugin/public';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
import type { CloudSetup, CloudStart } from '@kbn/cloud-plugin/public';
import type { CloudDefendPluginStart } from '@kbn/cloud-defend-plugin/public';
import type { CspClientPluginStart } from '@kbn/cloud-security-posture-plugin/public';
import type { ApmBase } from '@elastic/apm-rum';
import type {
  SavedObjectsTaggingApi,
  SavedObjectTaggingOssPluginStart,
} from '@kbn/saved-objects-tagging-oss-plugin/public';
import type { DataViewsServicePublic } from '@kbn/data-views-plugin/public';
import type { ContentManagementPublicStart } from '@kbn/content-management-plugin/public';
import type { ExpressionsStart } from '@kbn/expressions-plugin/public';

import type { DiscoverStart } from '@kbn/discover-plugin/public';
import type { ManagementSetup } from '@kbn/management-plugin/public';
import type { NavigationPublicPluginStart } from '@kbn/navigation-plugin/public';
import type { DataViewEditorStart } from '@kbn/data-view-editor-plugin/public';
import type { UpsellingService } from '@kbn/security-solution-upselling/service';
import type { ChartsPluginStart } from '@kbn/charts-plugin/public';
import type { SavedSearchPublicPluginStart } from '@kbn/saved-search-plugin/public';
import type { PluginStartContract } from '@kbn/alerting-plugin/public/plugin';
import type { MapsStartApi } from '@kbn/maps-plugin/public';
import type { ServerlessPluginStart } from '@kbn/serverless/public';
import type { DiscoverSharedPublicStart } from '@kbn/discover-shared-plugin/public';
import type { AutomaticImportPluginStart } from '@kbn/automatic-import-plugin/public';
import type { ProductFeatureKeys, ProductFeatureKeyType } from '@kbn/security-solution-features';
import type { ElasticAssistantSharedStatePublicPluginStart } from '@kbn/elastic-assistant-shared-state-plugin/public';
import type { InferencePublicStart } from '@kbn/inference-plugin/public';
import type { SharePluginSetup, SharePluginStart } from '@kbn/share-plugin/public';
import type { KqlPluginStart } from '@kbn/kql/public';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-browser';
import type { Logger } from '@kbn/logging';
import type { CPSPluginStart } from '@kbn/cps/public';
import type { WorkflowsExtensionsPublicPluginSetup } from '@kbn/workflows-extensions/public';
import type { EvalsPublicStart } from '@kbn/evals-plugin/public';
import type { ResolverPluginSetup } from './resolver/types';
import type { Inspect } from '../common/search_strategy';
import type { Detections } from './detections';
import type { Cases } from './cases';
import type { Exceptions } from './exceptions';
import type { Kubernetes } from './kubernetes';
import type { Onboarding } from './onboarding';
import type { Overview } from './overview';
import type { Reports } from './reports';
import type { Rules } from './rules';
import type { Timelines } from './timelines';
import type { Management } from './management';
import type { CloudSecurityPosture } from './cloud_security_posture';
import type { CloudDefend } from './cloud_defend';
import type { ThreatIntelligence } from './threat_intelligence';
import type { SecuritySolutionTemplateWrapper } from './app/home/template_wrapper';
import type { AlertsV2 } from './alerts_v2';
import type { RulesV2 } from './rules_v2';
import type { AssetInventory } from './asset_inventory';
import type { SiemReadiness } from './siem_readiness';
import type { AttackDiscovery } from './attack_discovery';
import type { Explore } from './explore';
import type { EntityAnalytics } from './entity_analytics';
import type { SiemMigrations } from './siem_migrations';
import type { Configurations } from './configurations';

import type { Dashboards } from './dashboards';
import type { BreadcrumbsNav } from './common/breadcrumbs/types';
import type { TopValuesPopoverService } from './app/components/top_values_popover/top_values_popover_service';
import type { ExperimentalFeatures } from '../common/experimental_features';
import type { GetComponents$, SetComponents } from './contract_components';
import type { ConfigSettings } from '../common/config_settings';
import type { SecuritySolutionUiConfigType } from './common/types';
import type { OnboardingService } from './onboarding/service';
import type { TelemetryServiceStart } from './common/lib/telemetry';
import type { SiemMigrationsService } from './siem_migrations/service';
import type { AiRuleCreationService } from './detection_engine/common/ai_rule_creation_store';

export interface SetupPlugins {
  cloud?: CloudSetup;
  home?: HomePublicPluginSetup;
  share?: SharePluginSetup;
  licensing: LicensingPluginSetup;
  management: ManagementSetup;
  security: SecurityPluginSetup;
  triggersActionsUi: TriggersActionsSetup;
  usageCollection?: UsageCollectionSetup;
  ml?: MlPluginSetup;
  cases?: CasesPublicSetup;
  data: DataPublicPluginSetup;
  discoverShared: DiscoverSharedPublicStart;
  workflowsExtensions?: WorkflowsExtensionsPublicPluginSetup;
}

/**
 * IMPORTANT - PLEASE READ: When adding new plugins to the
 * security solution, please ensure you add that plugin
 * name to the kibana.jsonc file located in ../kibana.jsonc
 *
 * Without adding the plugin name there, the plugin will not
 * fulfill at runtime, despite the types showing up correctly
 * in the code.
 */
export interface StartPlugins {
  cases: CasesPublicStart;
  data: DataPublicPluginStart;
  unifiedSearch: UnifiedSearchPublicPluginStart;
  kql: KqlPluginStart;
  dashboard?: DashboardStart;
  embeddable: EmbeddableStart;
  inspector: InspectorStart;
  fleet?: FleetStart;
  kubernetesSecurity: KubernetesSecurityStart;
  lens: LensPublicStart;
  lists?: ListsPluginStart;
  licensing: LicensingPluginStart;
  newsfeed?: NewsfeedPublicPluginStart;
  triggersActionsUi: TriggersActionsStart;
  timelines: TimelinesUIStart;
  sessionView: SessionViewStart;
  uiActions: UiActionsStart;
  maps: MapsStartApi;
  ml?: MlPluginStart;
  spaces: SpacesPluginStart;
  dataViewFieldEditor: IndexPatternFieldEditorStart;
  osquery: OsqueryPluginStart;
  security: SecurityPluginStart;
  cloud?: CloudStart;
  cloudDefend: CloudDefendPluginStart;
  cloudSecurityPosture: CspClientPluginStart;
  dataViews: DataViewsServicePublic;
  fieldFormats: FieldFormatsStartCommon;
  discover: DiscoverStart;
  navigation: NavigationPublicPluginStart;
  expressions: ExpressionsStart;
  dataViewEditor: DataViewEditorStart;
  charts: ChartsPluginStart;
  savedSearch: SavedSearchPublicPluginStart;
  alerting: PluginStartContract;
  core: CoreStart;
  automaticImport?: AutomaticImportPluginStart;
  serverless?: ServerlessPluginStart;
  productDocBase: ProductDocBasePluginStart;
  elasticAssistantSharedState: ElasticAssistantSharedStatePublicPluginStart;
  inference: InferencePublicStart;
  share?: SharePluginStart;
  agentBuilder?: AgentBuilderPluginStart;
  cps?: CPSPluginStart;
  evals?: EvalsPublicStart;
}

export interface StartPluginsDependencies extends StartPlugins {
  contentManagement: ContentManagementPublicStart;
  savedObjectsTaggingOss: SavedObjectTaggingOssPluginStart;
}

export interface ContractStartServices {
  getComponents$: GetComponents$;
  upselling: UpsellingService;
  onboarding: OnboardingService;
  productFeatureKeys$: Observable<Set<ProductFeatureKeyType> | null>;
}

export type StartServices = CoreStart &
  StartPlugins &
  ContractStartServices & {
    config: SecuritySolutionUiConfigType;
    configSettings: ConfigSettings;
    storage: Storage;
    sessionStorage: Storage;
    apm: ApmBase;
    savedObjectsTagging?: SavedObjectsTaggingApi;
    setHeaderActionMenu?: AppMountParameters['setHeaderActionMenu'];
    onAppLeave?: (handler: AppLeaveHandler) => void;

    /**
     * This component will be exposed to all lazy loaded plugins, via useKibana hook. It should wrap every plugin route.
     * The goal is to allow page property customization (such as `template`).
     */
    securityLayout: {
      getPluginWrapper: () => typeof SecuritySolutionTemplateWrapper;
    };
    contentManagement: ContentManagementPublicStart;
    telemetry: TelemetryServiceStart;
    customDataService: DataPublicPluginStart;
    topValuesPopover: TopValuesPopoverService;
    timelineDataService: DataPublicPluginStart;
    siemMigrations: SiemMigrationsService;
    productDocBase: ProductDocBasePluginStart;
    logger: Logger;
    aiRuleCreation: AiRuleCreationService;
  };

export type StartRenderServices = Pick<
  CoreStart,
  // Used extensively in rendering Security Solution UI
  | 'notifications'
  // Needed for rendering Shared React modules
  | 'analytics'
  | 'i18n'
  | 'theme'
>;

export interface PluginSetup {
  resolver: () => Promise<ResolverPluginSetup>;
  experimentalFeatures: ExperimentalFeatures;
  setProductFeatureKeys: (productFeatureKeys: ProductFeatureKeys) => void;
}

export interface PluginStart {
  setComponents: SetComponents;
  getBreadcrumbsNav$: () => Observable<BreadcrumbsNav>;
  getUpselling: () => UpsellingService;
  setOnboardingSettings: OnboardingService['setSettings'];
  setSolutionNavigationTree: (navigationTree: NavigationTreeDefinition | null) => void;
}

export type InspectResponse = Inspect & {
  response: string[];
  /** Index pattern(s) for the Inspect Statistics tab (e.g. entity store queries). */
  indexPattern?: string[];
};

export const CASES_SUB_PLUGIN_KEY = 'cases';

export interface SubPlugins {
  [CASES_SUB_PLUGIN_KEY]: Cases;
  alerts: Detections;
  alertsV2: AlertsV2;
  rulesV2: RulesV2;
  assetInventory: AssetInventory;
  attackDiscovery: AttackDiscovery;
  cloudDefend: CloudDefend;
  cloudSecurityPosture: CloudSecurityPosture;
  dashboards: Dashboards;
  exceptions: Exceptions;
  explore: Explore;
  kubernetes: Kubernetes;
  management: Management;
  onboarding: Onboarding;
  overview: Overview;
  reports: Reports;
  rules: Rules;
  threatIntelligence: ThreatIntelligence;
  timelines: Timelines;
  entityAnalytics: EntityAnalytics;
  siemMigrations: SiemMigrations;
  siemReadiness: SiemReadiness;
  configurations: Configurations;
}

// TODO: find a better way to defined these types
export interface StartedSubPlugins {
  [CASES_SUB_PLUGIN_KEY]: ReturnType<Cases['start']>;
  alerts: Awaited<ReturnType<Detections['start']>>;
  alertsV2: ReturnType<AlertsV2['start']>;
  rulesV2: ReturnType<RulesV2['start']>;
  assetInventory: Awaited<ReturnType<AssetInventory['start']>>;
  attackDiscovery: ReturnType<AttackDiscovery['start']>;
  cloudDefend: ReturnType<CloudDefend['start']>;
  cloudSecurityPosture: ReturnType<CloudSecurityPosture['start']>;
  dashboards: ReturnType<Dashboards['start']>;
  exceptions: ReturnType<Exceptions['start']>;
  explore: ReturnType<Explore['start']>;
  kubernetes: ReturnType<Kubernetes['start']>;
  management: ReturnType<Management['start']>;
  onboarding: ReturnType<Onboarding['start']>;
  overview: ReturnType<Overview['start']>;
  reports: ReturnType<Reports['start']>;
  rules: ReturnType<Rules['start']>;
  threatIntelligence: ReturnType<ThreatIntelligence['start']>;
  timelines: ReturnType<Timelines['start']>;
  entityAnalytics: ReturnType<EntityAnalytics['start']>;
  siemMigrations: ReturnType<SiemMigrations['start']>;
  siemReadiness: ReturnType<SiemReadiness['start']>;
  configurations: ReturnType<Configurations['start']>;
}
