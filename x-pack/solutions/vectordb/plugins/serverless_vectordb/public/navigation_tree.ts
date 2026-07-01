/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Location } from 'history';

import type { ApplicationStart } from '@kbn/core-application-browser';
import type { NavigationTreeDefinition } from '@kbn/core-chrome-browser';
import type { CoreStart } from '@kbn/core/public';
import { DATA_MANAGEMENT_NAV_ID } from '@kbn/deeplinks-management';
import { i18n } from '@kbn/i18n';
import { getAlertingV2ManagementNavPanel } from '@kbn/alerting-v2-utils';

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

const NAV_TITLE = i18n.translate('xpack.serverlessVectordb.nav.title', {
  defaultMessage: 'Vector DB',
});
const PERFORMANCE_TITLE = i18n.translate('xpack.serverlessVectordb.nav.performance', {
  defaultMessage: 'Performance',
});
const ALERTS_AND_INSIGHTS_TITLE = i18n.translate(
  'xpack.serverlessVectordb.nav.mngt.alertsAndInsights',
  {
    defaultMessage: 'Alerts and insights',
  }
);
const ACCESS_TITLE = i18n.translate('xpack.serverlessVectordb.nav.mngt.access', {
  defaultMessage: 'Access',
});
const CONTENT_TITLE = i18n.translate('xpack.serverlessVectordb.nav.mngt.content', {
  defaultMessage: 'Content',
});

const AI_TITLE = i18n.translate('xpack.serverlessVectordb.nav.adminAndSettings.ai.title', {
  defaultMessage: 'AI',
});

const PROJECT_PERFORMANCE_TITLE = i18n.translate(
  'xpack.serverlessVectordb.nav.adminAndSettings.projectPerformance.title',
  {
    defaultMessage: 'Project performance',
  }
);

export function createNavigationTree({
  core,
  showAiAssistant = true,
}: ApplicationStart & {
  core: CoreStart;
  showAiAssistant?: boolean;
}): NavigationTreeDefinition {
  return {
    body: [
      {
        icon: 'logoElasticsearch',
        link: 'vectordb',
        renderAs: 'home',
        title: NAV_TITLE,
        breadcrumbStatus: 'hidden',
      },
      {
        icon: 'productAgent',
        link: 'agent_builder',
      },
      {
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
        children: [
          {
            children: [
              { link: 'management:index_management', breadcrumbStatus: 'hidden' },
              { link: 'management:data_federation', breadcrumbStatus: 'hidden' },
              { link: 'management:index_lifecycle_management', breadcrumbStatus: 'hidden' },
              { link: 'management:snapshot_restore', breadcrumbStatus: 'hidden' },
              { link: 'management:transform', breadcrumbStatus: 'hidden' },
              { link: 'management:rollup_jobs', breadcrumbStatus: 'hidden' },
              { link: 'management:data_quality', breadcrumbStatus: 'hidden' },
              { link: 'management:data_usage', breadcrumbStatus: 'hidden' },
            ],
            title: i18n.translate('xpack.serverlessVectordb.nav.ingest.indices.title', {
              defaultMessage: 'Indices and data streams',
            }),
          },
          {
            children: [
              { link: 'management:ingest_pipelines', breadcrumbStatus: 'hidden' },
              { link: 'management:pipelines', breadcrumbStatus: 'hidden' },
            ],
            title: i18n.translate('xpack.serverlessVectordb.nav.ingest.pipelines.title', {
              defaultMessage: 'Ingest',
            }),
          },
        ],
        icon: 'database',
        id: DATA_MANAGEMENT_NAV_ID,
        renderAs: 'panelOpener',
        title: i18n.translate('xpack.serverlessVectordb.nav.dataManagement', {
          defaultMessage: 'Data management',
        }),
      },
    ],
    footer: [
      {
        id: 'vectordb_getting_started',
        icon: 'rocket',
        link: 'vectordb:tutorials',
        title: i18n.translate('xpack.serverlessVectordb.nav.tutorials', {
          defaultMessage: 'Getting started',
        }),
      },
      {
        id: 'dev_tools',
        title: i18n.translate('xpack.serverlessVectordb.nav.developerTools', {
          defaultMessage: 'Developer Tools',
        }),
        icon: 'code',
        link: 'dev_tools:console',
        getIsActive: ({ pathNameSerialized, prepend }) => {
          return pathNameSerialized.startsWith(prepend('/app/dev_tools'));
        },
      },
      {
        id: 'admin_and_settings',
        title: i18n.translate('xpack.serverlessVectordb.nav.adminAndSettings', {
          defaultMessage: 'Admin and Settings',
        }),
        icon: 'gear',
        breadcrumbStatus: 'hidden',
        renderAs: 'panelOpener',
        children: [
          {
            id: 'settings_access',
            title: ACCESS_TITLE,
            children: [
              { link: 'management:api_keys', breadcrumbStatus: 'hidden' },
              { link: 'management:roles', breadcrumbStatus: 'hidden' },
            ],
          },
          {
            id: 'organization',
            title: i18n.translate('xpack.serverlessVectordb.nav.adminAndSettings.org.title', {
              defaultMessage: 'Organization',
            }),
            children: [
              {
                id: 'cloudLinkBilling',
                cloudLink: 'billingAndSub',
              },
              {
                id: 'cloudLinkDeployment',
                cloudLink: 'deployment',
                title: PERFORMANCE_TITLE,
              },
              {
                cloudLink: 'userAndRoles',
              },
            ],
          },
          ...getAlertingV2ManagementNavPanel(core),
          {
            id: 'settings_alerts',
            title: ALERTS_AND_INSIGHTS_TITLE,
            breadcrumbStatus: 'hidden',
            children: [
              { link: 'management:triggersActionsAlerts', breadcrumbStatus: 'hidden' },
              { link: 'rules', breadcrumbStatus: 'hidden' },
              { link: 'management:triggersActionsConnectors', breadcrumbStatus: 'hidden' },
            ],
          },
          {
            id: 'settings_project_performance',
            title: PROJECT_PERFORMANCE_TITLE,
            breadcrumbStatus: 'hidden',
            children: [
              {
                link: 'management:queryActivity',
                breadcrumbStatus: 'hidden',
                badgeType: 'new',
              },
            ],
          },
          {
            id: 'settings_model_management',
            title: i18n.translate('xpack.serverlessVectordb.nav.adminAndSettings.modelManagement', {
              defaultMessage: 'Model Management',
            }),
            children: [
              {
                id: 'searchInferenceEndpointsElasticInferenceService',
                link: 'management:elastic_inference_service',
              },
              {
                id: 'searchInferenceEndpoints',
                link: 'management:inference_endpoints',
              },
              {
                id: 'searchInferenceEndpointsModelSettings',
                link: 'management:model_settings',
              },
            ],
          },
          {
            id: 'settings_ai',
            title: AI_TITLE,
            children: [
              { link: 'management:genAiSettings', breadcrumbStatus: 'hidden' },
              { link: 'management:evals', breadcrumbStatus: 'hidden' },
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
          {
            id: 'settings_content',
            title: CONTENT_TITLE,
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
            title: i18n.translate('xpack.serverlessVectordb.nav.adminAndSettings.settings.title', {
              defaultMessage: 'Settings',
            }),
            breadcrumbStatus: 'hidden',
            children: [{ link: 'management:settings', breadcrumbStatus: 'hidden' }],
          },
          {
            link: 'management',
            sideNavStatus: 'hidden',
          },
        ],
      },
    ],
  };
}
