/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { NavigationTreeDefinition } from '@kbn/core-chrome-browser';
import type { CoreStart } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import type { AddSolutionNavigationArg } from '@kbn/navigation-plugin/public';
import { STACK_MANAGEMENT_NAV_ID, DATA_MANAGEMENT_NAV_ID } from '@kbn/deeplinks-management';
import { combineLatest, map, of } from 'rxjs';
import { AIChatExperience } from '@kbn/ai-assistant-common';
import { AI_CHAT_EXPERIENCE_TYPE } from '@kbn/management-settings-ids';
import { getAlertingV2ManagementNavPanel } from '@kbn/alerting-v2-utils';
import type { Location } from 'history';
import type { ObservabilityPublicPluginsStart } from './plugin';

const title = i18n.translate(
  'xpack.observability.obltNav.headerSolutionSwitcher.obltSolutionTitle',
  {
    defaultMessage: 'Observability',
  }
);
const icon = 'logoObservability';

/**
 * CONTEXT: After restructuring Dashboards to integrate the Visualize library,
 * we need to maintain proper navigation state when users edit visualizations accessed
 * from the Dashboard Viz tab. This keeps the Dashboard nav item active during editing.
 */
function isEditingFromDashboard(
  location: Location,
  pathNameSerialized: string,
  prepend: (path: string) => string
): boolean {
  const vizApps = ['/app/visualize', '/app/maps', '/app/lens'];
  const isVizApp = vizApps.some((app) => pathNameSerialized.startsWith(prepend(app)));
  const hasOriginatingApp =
    location.search.includes('originatingApp=dashboards') ||
    location.hash.includes('originatingApp=dashboards');
  return isVizApp && hasOriginatingApp;
}

function createNavTree({
  coreStart,
  streamsAvailable,
  showAiAssistant,
  isCloudEnabled,
  ingestHubAvailable,
}: {
  coreStart: CoreStart;
  streamsAvailable?: boolean;
  showAiAssistant?: boolean;
  isCloudEnabled?: boolean;
  ingestHubAvailable?: boolean;
}) {
  const navTree: NavigationTreeDefinition = {
    body: [
      {
        link: 'observability-overview',
        title,
        icon,
        renderAs: 'home',
      },
      {
        title: i18n.translate('xpack.observability.obltNav.discover', {
          defaultMessage: 'Discover',
        }),
        link: 'discover',
        icon: 'productDiscover',
      },
      {
        link: 'dashboards',
        icon: 'productDashboard',
        getIsActive: ({ pathNameSerialized, prepend, location }) =>
          pathNameSerialized.startsWith(prepend('/app/dashboards')) ||
          isEditingFromDashboard(location, pathNameSerialized, prepend),
      },
      {
        link: 'workflows',
      },
      {
        link: 'observability-overview:alerts',
        icon: 'warning',
      },
      {
        link: 'observability-overview:cases',
        children: [
          {
            link: 'observability-overview:cases_configure',
          },
          {
            link: 'observability-overview:cases_create',
          },
        ],
        icon: 'briefcase',
      },
      {
        link: 'slo',
        icon: 'visGauge',
      },
      ...(streamsAvailable
        ? [
            {
              link: 'streams' as const,
              icon: 'productStreamsWired',
            },
          ]
        : []),
      {
        id: 'applications',
        title: i18n.translate('xpack.observability.obltNav.applications', {
          defaultMessage: 'Applications',
        }),
        renderAs: 'panelOpener',
        icon: 'spaces',
        children: [
          {
            id: 'apm',
            children: [
              {
                link: 'apm:service-map',
                getIsActive: ({ pathNameSerialized, prepend }) => {
                  return pathNameSerialized.startsWith(prepend('/app/apm/service-map'));
                },
                sideNavStatus: 'hidden',
              },
              {
                link: 'apm:service-groups-list',
                getIsActive: ({ pathNameSerialized, prepend }) => {
                  return pathNameSerialized.startsWith(prepend('/app/apm/service-groups'));
                },
                sideNavStatus: 'hidden',
              },
              {
                link: 'apm:services',
                getIsActive: ({ pathNameSerialized }) => {
                  const regex = /app\/apm\/.*service.*/;
                  return regex.test(pathNameSerialized);
                },
              },
              {
                link: 'apm:traces',
                getIsActive: ({ pathNameSerialized, prepend }) => {
                  return pathNameSerialized.startsWith(prepend('/app/apm/traces'));
                },
              },
              {
                link: 'apm:dependencies',
                getIsActive: ({ pathNameSerialized, prepend }) => {
                  return pathNameSerialized.startsWith(prepend('/app/apm/dependencies'));
                },
              },
              {
                link: 'ux',
                title: i18n.translate('xpack.observability.obltNav.apm.ux', {
                  defaultMessage: 'User experience',
                }),
              },
            ],
          },
          {
            id: 'synthetics',
            title: i18n.translate('xpack.observability.obltNav.apm.syntheticsGroupTitle', {
              defaultMessage: 'Synthetics',
            }),
            children: [
              {
                link: 'synthetics',
                title: i18n.translate('xpack.observability.obltNav.apm.synthetics.monitors', {
                  defaultMessage: 'Monitors',
                }),
              },
              {
                link: 'synthetics:certificates',
                title: i18n.translate(
                  'xpack.observability.obltNav.apm.synthetics.tlsCertificates',
                  {
                    defaultMessage: 'TLS certificates',
                  }
                ),
              },
            ],
          },
          {
            id: 'uptime',
            title: i18n.translate('xpack.observability.obltNav.apm.uptimeGroupTitle', {
              defaultMessage: 'Uptime',
            }),
            children: [
              {
                link: 'uptime',
                title: i18n.translate('xpack.observability.obltNav.apm.uptime.monitors', {
                  defaultMessage: 'Uptime monitors',
                }),
              },
              {
                link: 'uptime:Certificates',
                title: i18n.translate('xpack.observability.obltNav.apm.uptime.tlsCertificates', {
                  defaultMessage: 'TLS certificates',
                }),
              },
            ],
          },
        ],
      },
      {
        id: 'metrics',
        link: 'metrics:inventory',
        title: i18n.translate('xpack.observability.obltNav.infrastructure', {
          defaultMessage: 'Infrastructure',
        }),
        renderAs: 'panelOpener',
        icon: 'productCloudInfra',
        children: [
          {
            children: [
              {
                link: 'metrics:inventory',
                title: i18n.translate('xpack.observability.infrastructure.inventory', {
                  defaultMessage: 'Infrastructure inventory',
                }),
                getIsActive: ({ pathNameSerialized, prepend }) => {
                  return pathNameSerialized.startsWith(prepend('/app/metrics/inventory'));
                },
              },
              {
                link: 'metrics:hosts',
                getIsActive: ({ pathNameSerialized, prepend }) => {
                  return pathNameSerialized.startsWith(prepend('/app/metrics/hosts'));
                },
              },
              {
                link: 'metrics:metrics-explorer',
                title: i18n.translate(
                  'xpack.observability.obltNav.infrastructure.metricsExplorer',
                  {
                    defaultMessage: 'Metrics explorer',
                  }
                ),
              },
            ],
          },
          {
            id: 'profiling',
            title: i18n.translate('xpack.observability.obltNav.infrastructure.universalProfiling', {
              defaultMessage: 'Universal Profiling',
            }),
            children: [
              {
                link: 'profiling:stacktraces',
              },
              {
                link: 'profiling:flamegraphs',
              },
              {
                link: 'profiling:functions',
              },
            ],
          },
        ],
      },
      ...(showAiAssistant
        ? [
            {
              id: 'aiAssistantContainer',
              title: i18n.translate('xpack.observability.obltNav.aiAssistant', {
                defaultMessage: 'AI Assistant',
              }),
              icon: 'sparkles',
              link: 'observabilityAIAssistant' as const,
            },
          ]
        : [
            {
              link: 'agent_builder' as const,
              icon: 'productAgent',
            },
          ]),
      {
        id: 'machine_learning-landing',
        title: i18n.translate('xpack.observability.obltNav.machineLearning', {
          defaultMessage: 'Machine Learning',
        }),
        renderAs: 'panelOpener',
        icon: 'productML',
        children: [
          {
            title: '',
            children: [
              {
                link: 'ml:overview',
              },
              {
                link: 'ml:dataVisualizer',
              },
              {
                link: 'ml:dataDrift',
                sideNavStatus: 'hidden',
              },
              {
                link: 'ml:dataDriftPage',
                sideNavStatus: 'hidden',
              },
              {
                link: 'ml:fileUpload',
                sideNavStatus: 'hidden',
              },
              {
                link: 'ml:indexDataVisualizer',
                sideNavStatus: 'hidden',
              },
            ],
          },
          {
            id: 'category-anomaly_detection',
            title: i18n.translate('xpack.observability.obltNav.ml.anomaly_detection', {
              defaultMessage: 'Anomaly detection',
            }),
            breadcrumbStatus: 'hidden',
            children: [
              {
                link: 'management:anomaly_detection',
                title: i18n.translate(
                  'xpack.observability.obltNav.ml.anomaly_detection.manage_jobs',
                  {
                    defaultMessage: 'Manage jobs',
                  }
                ),
              },
              {
                link: 'ml:anomalyExplorer',
              },
              {
                link: 'ml:singleMetricViewer',
              },
            ],
          },
          {
            id: 'category-data_frame analytics',
            title: i18n.translate('xpack.observability.obltNav.ml.data_frame_analytics', {
              defaultMessage: 'Data frame analytics',
            }),
            breadcrumbStatus: 'hidden',
            children: [
              {
                link: 'ml:resultExplorer',
              },
              {
                link: 'ml:analyticsMap',
              },
            ],
          },
          {
            id: 'category-aiops_labs',
            title: i18n.translate('xpack.observability.obltNav.ml.aiops_labs', {
              defaultMessage: 'AIOps Labs',
            }),
            breadcrumbStatus: 'hidden',
            children: [
              {
                link: 'ml:logRateAnalysis',
              },
              {
                link: 'ml:logRateAnalysisPage',
                sideNavStatus: 'hidden',
              },
              {
                link: 'ml:logPatternAnalysis',
              },
              {
                link: 'ml:logPatternAnalysisPage',
                sideNavStatus: 'hidden',
              },
              {
                link: 'ml:changePointDetections',
              },
              {
                link: 'ml:changePointDetectionsPage',
                sideNavStatus: 'hidden',
              },
            ],
          },
        ],
      },
      {
        id: 'otherTools',
        title: i18n.translate('xpack.observability.obltNav.otherTools', {
          defaultMessage: 'Other tools',
        }),
        renderAs: 'panelOpener',
        icon: 'wrench',
        children: [
          {
            link: 'logs:anomalies',
            title: i18n.translate('xpack.observability.obltNav.otherTools.logsAnomalies', {
              defaultMessage: 'Logs anomalies',
            }),
          },
          {
            link: 'logs:log-categories',
            title: i18n.translate('xpack.observability.obltNav.otherTools.logsCategories', {
              defaultMessage: 'Logs categories',
            }),
          },
          {
            link: 'maps',
            getIsActive: ({ pathNameSerialized, location, prepend }) =>
              !isEditingFromDashboard(location, pathNameSerialized, prepend) &&
              pathNameSerialized.includes('/app/maps'),
          },
          { link: 'graph' },
        ],
      },
    ],
    footer: [
      ingestHubAvailable
        ? {
            link: 'ingestHub' as const,
            title: i18n.translate('xpack.observability.obltNav.ingestHub', {
              defaultMessage: 'Ingest Hub',
            }),
            icon: 'launch',
            children: [
              {
                link: 'ingestHub' as const,
                title: i18n.translate('xpack.observability.obltNav.ingestHub.getStarted', {
                  defaultMessage: 'Get started',
                }),
              },
              {
                link: 'onboarding' as const,
                sideNavStatus: 'hidden',
              },
            ],
          }
        : {
            title: i18n.translate('xpack.observability.obltNav.addData', {
              defaultMessage: 'Add data',
            }),
            link: 'observabilityOnboarding' as const,
            icon: 'plusInCircle',
            children: [
              {
                link: 'onboarding' as const,
                sideNavStatus: 'hidden',
              },
            ],
          },
      {
        id: 'devTools',
        title: i18n.translate('xpack.observability.obltNav.devTools', {
          defaultMessage: 'Developer tools',
        }),
        link: 'dev_tools',
        icon: 'code',
      },
      {
        id: DATA_MANAGEMENT_NAV_ID,
        title: i18n.translate('xpack.observability.obltNav.dataManagement', {
          defaultMessage: 'Data management',
          description: 'The heading of a section in a navigation tree dedicated to data collection',
        }),
        renderAs: 'panelOpener',
        icon: 'database',
        children: [
          {
            id: 'ingest_and_integrations',
            title: i18n.translate('xpack.observability.obltNav.ingestAndIntegrations', {
              defaultMessage: 'Ingest and integrations',
              description:
                'The heading of a section in a navigation tree dedicated to data collection',
            }),
            renderAs: 'panelOpener',
            children: [
              {
                link: 'integrations',
              },
              {
                link: 'fleet',
              },
              {
                link: 'management:ingest_pipelines',
              },
              {
                link: 'management:pipelines',
              },
              {
                link: 'management:content_connectors',
              },
            ],
          },
          {
            id: 'indicesAndDataStreams',
            title: i18n.translate('xpack.observability.obltNav.indicesAndDataStreams', {
              defaultMessage: 'Indices and data streams',
              description:
                'Heading in a nav tree dedicated to UIs for leveraging various Elasticsearch features for data management',
            }),
            renderAs: 'panelOpener',
            children: [
              {
                link: 'management:index_management',
              },
              {
                link: 'management:index_lifecycle_management',
              },
              {
                link: 'management:snapshot_restore',
              },
              {
                link: 'management:transform',
              },
              {
                link: 'management:rollup_jobs',
              },
              {
                link: 'management:data_quality',
              },
            ],
          },
        ],
      },
      {
        id: STACK_MANAGEMENT_NAV_ID,
        title: i18n.translate('xpack.observability.obltNav.management', {
          defaultMessage: 'Stack Management',
        }),
        icon: 'gear',
        breadcrumbStatus: 'hidden',
        renderAs: 'panelOpener',
        children: [
          {
            id: 'stack_management_home',
            title: '',
            renderAs: 'panelOpener',
            children: [
              {
                // We include this link here to ensure that the settings icon does not land on Stack Monitoring by default
                // https://github.com/elastic/kibana/issues/241518
                // And that the sidenav panel opens when user lands to legacy management landing page
                // https://github.com/elastic/kibana/issues/240275
                link: 'management',
                title: i18n.translate('xpack.observability.obltNav.management_home', {
                  defaultMessage: 'Home',
                }),
                breadcrumbStatus: 'hidden',
              },
              // Only show Cloud Connect in on-prem deployments (not cloud)
              ...(isCloudEnabled
                ? []
                : [
                    {
                      id: 'cloud_connect' as const,
                      link: 'cloud_connect' as const,
                    },
                  ]),
            ],
          },
          ...getAlertingV2ManagementNavPanel(coreStart),
          {
            id: 'alerts_and_insights',
            title: i18n.translate('xpack.observability.obltNav.alertsAndInsights', {
              defaultMessage: 'Alerts and Insights',
            }),
            renderAs: 'panelOpener',
            children: [
              {
                link: 'management:triggersActions',
              },
              {
                link: 'management:triggersActionsConnectors',
              },
              {
                link: 'management:reporting',
              },
              {
                link: 'management:watcher',
              },
              {
                link: 'management:maintenanceWindows',
              },
            ],
          },
          {
            id: 'cluster_performance',
            title: i18n.translate('xpack.observability.obltNav.clusterPerformance', {
              defaultMessage: 'Cluster performance',
            }),
            children: [
              { link: 'monitoring' },
              {
                link: 'management:queryActivity',
                badgeType: 'new',
              },
            ],
          },
          {
            id: 'management_ml',
            title: i18n.translate('xpack.observability.obltNav.machineLearning', {
              defaultMessage: 'Machine Learning',
            }),
            children: [
              { link: 'management:overview' },
              { link: 'management:anomaly_detection' },
              { link: 'management:analytics' },
              { link: 'management:trained_models' },
              { link: 'management:supplied_configurations' },
            ],
          },
          {
            id: 'management_model_management',
            title: i18n.translate('xpack.observability.obltNav.modelManagement', {
              defaultMessage: 'Model Management',
            }),
            children: [
              { link: 'management:elastic_inference_service' },
              { link: 'management:inference_endpoints' },
              { link: 'management:model_settings' },
            ],
          },
          {
            id: 'management_ai',
            title: i18n.translate('xpack.observability.obltNav.ai', {
              defaultMessage: 'AI',
            }),
            children: [
              { link: 'management:genAiSettings' },
              { link: 'management:evals' },
              { link: 'management:aiAssistantManagementSelection' },
            ],
          },
          {
            id: 'security',
            title: i18n.translate('xpack.observability.obltNav.security', {
              defaultMessage: 'Security',
            }),
            renderAs: 'panelOpener',
            children: [
              {
                link: 'management:users',
              },
              {
                link: 'management:roles',
              },
              {
                link: 'management:api_keys',
              },
              {
                link: 'management:role_mappings',
              },
            ],
          },
          {
            id: 'data',
            title: i18n.translate('xpack.observability.obltNav.data', {
              defaultMessage: 'Data',
            }),
            renderAs: 'panelOpener',
            children: [
              {
                link: 'management:cross_cluster_replication',
              },
              {
                link: 'management:remote_clusters',
              },
            ],
          },
          {
            id: 'kibana',
            title: i18n.translate('xpack.observability.obltNav.kibana', {
              defaultMessage: 'Kibana',
            }),
            renderAs: 'panelOpener',
            children: [
              {
                link: 'management:filesManagement',
              },
              {
                link: 'management:objects',
              },
              {
                link: 'management:tags',
              },
              {
                link: 'management:spaces',
              },
              {
                link: 'management:settings',
              },
              {
                link: 'management:dataViews',
              },
              {
                link: 'management:search_sessions',
              },
            ],
          },
        ],
      },
    ],
  };

  return navTree;
}

export const createDefinition = (
  coreStart: CoreStart,
  pluginsStart: ObservabilityPublicPluginsStart
): AddSolutionNavigationArg => ({
  id: 'oblt',
  title,
  icon: 'logoObservability',
  navigationTree$: combineLatest([
    pluginsStart.streams?.navigationStatus$ || of({ status: 'disabled' as const }),
    coreStart.settings.client.get$<AIChatExperience>(AI_CHAT_EXPERIENCE_TYPE),
    pluginsStart.ingestHub?.navigationAvailable$ || of(false),
  ]).pipe(
    map(([{ status }, chatExperience, ingestHubAvailable]) =>
      createNavTree({
        coreStart,
        streamsAvailable: status === 'enabled',
        showAiAssistant: chatExperience !== AIChatExperience.Agent,
        isCloudEnabled: pluginsStart.cloud?.isCloudEnabled,
        ingestHubAvailable,
      })
    )
  ),
});
