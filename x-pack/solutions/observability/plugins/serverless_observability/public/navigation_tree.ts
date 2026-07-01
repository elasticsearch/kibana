/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { NavigationTreeDefinition, NodeDefinition } from '@kbn/core-chrome-browser';
import type { CoreStart } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import { DATA_MANAGEMENT_NAV_ID } from '@kbn/deeplinks-management';
import { getAlertingV2ManagementNavPanel } from '@kbn/alerting-v2-utils';

export function filterForFeatureAvailability(
  node: NodeDefinition,
  featureFlag: boolean = false
): NodeDefinition[] {
  if (!featureFlag) {
    return [];
  }
  return [node];
}

export const createNavigationTree = ({
  core,
  streamsAvailable,
  overviewAvailable = true,
  genAiSettingsAvailable = true,
  isCasesAvailable = true,
  showAiAssistant = true,
}: {
  core: CoreStart;
  streamsAvailable?: boolean;
  overviewAvailable?: boolean;
  genAiSettingsAvailable?: boolean;
  isCasesAvailable?: boolean;
  showAiAssistant?: boolean;
}): NavigationTreeDefinition => {
  return {
    body: [
      {
        id: 'observability_project_nav',
        title: i18n.translate('xpack.serverlessObservability.nav.projectSettings.observability', {
          defaultMessage: 'Observability',
        }),
        renderAs: 'home',
        icon: 'logoObservability',
        link: overviewAvailable
          ? ('observability-overview' as const)
          : ('observabilityOnboarding' as const),
      },
      {
        title: i18n.translate('xpack.serverlessObservability.nav.discover', {
          defaultMessage: 'Discover',
        }),
        link: 'discover',
        icon: 'productDiscover',
      },
      {
        title: i18n.translate('xpack.serverlessObservability.nav.dashboards', {
          defaultMessage: 'Dashboards',
        }),
        link: 'dashboards',
        icon: 'productDashboard',
        getIsActive: ({ pathNameSerialized, prepend }) => {
          return pathNameSerialized.startsWith(prepend('/app/dashboards'));
        },
      },
      {
        link: 'workflows',
      },
      {
        link: 'observability-overview:alerts',
        icon: 'warning',
        getIsActive: ({ pathNameSerialized, prepend }) =>
          pathNameSerialized.startsWith(prepend('/app/observability/alerts')),
      },
      ...filterForFeatureAvailability(
        {
          link: 'observability-overview:cases' as const,
          icon: 'briefcase',
          children: [
            {
              link: 'observability-overview:cases_configure' as const,
            },
            {
              link: 'observability-overview:cases_create' as const,
            },
          ],
        },
        isCasesAvailable
      ),
      {
        title: i18n.translate('xpack.serverlessObservability.nav.slo', {
          defaultMessage: 'SLOs',
        }),
        link: 'slo',
        icon: 'chartGauge',
      },
      ...filterForFeatureAvailability(
        {
          link: 'streams' as const,
          icon: 'productStreamsWired',
        },
        streamsAvailable
      ),
      {
        id: 'applications',
        title: i18n.translate('xpack.serverlessObservability.nav.applications', {
          defaultMessage: 'Applications',
        }),
        renderAs: 'panelOpener',
        icon: 'spaces',
        children: [
          {
            id: 'apm',
            children: [
              {
                link: 'apm:services',
                title: i18n.translate('xpack.serverlessObservability.nav.apm.services', {
                  defaultMessage: 'Service inventory',
                }),
                getIsActive: ({ pathNameSerialized }) => {
                  const regex = /app\/apm\/.*service.*/;

                  return regex.test(pathNameSerialized);
                },
              },
              {
                link: 'apm:service-map',
                title: i18n.translate('xpack.serverlessObservability.nav.apm.serviceMap', {
                  defaultMessage: 'Service map',
                }),
                sideNavStatus: 'hidden',
              },
              {
                link: 'apm:service-groups-list',
                getIsActive: ({ pathNameSerialized, prepend }) => {
                  return pathNameSerialized.startsWith(prepend('/app/apm/service-groups'));
                },
                sideNavStatus: 'hidden',
              },
              { link: 'apm:traces' },
              { link: 'apm:dependencies' },
              { link: 'apm:settings', sideNavStatus: 'hidden' },
            ],
          },
          {
            id: 'synthetics',
            title: i18n.translate('xpack.serverlessObservability.nav.synthetics', {
              defaultMessage: 'Synthetics',
            }),
            children: [
              {
                title: i18n.translate('xpack.serverlessObservability.nav.synthetics.overviewItem', {
                  defaultMessage: 'Overview',
                }),
                id: 'synthetics-overview',
                link: 'synthetics:overview',
                breadcrumbStatus: 'hidden',
              },
              {
                link: 'synthetics:certificates',
                title: i18n.translate(
                  'xpack.serverlessObservability.nav.synthetics.certificatesItem',
                  {
                    defaultMessage: 'TLS certificates',
                  }
                ),
                id: 'synthetics-certificates',
                breadcrumbStatus: 'hidden',
              },
            ],
          },
        ],
      },
      {
        id: 'metrics',
        link: 'metrics:inventory',
        title: i18n.translate('xpack.serverlessObservability.nav.infrastructure', {
          defaultMessage: 'Infrastructure',
        }),
        renderAs: 'panelOpener',
        icon: 'productCloudInfra',
        children: [
          {
            children: [
              {
                link: 'metrics:inventory',
                title: i18n.translate('xpack.serverlessObservability.nav.infrastructureInventory', {
                  defaultMessage: 'Infrastructure inventory',
                }),
              },
              { link: 'metrics:hosts' },
              { link: 'metrics:settings', sideNavStatus: 'hidden' },
            ],
          },
          {
            id: 'profiling',
            title: i18n.translate('xpack.serverlessObservability.nav.profiling', {
              defaultMessage: 'Profiling',
            }),
            children: [
              {
                title: i18n.translate(
                  'xpack.serverlessObservability.navigation.stacktracesLinkLabel',
                  {
                    defaultMessage: 'Stacktraces',
                  }
                ),
                id: 'profiling-stacktraces',
                link: 'profiling:stacktraces',
                breadcrumbStatus: 'hidden',
              },
              {
                link: 'profiling:flamegraphs',
                title: i18n.translate(
                  'xpack.serverlessObservability.navigation.flameGraphsLinkLabel',
                  {
                    defaultMessage: 'Flamegraphs',
                  }
                ),
                id: 'profiling-flamegraphs',
                breadcrumbStatus: 'hidden',
              },
              {
                link: 'profiling:functions',
                title: i18n.translate(
                  'xpack.serverlessObservability.navigation.functionsLinkLabel',
                  {
                    defaultMessage: 'Functions',
                  }
                ),
                id: 'profiling-functions',
                breadcrumbStatus: 'hidden',
              },
            ],
          },
        ],
      },
      ...filterForFeatureAvailability(
        {
          link: 'observabilityAIAssistant',
          title: i18n.translate('xpack.serverlessObservability.nav.aiAssistant', {
            defaultMessage: 'AI Assistant',
          }),
          icon: 'sparkles',
        },
        showAiAssistant
      ),
      ...filterForFeatureAvailability(
        {
          link: 'agent_builder',
          icon: 'productAgent',
        },
        !showAiAssistant
      ),
      ...filterForFeatureAvailability(
        {
          id: 'machine_learning-landing',
          renderAs: 'panelOpener',
          title: i18n.translate('xpack.serverlessObservability.nav.machineLearning', {
            defaultMessage: 'Machine Learning',
          }),
          icon: 'productML',
          children: [
            {
              id: 'category-ml_overview',
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
              title: i18n.translate('xpack.serverlessObservability.nav.ml.anomaly_detection', {
                defaultMessage: 'Anomaly detection',
              }),
              breadcrumbStatus: 'hidden',
              children: [
                {
                  link: 'management:anomaly_detection',
                  title: i18n.translate(
                    'xpack.serverlessObservability.nav.ml.anomaly_detection.manage_jobs',
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
              title: i18n.translate('xpack.serverlessObservability.nav.ml.data_frame_analytics', {
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
              title: i18n.translate('xpack.serverlessObservability.nav.ml.aiops_labs', {
                defaultMessage: 'AIOps labs',
              }),
              breadcrumbStatus: 'hidden',
              children: [
                {
                  link: 'ml:logRateAnalysis',
                  title: i18n.translate(
                    'xpack.serverlessObservability.nav.ml.aiops_labs.log_rate_analysis',
                    {
                      defaultMessage: 'Log rate analysis',
                    }
                  ),
                },
                {
                  link: 'ml:logRateAnalysisPage',
                  sideNavStatus: 'hidden',
                },
                {
                  link: 'ml:logPatternAnalysis',
                  title: i18n.translate(
                    'xpack.serverlessObservability.nav.ml.aiops_labs.log_pattern_analysis',
                    {
                      defaultMessage: 'Log pattern analysis',
                    }
                  ),
                },
                {
                  link: 'ml:logPatternAnalysisPage',
                  sideNavStatus: 'hidden',
                },
                {
                  link: 'ml:changePointDetections',
                  title: i18n.translate(
                    'xpack.serverlessObservability.nav.ml.aiops_labs.change_point_detection',
                    {
                      defaultMessage: 'Change point detection',
                    }
                  ),
                },
                {
                  link: 'ml:changePointDetectionsPage',
                  sideNavStatus: 'hidden',
                },
              ],
            },
          ],
        },
        overviewAvailable
      ),
      {
        id: 'otherTools',
        title: i18n.translate('xpack.serverlessObservability.nav.otherTools', {
          defaultMessage: 'Other tools',
        }),
        renderAs: 'panelOpener',
        icon: 'wrench',
        children: [
          {
            link: 'logs:anomalies',
            title: i18n.translate('xpack.serverlessObservability.nav.otherTools.logsAnomalies', {
              defaultMessage: 'Logs anomalies',
            }),
          },
          {
            link: 'logs:log-categories',
            title: i18n.translate('xpack.serverlessObservability.nav.otherTools.logsCategories', {
              defaultMessage: 'Logs categories',
            }),
          },
        ],
      },
    ],
    footer: [
      {
        title: i18n.translate('xpack.serverlessObservability.nav.getStarted', {
          defaultMessage: 'Add data',
        }),
        link: 'observabilityOnboarding',
        icon: 'plusCircle',
      },
      {
        id: 'devTools',
        title: i18n.translate('xpack.serverlessObservability.nav.devTools', {
          defaultMessage: 'Developer tools',
        }),
        link: 'dev_tools',
        icon: 'code',
      },
      {
        id: DATA_MANAGEMENT_NAV_ID,
        title: i18n.translate('xpack.serverlessObservability.nav.dataManagement', {
          defaultMessage: 'Data management',
        }),
        renderAs: 'panelOpener',
        icon: 'database',
        breadcrumbStatus: 'hidden',
        children: [
          {
            title: i18n.translate('xpack.serverlessObservability.nav.ingestAndIntegrations', {
              defaultMessage: 'Ingest and integrations',
              description:
                'The title of the ingest and integrations navigation item in the serverless observability nav tree.',
            }),
            breadcrumbStatus: 'hidden',
            children: [
              { link: 'integrations' },
              { link: 'fleet' },
              { link: 'management:ingest_pipelines' },
              { link: 'management:pipelines' },
              { link: 'management:content_connectors' },
            ],
          },
          {
            title: i18n.translate(
              'xpack.serverlessObservability.nav.indicesDataStreamsAndRollups',
              {
                defaultMessage: 'Indices and data streams',
              }
            ),
            children: [
              { link: 'management:index_management' },
              { link: 'management:index_lifecycle_management' },
              { link: 'management:snapshot_restore' },
              { link: 'management:transform' },
              { link: 'management:rollup_jobs' },
              { link: 'management:data_federation' },
              { link: 'management:data_quality' },
              { link: 'management:data_usage' },
            ],
          },
        ],
      },
      {
        id: 'admin_and_settings',
        title: i18n.translate('xpack.serverlessObservability.nav.adminAndSettings', {
          defaultMessage: 'Admin and Settings',
        }),
        icon: 'gear',
        breadcrumbStatus: 'hidden',
        renderAs: 'panelOpener',
        children: [
          {
            id: 'access',
            title: i18n.translate('xpack.serverlessObservability.nav.projectSettings.access', {
              defaultMessage: 'Access',
            }),
            breadcrumbStatus: 'hidden',
            children: [
              { link: 'management:api_keys' },
              { link: 'management:application_connections' },
              { link: 'management:roles' },
            ],
          },
          {
            id: 'cloud_link_org_settings',
            title: i18n.translate(
              'xpack.serverlessObservability.nav.projectSettings.organization',
              {
                defaultMessage: 'Organization',
              }
            ),
            children: [
              {
                cloudLink: 'billingAndSub',
              },
              {
                cloudLink: 'userAndRoles',
              },
            ],
          },
          ...getAlertingV2ManagementNavPanel(core),
          {
            id: 'alerts_and_insights',
            title: i18n.translate(
              'xpack.serverlessObservability.nav.projectSettings.alertsAndInsights',
              {
                defaultMessage: 'Alerts and insights',
              }
            ),
            breadcrumbStatus: 'hidden',
            children: [
              { link: 'management:triggersActionsAlerts' },
              { link: 'management:triggersActions' },
              { link: 'management:triggersActionsConnectors', breadcrumbStatus: 'hidden' },
              { link: 'management:maintenanceWindows', breadcrumbStatus: 'hidden' },
            ],
          },
          {
            id: 'project_performance',
            title: i18n.translate(
              'xpack.serverlessObservability.nav.projectSettings.projectPerformance',
              {
                defaultMessage: 'Project performance',
              }
            ),
            breadcrumbStatus: 'hidden',
            children: [{ link: 'management:queryActivity', badgeType: 'new' }],
          },
          ...filterForFeatureAvailability(
            {
              id: 'machine_learning',
              title: i18n.translate(
                'xpack.serverlessObservability.nav.projectSettings.machineLearning',
                {
                  defaultMessage: 'Machine Learning',
                }
              ),
              breadcrumbStatus: 'hidden',
              children: [
                { link: 'management:overview' },
                { link: 'management:anomaly_detection' },
                { link: 'management:analytics' },
                { link: 'management:trained_models' },
                { link: 'management:supplied_configurations' },
              ],
            },
            overviewAvailable
          ),
          ...filterForFeatureAvailability(
            {
              id: 'model_management',
              title: i18n.translate(
                'xpack.serverlessObservability.nav.projectSettings.modelManagement',
                {
                  defaultMessage: 'Model Management',
                }
              ),
              children: [
                { link: 'management:elastic_inference_service' },
                { link: 'management:inference_endpoints' },
                { link: 'management:model_settings' },
              ],
            },
            genAiSettingsAvailable
          ),
          ...filterForFeatureAvailability(
            {
              title: i18n.translate('xpack.serverlessObservability.nav.projectSettings.ai', {
                defaultMessage: 'AI',
              }),
              children: [
                {
                  link: 'management:genAiSettings' as const,
                  breadcrumbStatus: 'hidden' as const,
                },
                {
                  link: 'management:evals' as const,
                  breadcrumbStatus: 'hidden' as const,
                },
                ...(showAiAssistant
                  ? [
                      {
                        link: 'management:observabilityAiAssistantManagement' as const,
                        breadcrumbStatus: 'hidden' as const,
                      },
                    ]
                  : []),
              ],
            },
            genAiSettingsAvailable
          ),
          {
            id: 'content',
            title: i18n.translate('xpack.serverlessObservability.nav.projectSettings.content', {
              defaultMessage: 'Content',
            }),
            breadcrumbStatus: 'hidden',
            children: [
              { link: 'management:dataViews', breadcrumbStatus: 'hidden' },
              { link: 'management:spaces', breadcrumbStatus: 'hidden' },
              { link: 'management:objects', breadcrumbStatus: 'hidden' },
              { link: 'management:filesManagement', breadcrumbStatus: 'hidden' },
              { link: 'management:reporting', breadcrumbStatus: 'hidden' },
              { link: 'management:tags', breadcrumbStatus: 'hidden' },
            ],
          },
          {
            id: 'other',
            title: i18n.translate('xpack.serverlessObservability.nav.projectSettings.other', {
              defaultMessage: 'Other',
            }),
            breadcrumbStatus: 'hidden',
            children: [{ link: 'management:settings' }],
          },
          {
            // We include this link here to ensure that sidenav panel opens when user lands to legacy management landing page
            // https://github.com/elastic/kibana/issues/240275
            link: 'management',
            sideNavStatus: 'hidden',
          },
        ],
      },
    ],
  };
};
