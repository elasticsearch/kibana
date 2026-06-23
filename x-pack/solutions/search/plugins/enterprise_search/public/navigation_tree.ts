/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Location } from 'history';
import { type Observable, debounceTime, map } from 'rxjs';

import type { EuiSideNavItemType } from '@elastic/eui';
import { getAlertingV2ManagementNavPanel } from '@kbn/alerting-v2-utils';
import type { CoreStart } from '@kbn/core/public';
import type { NavigationTreeDefinition } from '@kbn/core-chrome-browser';
import { STACK_MANAGEMENT_NAV_ID, DATA_MANAGEMENT_NAV_ID } from '@kbn/deeplinks-management';
import { SEARCH_HOMEPAGE } from '@kbn/deeplinks-search';
import { i18n } from '@kbn/i18n';

import type { AddSolutionNavigationArg } from '@kbn/navigation-plugin/public';

export interface DynamicSideNavItems {
  collections?: Array<EuiSideNavItemType<unknown>>;
  indices?: Array<EuiSideNavItemType<unknown>>;
  searchApps?: Array<EuiSideNavItemType<unknown>>;
}

const title = i18n.translate(
  'xpack.enterpriseSearch.searchNav.headerSolutionSwitcher.searchSolutionTitle',
  {
    defaultMessage: 'Elasticsearch',
  }
);
const icon = 'logoElasticsearch';

/**
 * CONTEXT: After restructuring Dashboards to integrate the Visualize library,
 * we need to maintain proper navigation state when users edit visualizations accessed
 * from the Dashboards' Visualizations tab. This keeps the Dashboards nav item active during editing.
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

export const getNavigationTreeDefinition = ({
  core,
  dynamicItems$,
  isCloudEnabled,
}: {
  core: CoreStart;
  dynamicItems$: Observable<DynamicSideNavItems>;
  isCloudEnabled?: boolean;
}): AddSolutionNavigationArg => {
  return {
    icon,
    id: 'es',
    navigationTree$: dynamicItems$.pipe(
      debounceTime(10),
      map(() => {
        const navTree: NavigationTreeDefinition = {
          body: [
            {
              icon,
              link: SEARCH_HOMEPAGE,
              renderAs: 'home',
              title,
            },
            {
              icon: 'productAgent',
              link: 'agent_builder',
            },
            {
              icon: 'productDiscover',
              link: 'discover',
            },
            {
              getIsActive: ({ pathNameSerialized, prepend, location }) =>
                pathNameSerialized.startsWith(prepend('/app/dashboards')) ||
                isEditingFromDashboard(location, pathNameSerialized, prepend),
              icon: 'productDashboard',
              link: 'dashboards',
            },
            {
              link: 'workflows',
            },
            {
              children: [
                {
                  children: [
                    { link: 'ml:overview' },
                    { link: 'ml:dataVisualizer' },
                    { link: 'ml:dataDrift', sideNavStatus: 'hidden' },
                    { link: 'ml:dataDriftPage', sideNavStatus: 'hidden' },
                    { link: 'ml:fileUpload', sideNavStatus: 'hidden' },
                    { link: 'ml:indexDataVisualizer', sideNavStatus: 'hidden' },
                  ],
                  id: 'ml_overview',
                  title: '',
                },
                {
                  breadcrumbStatus: 'hidden',
                  children: [
                    {
                      link: 'management:anomaly_detection',
                      title: i18n.translate(
                        'xpack.enterpriseSearch.searchNav.machineLearning.anomalyDetection.manageJobs',
                        {
                          defaultMessage: 'Manage jobs',
                        }
                      ),
                    },
                    { link: 'ml:anomalyExplorer' },
                    { link: 'ml:singleMetricViewer' },
                  ],
                  id: 'category-anomaly_detection',
                  title: i18n.translate(
                    'xpack.enterpriseSearch.searchNav.machineLearning.anomalyDetection',
                    {
                      defaultMessage: 'Anomaly detection',
                    }
                  ),
                },
                {
                  breadcrumbStatus: 'hidden',
                  children: [{ link: 'ml:resultExplorer' }, { link: 'ml:analyticsMap' }],
                  id: 'category-data_frame analytics',
                  title: i18n.translate(
                    'xpack.enterpriseSearch.searchNav.machineLearning.dataFrameAnalytics',
                    {
                      defaultMessage: 'Data frame analytics',
                    }
                  ),
                },
                {
                  breadcrumbStatus: 'hidden',
                  children: [
                    { link: 'ml:logRateAnalysis' },
                    { link: 'ml:logRateAnalysisPage', sideNavStatus: 'hidden' },
                    { link: 'ml:logPatternAnalysis' },
                    { link: 'ml:logPatternAnalysisPage', sideNavStatus: 'hidden' },
                    { link: 'ml:changePointDetections' },
                    { link: 'ml:changePointDetectionsPage', sideNavStatus: 'hidden' },
                  ],
                  id: 'category-aiops_labs',
                  title: i18n.translate(
                    'xpack.enterpriseSearch.searchNav.machineLearning.aiops_labs',
                    {
                      defaultMessage: 'AIOps labs',
                    }
                  ),
                },
              ],
              icon: 'productML',
              id: 'machine_learning',
              renderAs: 'panelOpener',
              title: i18n.translate('xpack.enterpriseSearch.searchNav.machineLearning', {
                defaultMessage: 'Machine Learning',
              }),
            },
            {
              children: [
                {
                  children: [
                    { link: 'management:index_management' },
                    { link: 'management:index_lifecycle_management' },
                    { link: 'management:snapshot_restore' },
                    { link: 'management:transform' },
                    { link: 'management:rollup_jobs' },
                  ],
                  title: i18n.translate('xpack.enterpriseSearch.searchNav.ingest.indices.title', {
                    defaultMessage: 'Indices and data streams',
                  }),
                },
                {
                  children: [
                    { link: 'management:ingest_pipelines' },
                    { link: 'management:pipelines' },
                  ],
                  title: i18n.translate('xpack.enterpriseSearch.searchNav.ingest.pipelines.title', {
                    defaultMessage: 'Ingest',
                  }),
                },
                {
                  children: [
                    { link: 'searchSynonyms:synonyms' },
                    { link: 'searchQueryRules' },
                    { link: 'searchPlayground' },
                  ],
                  id: 'search_relevance',
                  title: i18n.translate('xpack.enterpriseSearch.searchNav.ingest.relevance.title', {
                    defaultMessage: 'Relevance',
                  }),
                },
              ],
              icon: 'database',
              id: DATA_MANAGEMENT_NAV_ID,
              renderAs: 'panelOpener',
              title: i18n.translate('xpack.enterpriseSearch.searchNav.dataManagement', {
                defaultMessage: 'Data management',
              }),
            },
          ],
          footer: [
            {
              icon: 'rocket',
              id: 'search_getting_started',
              link: 'searchGettingStarted',
            },
            {
              getIsActive: ({ pathNameSerialized, prepend }) => {
                return pathNameSerialized.startsWith(prepend('/app/dev_tools'));
              },
              icon: 'code',
              id: 'dev_tools',
              link: 'dev_tools',
              title: i18n.translate('xpack.enterpriseSearch.searchNav.devTools', {
                defaultMessage: 'Developer Tools',
              }),
            },
            {
              children: [
                {
                  children: [
                    {
                      // We include this link here to ensure that the settings icon does not land on Stack Monitoring by default
                      // https://github.com/elastic/kibana/issues/241518
                      // And that the sidenav panel opens when user lands to legacy management landing page
                      // https://github.com/elastic/kibana/issues/240275
                      breadcrumbStatus: 'hidden',
                      link: 'management',
                      title: i18n.translate('xpack.enterpriseSearch.searchNav.management.home', {
                        defaultMessage: 'Home',
                      }),
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
                  id: 'stack_management_home',
                  title: '',
                },
                ...getAlertingV2ManagementNavPanel(core),
                {
                  children: [
                    { link: 'management:triggersActionsAlerts' },
                    { link: 'management:triggersActions' },
                    { link: 'management:triggersActionsConnectors' },
                    { link: 'management:reporting' },
                    { link: 'management:jobsListLink' },
                    { link: 'management:watcher' },
                    { link: 'management:maintenanceWindows' },
                  ],
                  title: i18n.translate('xpack.enterpriseSearch.searchNav.management.alerts', {
                    defaultMessage: 'Alerts and Insights',
                  }),
                },
                {
                  children: [
                    {
                      id: 'monitoring',
                      link: 'monitoring',
                    },
                    { badgeType: 'new', link: 'management:queryActivity' },
                  ],
                  title: i18n.translate(
                    'xpack.enterpriseSearch.searchNav.management.clusterPerformance',
                    {
                      defaultMessage: 'Cluster performance',
                    }
                  ),
                },
                {
                  children: [
                    { link: 'management:overview' },
                    { link: 'management:trained_models' },
                    { link: 'management:anomaly_detection' },
                    { link: 'management:analytics' },
                  ],
                  title: i18n.translate(
                    'xpack.enterpriseSearch.searchNav.management.machineLearning',
                    {
                      defaultMessage: 'Machine Learning',
                    }
                  ),
                },
                {
                  children: [
                    {
                      link: 'management:elastic_inference_service',
                    },
                    {
                      link: 'management:inference_endpoints',
                    },
                    {
                      link: 'management:model_settings',
                    },
                  ],
                  title: i18n.translate(
                    'xpack.enterpriseSearch.searchNav.management.modelManagement',
                    {
                      defaultMessage: 'Model Management',
                    }
                  ),
                },
                {
                  children: [
                    { link: 'management:genAiSettings' },
                    { link: 'management:evals' },
                    { link: 'management:aiAssistantManagementSelection' },
                  ],
                  title: i18n.translate('xpack.enterpriseSearch.searchNav.management.ai', {
                    defaultMessage: 'AI',
                  }),
                },
                {
                  children: [
                    { link: 'management:users' },
                    { link: 'management:roles' },
                    { link: 'management:api_keys' },
                    { link: 'management:role_mappings' },
                  ],
                  title: i18n.translate('xpack.enterpriseSearch.searchNav.management.security', {
                    defaultMessage: 'Security',
                  }),
                },
                {
                  children: [
                    { link: 'management:cross_cluster_replication' },
                    { link: 'management:remote_clusters' },
                  ],
                  title: i18n.translate('xpack.enterpriseSearch.searchNav.management.dataV2', {
                    defaultMessage: 'Data',
                  }),
                },
                {
                  children: [
                    { link: 'management:dataViews' },
                    { link: 'management:filesManagement' },
                    { link: 'management:objects' },
                    { link: 'management:tags' },
                    { link: 'management:search_sessions' },
                    { link: 'management:spaces' },
                    { link: 'management:settings' },
                  ],
                  title: i18n.translate('xpack.enterpriseSearch.searchNav.management.kibana', {
                    defaultMessage: 'Kibana',
                  }),
                },
                {
                  children: [
                    { link: 'management:license_management' },
                    { link: 'management:upgrade_assistant' },
                  ],
                  title: i18n.translate('xpack.enterpriseSearch.searchNav.management.stack', {
                    defaultMessage: 'Stack',
                  }),
                },
              ],
              icon: 'managementApp',
              id: STACK_MANAGEMENT_NAV_ID, // This id can't be changed as we use it to open the panel programmatically
              renderAs: 'panelOpener',
              title: i18n.translate('xpack.enterpriseSearch.searchNav.mngt', {
                defaultMessage: 'Stack Management',
              }),
            },
          ],
        };

        return navTree;
      })
    ),
    title,
  };
};
