/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const i18nStrings = {
  alertDetections: {
    title: i18n.translate('securitySolutionPackages.navLinks.alertDetections', {
      defaultMessage: 'Detections',
    }),
    views: {
      title: i18n.translate('securitySolutionPackages.navLinks.rules.views', {
        defaultMessage: 'Views',
      }),
    },
  },
  rules: {
    title: i18n.translate('securitySolutionPackages.navLinks.rules', {
      defaultMessage: 'Rules',
    }),
    management: {
      title: i18n.translate('securitySolutionPackages.navLinks.rules.management', {
        defaultMessage: 'Management',
      }),
      discover: i18n.translate('securitySolutionPackages.navLinks.rules.discover', {
        defaultMessage: 'Discover',
      }),
    },
  },
  investigations: {
    title: i18n.translate('securitySolutionPackages.navLinks.investigations', {
      defaultMessage: 'Investigations',
    }),
  },
  explore: {
    title: i18n.translate('securitySolutionPackages.navLinks.explore', {
      defaultMessage: 'Explore',
    }),
  },
  assets: {
    title: i18n.translate('securitySolutionPackages.navLinks.assets', {
      defaultMessage: 'Assets',
    }),
    fleet: {
      title: i18n.translate('securitySolutionPackages.navLinks.assets.fleet', {
        defaultMessage: 'Fleet',
      }),
      policies: i18n.translate('securitySolutionPackages.navLinks.assets.fleetPolicies', {
        defaultMessage: 'Policies',
      }),
    },
    endpoints: {
      title: i18n.translate('securitySolutionPackages.navLinks.assets.endpoints', {
        defaultMessage: 'Endpoints',
      }),
    },
    artifacts: {
      title: i18n.translate('securitySolutionPackages.navLinks.assets.artifacts', {
        defaultMessage: 'Artifacts',
      }),
    },
    integrationsCallout: {
      title: i18n.translate('securitySolutionPackages.navLinks.assets.integrationsCallout.title', {
        defaultMessage: 'Integrations',
      }),
      body: i18n.translate('securitySolutionPackages.navLinks.assets.integrationsCallout.body', {
        defaultMessage: 'Choose an integration to start collecting and analyzing your data.',
      }),
      button: i18n.translate(
        'securitySolutionPackages.navLinks.assets.integrationsCallout.button',
        { defaultMessage: 'Browse integrations' }
      ),
    },
  },
  clusterPerformance: {
    title: i18n.translate('securitySolutionPackages.navLinks.clusterPerformance', {
      defaultMessage: 'Cluster performance',
    }),
  },
  projectPerformance: {
    title: i18n.translate('securitySolutionPackages.navLinks.projectPerformance', {
      defaultMessage: 'Project performance',
    }),
  },
  ml: {
    title: i18n.translate('securitySolutionPackages.navLinks.ml', {
      defaultMessage: 'Machine Learning',
    }),
    overview: i18n.translate('securitySolutionPackages.navLinks.ml.overview', {
      defaultMessage: 'Overview',
    }),
    dataVisualizer: i18n.translate('securitySolutionPackages.navLinks.ml.dataVisualizer', {
      defaultMessage: 'Data visualizer',
    }),
    notifications: i18n.translate('securitySolutionPackages.navLinks.ml.notifications', {
      defaultMessage: 'Notifications',
    }),
    memoryUsage: i18n.translate('securitySolutionPackages.navLinks.ml.memoryUsage', {
      defaultMessage: 'Memory usage',
    }),
    anomalyDetection: {
      title: i18n.translate('securitySolutionPackages.navLinks.ml.anomalyDetection', {
        defaultMessage: 'Anomaly detection',
      }),
      jobs: i18n.translate('securitySolutionPackages.navLinks.ml.anomalyDetection.jobs', {
        defaultMessage: 'Jobs',
      }),
      manageJobs: i18n.translate(
        'securitySolutionPackages.navLinks.ml.anomalyDetection.manageJobs',
        {
          defaultMessage: 'Manage jobs',
        }
      ),
      anomalyExplorer: i18n.translate(
        'securitySolutionPackages.navLinks.ml.anomalyDetection.anomalyExplorer',
        { defaultMessage: 'Anomaly explorer' }
      ),
      singleMetricViewer: i18n.translate(
        'securitySolutionPackages.navLinks.ml.anomalyDetection.singleMetricViewer',
        { defaultMessage: 'Single metric viewer' }
      ),
      suppliedConfigurations: i18n.translate(
        'securitySolutionPackages.navLinks.ml.anomalyDetection.suppliedConfigurations',
        { defaultMessage: 'Supplied configurations' }
      ),
      settings: i18n.translate('securitySolutionPackages.navLinks.ml.anomalyDetection.settings', {
        defaultMessage: 'Settings',
      }),
    },
    dataFrameAnalytics: {
      title: i18n.translate('securitySolutionPackages.navLinks.ml.dataFrameAnalytics', {
        defaultMessage: 'Data frame analytics',
      }),
      jobs: i18n.translate('securitySolutionPackages.navLinks.ml.dataFrameAnalytics.jobs', {
        defaultMessage: 'Jobs',
      }),
      resultExplorer: i18n.translate(
        'securitySolutionPackages.navLinks.ml.dataFrameAnalytics.resultExplorer',
        { defaultMessage: 'Result explorer' }
      ),
      analyticsMap: i18n.translate(
        'securitySolutionPackages.navLinks.ml.dataFrameAnalytics.analyticsMap',
        { defaultMessage: 'Analytics map' }
      ),
    },
    modelManagement: {
      title: i18n.translate('securitySolutionPackages.navLinks.ml.modelManagement', {
        defaultMessage: 'Model management',
      }),
      trainedModels: i18n.translate(
        'securitySolutionPackages.navLinks.ml.modelManagement.trainedModels',
        { defaultMessage: 'Trained models' }
      ),
    },
    aiopsLabs: {
      title: i18n.translate('securitySolutionPackages.navLinks.ml.aiopsLabs', {
        defaultMessage: 'AIOps labs',
      }),
      logRateAnalysis: i18n.translate(
        'securitySolutionPackages.navLinks.ml.aiopsLabs.logRateAnalysis',
        { defaultMessage: 'Log rate analysis' }
      ),
      logPatternAnalysis: i18n.translate(
        'securitySolutionPackages.navLinks.ml.aiopsLabs.logPatternAnalysis',
        { defaultMessage: 'Log pattern analysis' }
      ),
      changePointDetection: i18n.translate(
        'securitySolutionPackages.navLinks.ml.aiopsLabs.changePointDetection',
        { defaultMessage: 'Change point detection' }
      ),
    },
  },
  modelManagement: {
    title: i18n.translate('securitySolutionPackages.navLinks.modelManagement', {
      defaultMessage: 'Model Management',
    }),
  },
  entityRiskScore: i18n.translate('securitySolutionPackages.navLinks.entityRiskScore', {
    defaultMessage: 'Entity risk score',
  }),
  entityStore: i18n.translate('securitySolutionPackages.navLinks.entityStore', {
    defaultMessage: 'Entity store',
  }),
  entityAnalytics: {
    title: i18n.translate('securitySolutionPackages.navLinks.entityAnalytics', {
      defaultMessage: 'Entity analytics',
    }),
  },
  devTools: i18n.translate('securitySolutionPackages.navLinks.devTools', {
    defaultMessage: 'Developer tools',
  }),
  management: {
    title: i18n.translate('securitySolutionPackages.navLinks.management.title', {
      defaultMessage: 'Management',
    }),
  },
  projectSettings: {
    title: i18n.translate('securitySolutionPackages.navLinks.projectSettings.title', {
      defaultMessage: 'Project Settings',
    }),
  },
  stackManagement: {
    title: i18n.translate('securitySolutionPackages.navLinks.mngt.title', {
      defaultMessage: 'Stack Management',
    }),
    ingest: {
      title: i18n.translate('securitySolutionPackages.navLinks.mngt.ingest', {
        defaultMessage: 'Ingest',
      }),
    },
    data: {
      title: i18n.translate('securitySolutionPackages.navLinks.mngt.data', {
        defaultMessage: 'Data',
      }),
    },
    access: {
      title: i18n.translate('securitySolutionPackages.navLinks.mngt.access', {
        defaultMessage: 'Access',
      }),
    },
    alertsAndInsights: {
      title: i18n.translate('securitySolutionPackages.navLinks.mngt.alertsAndInsights', {
        defaultMessage: 'Alerts and Insights',
      }),
    },
    security: {
      title: i18n.translate('securitySolutionPackages.navLinks.mngt.security', {
        defaultMessage: 'Security',
      }),
    },
    kibana: {
      title: i18n.translate('securitySolutionPackages.navLinks.mngt.kibana', {
        defaultMessage: 'Kibana',
      }),
    },
    content: {
      title: i18n.translate('securitySolutionPackages.navLinks.mngt.content', {
        defaultMessage: 'Content',
      }),
    },
    stack: {
      title: i18n.translate('securitySolutionPackages.navLinks.mngt.stack', {
        defaultMessage: 'Stack',
      }),
    },
    ai: {
      title: i18n.translate('securitySolutionPackages.navLinks.mngt.ai', {
        defaultMessage: 'AI',
      }),
    },
    other: {
      title: i18n.translate('securitySolutionPackages.navLinks.mngt.other', {
        defaultMessage: 'Other',
      }),
    },
  },
  launchPad: {
    title: i18n.translate('securitySolutionPackages.navLinks.launchPad', {
      defaultMessage: 'Launchpad',
    }),
    migrations: {
      title: i18n.translate('securitySolutionPackages.navLinks.launchPad.migrations', {
        defaultMessage: 'Migrations',
      }),
    },
  },
  // also used in sidenav v2
  // for serverless tiers (EASE (search_ai_lake|ai_soc_engine) | essential | complete)
  ingestAndManageData: {
    title: i18n.translate('securitySolutionPackages.navLinks.dataManagement', {
      defaultMessage: 'Data management',
    }),
    ingestAndIntegrations: {
      title: i18n.translate(
        'securitySolutionPackages.navLinks.ingestAndManageData.ingestAndIntegrations',
        {
          defaultMessage: 'Ingest and Integrations',
        }
      ),
    },
    indicesAndDataStreams: {
      title: i18n.translate(
        'securitySolutionPackages.navLinks.ingestAndManageData.indicesAndDataStreams',
        {
          defaultMessage: 'Indices and data streams',
        }
      ),
    },
  },
  // rename this key to stackManagement once we switch to v2 completely
  // also used in sidenav v2 for
  // serverless tiers (EASE (search_ai_lake|ai_soc_engine) | essential | complete)
  stackManagementV2: {
    title: i18n.translate('securitySolutionPackages.navLinks.stackManagement_v2.title', {
      defaultMessage: 'Stack Management',
    }),
    home: {
      title: i18n.translate('securitySolutionPackages.navLinks.stackManagement_v2.home', {
        defaultMessage: 'Home',
      }),
    },
    serverlessTitle: i18n.translate(
      'securitySolutionPackages.navLinks.stackManagement_v2.serverlessTitle',
      { defaultMessage: 'Admin and Settings' }
    ),
    organization: {
      title: i18n.translate('securitySolutionPackages.navLinks.stackManagement_v2.organization', {
        defaultMessage: 'Organization',
      }),
    },
    alertsAndInsights: {
      title: i18n.translate('securitySolutionPackages.navLinks.stackManagement_v2.alertsInsights', {
        defaultMessage: 'Alerts and Insights',
      }),
    },
    security: {
      title: i18n.translate('securitySolutionPackages.navLinks.stackManagement_v2.security', {
        defaultMessage: 'Security',
      }),
    },
    data: {
      title: i18n.translate('securitySolutionPackages.navLinks.stackManagement_v2.data', {
        defaultMessage: 'Data',
      }),
    },
    kibana: {
      title: i18n.translate('securitySolutionPackages.navLinks.stackManagement_v2.kibana', {
        defaultMessage: 'Kibana',
      }),
    },
    // serverless only
    access: {
      title: i18n.translate('securitySolutionPackages.navLinks.stackManagement_v2.access', {
        defaultMessage: 'Access',
      }),
    },
  },
};
