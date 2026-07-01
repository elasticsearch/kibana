/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core/server';
import type { KibanaFeatureConfig, SubFeatureConfig } from '../common';

export interface BuildOSSFeaturesParams {
  savedObjectTypes: string[];
  includeReporting: boolean;
}

export const buildOSSFeatures = ({
  savedObjectTypes,
  includeReporting,
}: BuildOSSFeaturesParams): KibanaFeatureConfig[] => {
  return [
    {
      deprecated: {
        notice: i18n.translate('xpack.features.discoverFeatureDeprecationNotice', {
          defaultMessage:
            'The Discover V1 privilege has been deprecated and replaced with a Discover V2 privilege in order to improve saved query management. See {link} for more details.',
          values: { link: 'https://github.com/elastic/kibana/pull/202863' },
        }),
        replacedBy: ['discover_v2'],
      },
      id: 'discover',
      order: 100,
      ...getBaseDiscoverFeature({ includeReporting, version: 'v1' }),
    },
    {
      id: 'discover_v2',
      order: 101,
      ...getBaseDiscoverFeature({ includeReporting, version: 'v2' }),
    },
    {
      deprecated: {
        notice: i18n.translate('xpack.features.visualizeFeatureDeprecationNotice', {
          defaultMessage:
            'The Visualize library V1 privilege has been deprecated and replaced with a Visualize library V2 privilege in order to improve saved query management. See {link} for more details.',
          values: { link: 'https://github.com/elastic/kibana/pull/202863' },
        }),
        replacedBy: ['visualize_v2'],
      },
      id: 'visualize',
      order: 700,
      ...getBaseVisualizeFeature({ includeReporting, version: 'v1' }),
    },
    {
      id: 'visualize_v2',
      order: 701,
      ...getBaseVisualizeFeature({ includeReporting, version: 'v2' }),
    },
    {
      deprecated: {
        notice: i18n.translate('xpack.features.dashboardFeatureDeprecationNotice', {
          defaultMessage:
            'The Dashboard V1 privilege has been deprecated and replaced with a Dashboard V2 privilege in order to improve saved query management. See {link} for more details.',
          values: { link: 'https://github.com/elastic/kibana/pull/202863' },
        }),
        replacedBy: ['dashboard_v2'],
      },
      id: 'dashboard',
      order: 200,
      ...getBaseDashboardFeature({ includeReporting, version: 'v1' }),
    },
    {
      id: 'dashboard_v2',
      order: 201,
      ...getBaseDashboardFeature({ includeReporting, version: 'v2' }),
    },
    {
      id: 'dev_tools',
      name: i18n.translate('xpack.features.devToolsFeatureName', {
        defaultMessage: 'Dev Tools',
      }),
      order: 1300,
      category: DEFAULT_APP_CATEGORIES.management,
      app: ['dev_tools', 'kibana'],
      catalogue: ['console', 'searchprofiler', 'grokdebugger'],
      privileges: {
        all: {
          app: ['dev_tools', 'kibana'],
          catalogue: ['console', 'searchprofiler', 'grokdebugger'],
          api: ['console'],
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['show', 'save'],
        },
        read: {
          app: ['dev_tools', 'kibana'],
          catalogue: ['console', 'searchprofiler', 'grokdebugger'],
          api: ['console'],
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['show'],
        },
      },
      privilegesTooltip: i18n.translate('xpack.features.devToolsPrivilegesTooltip', {
        defaultMessage:
          'User should also be granted the appropriate Elasticsearch cluster and index privileges',
      }),
    },
    {
      id: 'advancedSettings',
      name: i18n.translate('xpack.features.advancedSettingsFeatureName', {
        defaultMessage: 'Advanced Settings',
      }),
      order: 1500,
      category: DEFAULT_APP_CATEGORIES.management,
      app: ['kibana'],
      catalogue: ['advanced_settings'],
      management: {
        kibana: ['settings'],
      },
      privileges: {
        all: {
          app: ['kibana'],
          catalogue: ['advanced_settings'],
          management: {
            kibana: ['settings'],
          },
          savedObject: {
            all: ['config'],
            read: [],
          },
          ui: ['save'],
          api: ['manage_advanced_settings'],
        },
        read: {
          app: ['kibana'],
          catalogue: ['advanced_settings'],
          management: {
            kibana: ['settings'],
          },
          savedObject: {
            all: [],
            read: [],
          },
          ui: [],
        },
      },
    },
    {
      id: 'indexPatterns',
      name: i18n.translate('xpack.features.dataViewFeatureName', {
        defaultMessage: 'Data View Management',
      }),
      order: 1600,
      category: DEFAULT_APP_CATEGORIES.management,
      app: ['kibana'],
      catalogue: ['indexPatterns'],
      management: {
        kibana: ['indexPatterns'],
      },
      privileges: {
        all: {
          app: ['kibana'],
          catalogue: ['indexPatterns'],
          management: {
            kibana: ['indexPatterns'],
          },
          savedObject: {
            all: ['index-pattern'],
            read: [],
          },
          ui: ['save'],
          api: ['indexPatterns:manage'],
        },
        read: {
          app: ['kibana'],
          catalogue: ['indexPatterns'],
          management: {
            kibana: ['indexPatterns'],
          },
          savedObject: {
            all: [],
            read: ['index-pattern'],
          },
          ui: [],
        },
      },
    },
    {
      id: 'filesManagement',
      name: i18n.translate('xpack.features.filesManagementFeatureName', {
        defaultMessage: 'Files Management',
      }),
      order: 1600,
      category: DEFAULT_APP_CATEGORIES.management,
      app: ['kibana'],
      catalogue: [],
      management: {
        kibana: ['filesManagement'],
      },
      privileges: {
        all: {
          app: ['kibana'],
          management: {
            kibana: ['filesManagement'],
          },
          savedObject: {
            all: ['file', 'fileShare'],
            read: [],
          },
          ui: [],
          api: ['files:manageFiles', 'files:defaultImage'],
        },
        read: {
          app: ['kibana'],
          management: {
            kibana: ['filesManagement'],
          },
          savedObject: {
            all: [],
            read: ['file', 'fileShare'],
          },
          ui: [],
          api: ['files:manageFiles', 'files:defaultImage'],
        },
      },
    },
    {
      id: 'data_sets',
      name: i18n.translate('xpack.features.dataSetsFeatureName', {
        defaultMessage: 'Data sets',
      }),
      order: 1601,
      category: DEFAULT_APP_CATEGORIES.management,
      app: ['kibana'],
      catalogue: [],
      management: {
        kibana: ['data_sets'],
      },
      privileges: {
        all: {
          app: ['kibana'],
          management: {
            kibana: ['data_sets'],
          },
          savedObject: {
            all: [],
            read: [],
          },
          ui: [],
        },
        read: {
          app: ['kibana'],
          management: {
            kibana: ['data_sets'],
          },
          savedObject: {
            all: [],
            read: [],
          },
          ui: [],
        },
      },
    },
    {
      id: 'filesSharedImage',
      name: i18n.translate('xpack.features.filesSharedImagesFeatureName', {
        defaultMessage: 'Shared images',
      }),
      order: 1600,
      category: DEFAULT_APP_CATEGORIES.management,
      app: ['kibana'],
      catalogue: [],
      privilegesTooltip: i18n.translate('xpack.features.filesSharedImagesPrivilegesTooltip', {
        defaultMessage: 'Required to access images stored in Kibana.',
      }),
      privileges: {
        all: {
          app: ['kibana'],
          savedObject: {
            all: ['file'],
            read: [],
          },
          ui: [],
          api: ['files:defaultImage'],
        },
        read: {
          app: ['kibana'],
          savedObject: {
            all: [],
            read: ['file'],
          },
          ui: [],
          api: ['files:defaultImage'],
        },
      },
    },
    {
      id: 'savedObjectsManagement',
      name: i18n.translate('xpack.features.savedObjectsManagementFeatureName', {
        defaultMessage: 'Saved Objects Management',
      }),
      order: 1700,
      category: DEFAULT_APP_CATEGORIES.management,
      app: ['kibana'],
      catalogue: ['saved_objects'],
      management: {
        kibana: ['objects'],
      },
      privileges: {
        all: {
          app: ['kibana'],
          catalogue: ['saved_objects'],
          management: {
            kibana: ['objects'],
          },
          api: ['copySavedObjectsToSpaces'],
          savedObject: {
            all: [...savedObjectTypes],
            read: [],
          },
          ui: ['read', 'edit', 'delete', 'copyIntoSpace', 'shareIntoSpace'],
        },
        read: {
          app: ['kibana'],
          catalogue: ['saved_objects'],
          management: {
            kibana: ['objects'],
          },
          api: ['copySavedObjectsToSpaces'],
          savedObject: {
            all: [],
            read: [...savedObjectTypes],
          },
          ui: ['read'],
        },
      },
    },
    {
      id: 'savedQueryManagement',
      name: i18n.translate('xpack.features.savedQueryManagementFeatureName', {
        defaultMessage: 'Saved Query Management',
      }),
      order: 1750,
      category: DEFAULT_APP_CATEGORIES.management,
      app: ['kibana'],
      catalogue: [],
      privilegesTooltip: i18n.translate('xpack.features.savedQueryManagementTooltip', {
        defaultMessage: 'Controls access to saved queries across Kibana',
      }),
      privileges: {
        all: {
          app: ['kibana'],
          catalogue: [],
          savedObject: {
            all: ['query'],
            read: [],
          },
          ui: ['showQueries', 'saveQuery'],
          api: ['savedQuery:manage', 'savedQuery:read'],
        },
        read: {
          savedObject: {
            all: [],
            read: ['query'],
          },
          ui: ['showQueries'],
          api: ['savedQuery:read'],
        },
      },
    },
  ];
};

const getBaseDiscoverFeature = ({
  includeReporting,
  version,
}: {
  includeReporting: boolean;
  version: 'v1' | 'v2';
}): Omit<KibanaFeatureConfig, 'id' | 'order'> => {
  const apiAllPrivileges = ['fileUpload:analyzeFile'];
  const savedObjectAllPrivileges = ['search'];
  const uiAllPrivileges = ['show', 'save'];
  const apiReadPrivileges = [];
  const savedObjectReadPrivileges = ['index-pattern', 'search'];

  if (version === 'v1') {
    apiAllPrivileges.push('savedQuery:manage', 'savedQuery:read');
    savedObjectAllPrivileges.push('query');
    uiAllPrivileges.push('saveQuery');
    apiReadPrivileges.push('savedQuery:read');
    savedObjectReadPrivileges.push('query');
  }

  return {
    name: i18n.translate('xpack.features.discoverFeatureName', {
      defaultMessage: 'Discover',
    }),
    management: {
      kibana: ['search_sessions'],
      ...(includeReporting ? { insightsAndAlerting: ['reporting'] } : {}),
    },
    category: DEFAULT_APP_CATEGORIES.kibana,
    app: ['discover', 'kibana'],
    catalogue: ['discover'],
    privileges: {
      all: {
        app: ['discover', 'kibana'],
        api: apiAllPrivileges,
        catalogue: ['discover'],
        savedObject: {
          all: savedObjectAllPrivileges,
          read: ['index-pattern'],
        },
        ui: uiAllPrivileges,
        ...(version === 'v1' && {
          replacedBy: {
            default: [
              { feature: 'discover_v2', privileges: ['all'] },
              { feature: 'savedQueryManagement', privileges: ['all'] },
            ],
            minimal: [
              { feature: 'discover_v2', privileges: ['minimal_all'] },
              { feature: 'savedQueryManagement', privileges: ['minimal_all'] },
            ],
          },
        }),
      },
      read: {
        app: ['discover', 'kibana'],
        api: apiReadPrivileges,
        catalogue: ['discover'],
        savedObject: {
          all: [],
          read: savedObjectReadPrivileges,
        },
        ui: ['show'],
        ...(version === 'v1' && {
          replacedBy: {
            default: [
              { feature: 'discover_v2', privileges: ['read'] },
              { feature: 'savedQueryManagement', privileges: ['read'] },
            ],
            minimal: [
              { feature: 'discover_v2', privileges: ['minimal_read'] },
              { feature: 'savedQueryManagement', privileges: ['minimal_read'] },
            ],
          },
        }),
      },
    },
    subFeatures: [
      {
        name: i18n.translate('xpack.features.ossFeatures.discoverShortUrlSubFeatureName', {
          defaultMessage: 'Short URLs',
        }),
        privilegeGroups: [
          {
            groupType: 'independent',
            privileges: [
              {
                id: 'url_create',
                name: i18n.translate(
                  'xpack.features.ossFeatures.discoverCreateShortUrlPrivilegeName',
                  {
                    defaultMessage: 'Create Short URLs',
                  }
                ),
                includeIn: 'all',
                savedObject: {
                  all: ['url'],
                  read: [],
                },
                ui: ['createShortUrl'],
                ...(version === 'v1' && {
                  replacedBy: [{ feature: 'discover_v2', privileges: ['url_create'] }],
                }),
              },
            ],
          },
        ],
      },
      {
        name: i18n.translate('xpack.features.ossFeatures.discoverSearchSessionsFeatureName', {
          defaultMessage: 'Store Background search',
        }),
        privilegeGroups: [
          {
            groupType: 'independent',
            privileges: [
              {
                id: 'store_search_session',
                name: i18n.translate(
                  'xpack.features.ossFeatures.discoverStoreSearchSessionsPrivilegeName',
                  {
                    defaultMessage: 'Store Background search',
                  }
                ),
                includeIn: 'all',
                savedObject: {
                  all: ['search-session'],
                  read: [],
                },
                ui: ['storeSearchSession'],
                management: {
                  kibana: ['search_sessions'],
                },
                api: ['store_search_session'],
                ...(version === 'v1' && {
                  replacedBy: [{ feature: 'discover_v2', privileges: ['store_search_session'] }],
                }),
              },
            ],
          },
        ],
      },
      ...(includeReporting ? [reportingFeatures.getDiscoverReporting(version)] : []),
    ],
  };
};

const getBaseVisualizeFeature = ({
  includeReporting,
  version,
}: {
  includeReporting: boolean;
  version: 'v1' | 'v2';
}): Omit<KibanaFeatureConfig, 'id' | 'order'> => {
  const apiAllPrivileges = [];
  const savedObjectAllPrivileges = ['visualization', 'lens'];
  const uiAllPrivileges = ['show', 'delete', 'save'];
  const apiReadPrivileges = [];
  const savedObjectReadPrivileges = ['index-pattern', 'search', 'visualization', 'lens', 'tag'];

  if (version === 'v1') {
    apiAllPrivileges.push('savedQuery:manage', 'savedQuery:read');
    savedObjectAllPrivileges.push('query');
    uiAllPrivileges.push('saveQuery');
    apiReadPrivileges.push('savedQuery:read');
    savedObjectReadPrivileges.push('query');
  }

  return {
    name: i18n.translate('xpack.features.visualizeFeatureName', {
      defaultMessage: 'Visualize library',
    }),
    management: {
      ...(includeReporting ? { insightsAndAlerting: ['reporting'] } : {}),
    },
    category: DEFAULT_APP_CATEGORIES.kibana,
    app: ['visualize', 'lens', 'kibana'],
    catalogue: ['visualize'],
    privileges: {
      all: {
        app: ['visualize', 'lens', 'kibana'],
        api: apiAllPrivileges,
        catalogue: ['visualize'],
        savedObject: {
          all: savedObjectAllPrivileges,
          read: ['index-pattern', 'search', 'tag'],
        },
        ui: uiAllPrivileges,
        ...(version === 'v1' && {
          replacedBy: {
            default: [
              { feature: 'visualize_v2', privileges: ['all'] },
              { feature: 'savedQueryManagement', privileges: ['all'] },
            ],
            minimal: [
              { feature: 'visualize_v2', privileges: ['minimal_all'] },
              { feature: 'savedQueryManagement', privileges: ['minimal_all'] },
            ],
          },
        }),
      },
      read: {
        app: ['visualize', 'lens', 'kibana'],
        api: apiReadPrivileges,
        catalogue: ['visualize'],
        savedObject: {
          all: [],
          read: savedObjectReadPrivileges,
        },
        ui: ['show'],
        ...(version === 'v1' && {
          replacedBy: {
            default: [
              { feature: 'visualize_v2', privileges: ['read'] },
              { feature: 'savedQueryManagement', privileges: ['read'] },
            ],
            minimal: [
              { feature: 'visualize_v2', privileges: ['minimal_read'] },
              { feature: 'savedQueryManagement', privileges: ['minimal_read'] },
            ],
          },
        }),
      },
    },
    subFeatures: [
      {
        name: i18n.translate('xpack.features.ossFeatures.visualizeShortUrlSubFeatureName', {
          defaultMessage: 'Short URLs',
        }),
        privilegeGroups: [
          {
            groupType: 'independent',
            privileges: [
              {
                id: 'url_create',
                name: i18n.translate(
                  'xpack.features.ossFeatures.visualizeCreateShortUrlPrivilegeName',
                  {
                    defaultMessage: 'Create Short URLs',
                  }
                ),
                includeIn: 'all',
                savedObject: {
                  all: ['url'],
                  read: [],
                },
                ui: ['createShortUrl'],
                ...(version === 'v1' && {
                  replacedBy: [{ feature: 'visualize_v2', privileges: ['url_create'] }],
                }),
              },
            ],
          },
        ],
      },
      ...(includeReporting ? [reportingFeatures.getVisualizeReporting(version)] : []),
    ],
  };
};

const getBaseDashboardFeature = ({
  includeReporting,
  version,
}: {
  includeReporting: boolean;
  version: 'v1' | 'v2';
}): Omit<KibanaFeatureConfig, 'id' | 'order'> => {
  const apiAllPrivileges = ['bulkGetUserProfiles', 'dashboardUsageStats'];
  const savedObjectAllPrivileges = ['dashboard', 'markdown'];
  const uiAllPrivileges = ['createNew', 'show', 'showWriteControls'];
  const apiReadPrivileges = ['bulkGetUserProfiles', 'dashboardUsageStats'];
  const savedObjectReadPrivileges = [
    'index-pattern',
    'search',
    'visualization',
    'canvas-workpad',
    'event-annotation-group',
    'lens',
    'links',
    'map',
    'dashboard',
    'tag',
    'markdown',
  ];

  if (version === 'v1') {
    apiAllPrivileges.push('savedQuery:manage', 'savedQuery:read');
    savedObjectAllPrivileges.push('query');
    uiAllPrivileges.push('saveQuery');
    apiReadPrivileges.push('savedQuery:read');
    savedObjectReadPrivileges.push('query');
  }

  return {
    name: i18n.translate('xpack.features.dashboardFeatureName', {
      defaultMessage: 'Dashboard',
    }),
    management: {
      kibana: ['search_sessions'],
      ...(includeReporting ? { insightsAndAlerting: ['reporting'] } : {}),
    },
    category: DEFAULT_APP_CATEGORIES.kibana,
    app: ['dashboards', 'kibana'],
    catalogue: ['dashboard'],
    privileges: {
      all: {
        app: ['dashboards', 'kibana'],
        catalogue: ['dashboard'],
        savedObject: {
          all: savedObjectAllPrivileges,
          read: [
            'index-pattern',
            'search',
            'visualization',
            'canvas-workpad',
            'event-annotation-group',
            'lens',
            'links',
            'map',
            'tag',
          ],
        },
        ui: uiAllPrivileges,
        api: apiAllPrivileges,
        ...(version === 'v1' && {
          replacedBy: {
            default: [
              { feature: 'dashboard_v2', privileges: ['all'] },
              { feature: 'savedQueryManagement', privileges: ['all'] },
            ],
            minimal: [
              { feature: 'dashboard_v2', privileges: ['minimal_all'] },
              { feature: 'savedQueryManagement', privileges: ['minimal_all'] },
            ],
          },
        }),
      },
      read: {
        app: ['dashboards', 'kibana'],
        catalogue: ['dashboard'],
        savedObject: {
          all: [],
          read: savedObjectReadPrivileges,
        },
        ui: ['show'],
        api: apiReadPrivileges,
        ...(version === 'v1' && {
          replacedBy: {
            default: [
              { feature: 'dashboard_v2', privileges: ['read'] },
              { feature: 'savedQueryManagement', privileges: ['read'] },
            ],
            minimal: [
              { feature: 'dashboard_v2', privileges: ['minimal_read'] },
              { feature: 'savedQueryManagement', privileges: ['minimal_read'] },
            ],
          },
        }),
      },
    },
    subFeatures: [
      {
        name: i18n.translate('xpack.features.ossFeatures.dashboardShortUrlSubFeatureName', {
          defaultMessage: 'Short URLs',
        }),
        privilegeGroups: [
          {
            groupType: 'independent',
            privileges: [
              {
                id: 'url_create',
                name: i18n.translate(
                  'xpack.features.ossFeatures.dashboardCreateShortUrlPrivilegeName',
                  {
                    defaultMessage: 'Create Short URLs',
                  }
                ),
                includeIn: 'all',
                savedObject: {
                  all: ['url'],
                  read: [],
                },
                ui: ['createShortUrl'],
                ...(version === 'v1' && {
                  replacedBy: [{ feature: 'dashboard_v2', privileges: ['url_create'] }],
                }),
              },
            ],
          },
        ],
      },
      {
        name: i18n.translate('xpack.features.ossFeatures.dashboardSearchSessionsFeatureName', {
          defaultMessage: 'Store Background search',
        }),
        privilegeGroups: [
          {
            groupType: 'independent',
            privileges: [
              {
                id: 'store_search_session',
                name: i18n.translate(
                  'xpack.features.ossFeatures.dashboardStoreSearchSessionsPrivilegeName',
                  {
                    defaultMessage: 'Store Background search',
                  }
                ),
                includeIn: 'all',
                savedObject: {
                  all: ['search-session'],
                  read: [],
                },
                ui: ['storeSearchSession'],
                management: {
                  kibana: ['search_sessions'],
                },
                api: ['store_search_session'],
                ...(version === 'v1' && {
                  replacedBy: [{ feature: 'dashboard_v2', privileges: ['store_search_session'] }],
                }),
              },
            ],
          },
        ],
      },
      ...(includeReporting ? [reportingFeatures.getDashboardReporting(version)] : []),
    ],
  };
};

const reportingPrivilegeGroupName = i18n.translate(
  'xpack.features.ossFeatures.reporting.reportingTitle',
  {
    defaultMessage: 'Reporting',
  }
);

const reportingFeatures: {
  getDiscoverReporting: (version: 'v1' | 'v2') => SubFeatureConfig;
  getDashboardReporting: (version: 'v1' | 'v2') => SubFeatureConfig;
  getVisualizeReporting: (version: 'v1' | 'v2') => SubFeatureConfig;
} = {
  getDiscoverReporting: (version) => ({
    name: reportingPrivilegeGroupName,
    privilegeGroups: [
      {
        groupType: 'independent',
        privileges: [
          {
            id: 'generate_report',
            name: i18n.translate('xpack.features.ossFeatures.reporting.discoverGenerateCSV', {
              defaultMessage: 'Generate CSV reports',
            }),
            includeIn: 'all',
            savedObject: { all: ['scheduled_report'], read: [] },
            management: { insightsAndAlerting: ['reporting'] },
            api: ['generateReport'],
            ui: ['generateCsv'],
            ...(version === 'v1' && {
              replacedBy: [{ feature: 'discover_v2', privileges: ['generate_report'] }],
            }),
          },
        ],
      },
    ],
  }),
  getDashboardReporting: (version) => ({
    name: reportingPrivilegeGroupName,
    privilegeGroups: [
      {
        groupType: 'independent',
        privileges: [
          {
            id: 'generate_report',
            name: i18n.translate(
              'xpack.features.ossFeatures.reporting.dashboardGenerateScreenshot',
              {
                defaultMessage: 'Generate PDF or PNG reports',
              }
            ),
            includeIn: 'all',
            minimumLicense: 'gold',
            savedObject: { all: ['scheduled_report'], read: [] },
            management: { insightsAndAlerting: ['reporting'] },
            api: ['generateReport'],
            ui: ['generateScreenshot'],
            ...(version === 'v1' && {
              replacedBy: [{ feature: 'dashboard_v2', privileges: ['generate_report'] }],
            }),
          },
          {
            id: 'download_csv_report',
            name: i18n.translate('xpack.features.ossFeatures.reporting.dashboardDownloadCSV', {
              defaultMessage: 'Generate CSV reports from Discover session panels',
            }),
            includeIn: 'all',
            savedObject: { all: ['scheduled_report'], read: [] },
            management: { insightsAndAlerting: ['reporting'] },
            api: ['downloadCsv'],
            ui: ['downloadCsv'],
            ...(version === 'v1' && {
              replacedBy: [{ feature: 'dashboard_v2', privileges: ['download_csv_report'] }],
            }),
          },
        ],
      },
    ],
  }),
  getVisualizeReporting: (version) => ({
    name: reportingPrivilegeGroupName,
    privilegeGroups: [
      {
        groupType: 'independent',
        privileges: [
          {
            id: 'generate_report',
            name: i18n.translate(
              'xpack.features.ossFeatures.reporting.visualizeGenerateScreenshot',
              {
                defaultMessage: 'Generate PDF or PNG reports',
              }
            ),
            includeIn: 'all',
            minimumLicense: 'gold',
            savedObject: { all: ['scheduled_report'], read: [] },
            management: { insightsAndAlerting: ['reporting'] },
            api: ['generateReport'],
            ui: ['generateScreenshot'],
            ...(version === 'v1' && {
              replacedBy: [{ feature: 'visualize_v2', privileges: ['generate_report'] }],
            }),
          },
        ],
      },
    ],
  }),
};
