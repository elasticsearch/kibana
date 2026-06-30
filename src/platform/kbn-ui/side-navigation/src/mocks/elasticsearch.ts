/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { MenuItem } from '../../types';

export const LOGO = {
  href: '/elasticsearch',
  id: 'elasticsearch',
  label: 'Elasticsearch',
  iconType: 'logoElasticsearch',
};

export const PRIMARY_MENU_ITEMS: MenuItem[] = [
  {
    id: 'discover',
    label: 'Discover',
    iconType: 'discoverApp',
    href: '/discover',
  },
  {
    id: 'dashboards',
    label: 'Dashboards',
    iconType: 'dashboardApp',
    href: '/dashboards',
  },
  {
    id: 'index_management',
    label: 'Index management',
    iconType: 'indexManagementApp',
    href: '/index-management',
  },
  {
    id: 'connectors',
    label: 'Connectors',
    iconType: 'info',
    href: '/connectors',
  },
  {
    id: 'web_crawlers',
    label: 'Web crawlers',
    iconType: 'managementApp',
    href: '/web-crawlers',
    badgeType: 'new',
  },
  {
    id: 'dev_tools',
    label: 'Dev tools',
    iconType: 'devToolsApp',
    href: '/dev-tools',
  },
  {
    id: 'playground',
    label: 'Playground',
    iconType: 'commandLine',
    href: '/playground',
  },
  {
    id: 'inference_endpoints',
    label: 'Inference endpoints',
    iconType: 'machineLearningApp',
    href: '/inference-endpoints',
  },
  {
    id: 'synonyms',
    label: 'Synonyms',
    iconType: 'indexPatternApp',
    href: '/synonyms',
  },
  {
    id: 'maps',
    label: 'Maps',
    iconType: 'gisApp',
    href: '/maps',
  },
];

export const PRIMARY_MENU_FOOTER_ITEMS: MenuItem[] = [
  {
    id: 'getting_started',
    label: 'Getting started',
    iconType: 'rocket',
    href: '/getting-started',
  },
  {
    id: 'developer_tools',
    label: 'Developer tools',
    iconType: 'code',
    href: '/developer-tools',
  },
  {
    id: 'project-settings',
    label: 'Settings',
    iconType: 'gear',
    href: '/settings/project/settings',
    sections: [
      {
        id: 'project',
        label: 'Project',
        items: [
          {
            id: 'project-performance',
            label: 'Performance',
            href: '/settings/project/performance',
            badgeType: 'new',
          },
          {
            id: 'project-integrations',
            label: 'Integrations',
            href: '/settings/project/integrations',
            badgeType: 'new',
          },
          {
            id: 'project-fleet',
            label: 'Fleet',
            href: '/settings/project/fleet',
          },
        ],
      },
      {
        id: 'data',
        label: 'Data',
        items: [
          {
            id: 'data-ingest-pipelines',
            label: 'Ingest pipelines',
            href: '/settings/data/ingest-pipelines',
          },
          {
            id: 'data-logstash-pipelines',
            label: 'Logstash pipelines',
            href: '/settings/data/logstash-pipelines',
          },
          {
            id: 'data-index-management',
            label: 'Index management',
            href: '/settings/data/index-management',
          },
          {
            id: 'data-transforms',
            label: 'Transforms',
            href: '/settings/data/transforms',
          },
          {
            id: 'data-views',
            label: 'Data views',
            href: '/settings/data/views',
          },
          {
            id: 'data-set-quality',
            label: 'Data set quality',
            href: '/settings/data/set-quality',
          },
          {
            id: 'data-usage',
            label: 'Data usage',
            href: '/settings/data/usage',
          },
        ],
      },
      {
        id: 'access',
        label: 'Access',
        items: [
          {
            id: 'access-org-members',
            label: 'Org members',
            href: '/settings/access/org-members',
            isExternal: true,
          },
          {
            id: 'access-billing',
            label: 'Billing and subscriptions',
            href: '/settings/access/billing',
            isExternal: true,
          },
          {
            id: 'access-api-keys',
            label: 'API keys',
            href: '/settings/access/api-keys',
          },
          {
            id: 'access-users',
            label: 'Users',
            href: '/settings/access/users',
          },
          {
            id: 'access-roles',
            label: 'Roles',
            href: '/settings/access/roles',
          },
          {
            id: 'access-role-mappings',
            label: 'Role mappings',
            href: '/settings/access/role-mappings',
          },
          {
            id: 'access-spaces',
            label: 'Spaces',
            href: '/settings/access/spaces',
          },
        ],
      },
      {
        id: 'alerts_and_insights',
        label: 'Alerts and insights',
        items: [
          {
            id: 'alerts-rules',
            label: 'Rules',
            href: '/settings/alerts/rules',
          },
          {
            id: 'alerts-connectors',
            label: 'Connectors',
            href: '/settings/alerts/connectors',
          },
          {
            id: 'alerts-maintenance-windows',
            label: 'Maintenance windows',
            href: '/settings/alerts/maintenance-windows',
          },
          {
            id: 'alerts-entity-risk-score',
            label: 'Entity risk score',
            href: '/settings/alerts/entity-risk-score',
          },
          {
            id: 'alerts-entity-store',
            label: 'Entity store',
            href: '/settings/alerts/entity-store',
          },
        ],
      },
      {
        id: 'machine_learning',
        label: 'Machine learning',
        items: [
          {
            id: 'ml-overview',
            label: 'Overview',
            href: '/settings/ml/overview',
          },
          {
            id: 'ml-anomaly-detection',
            label: 'Anomaly detection jobs',
            href: '/settings/ml/anomaly-detection',
          },
          {
            id: 'ml-data-frame',
            label: 'Data frame analytics jobs',
            href: '/settings/ml/data-frame',
          },
          {
            id: 'ml-trained-models',
            label: 'Trained models',
            href: '/settings/ml/trained-models',
          },
        ],
      },
      {
        id: 'model_management',
        label: 'Model Management',
        items: [
          {
            id: 'elastic-inference',
            label: 'Elastic Inference',
            href: '/settings/model-management/elastic-inference',
          },
          {
            id: 'external-inference',
            label: 'External Inference',
            href: '/settings/model-management/external-inference',
          },
          {
            id: 'feature-settings',
            label: 'Feature Settings',
            href: '/settings/model-management/feature-settings',
          },
        ],
      },
      {
        id: 'gen_ai',
        label: 'Gen AI',
        items: [
          {
            id: 'gen-ai-settings',
            label: 'General AI settings',
            href: '/settings/gen-ai/settings',
          },
          {
            id: 'gen-ai-assistant',
            label: 'AI assistant',
            href: '/settings/gen-ai/assistant',
          },
        ],
      },
      {
        id: 'assets',
        label: 'Assets',
        items: [
          {
            id: 'assets-saved-objects',
            label: 'Saved objects',
            href: '/settings/assets/saved-objects',
          },
          {
            id: 'assets-files',
            label: 'Files',
            href: '/settings/assets/files',
          },
          { id: 'assets-tags', label: 'Tags', href: '/settings/assets/tags' },
          {
            id: 'assets-reports',
            label: 'Reports',
            href: '/settings/assets/reports',
          },
        ],
      },
      {
        id: 'platform',
        label: 'Platform',
        items: [
          {
            id: 'platform-ai-assistant',
            label: 'AI assistant',
            href: '/settings/platform/ai-assistant',
          },
          {
            id: 'platform-advanced-settings',
            label: 'Advanced settings',
            href: '/settings/platform/advanced-settings',
          },
        ],
      },
    ],
  },
];

export const elasticsearchMock = {
  logo: LOGO,
  navItems: {
    primaryItems: PRIMARY_MENU_ITEMS,
    overflowItems: [],
    footerItems: PRIMARY_MENU_FOOTER_ITEMS,
  },
};
