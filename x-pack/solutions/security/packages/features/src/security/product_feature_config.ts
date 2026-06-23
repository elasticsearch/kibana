/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ProductFeatureSecurityKey, SecuritySubFeatureId } from '../product_features_keys';
import { APP_ID } from '../constants';
import type { SecurityProductFeaturesConfig } from './types';

export const securityDefaultProductFeaturesConfig: SecurityProductFeaturesConfig = {
  [ProductFeatureSecurityKey.advancedInsights]: {
    privileges: {
      all: {
        ui: ['entity-analytics'],
        api: [`${APP_ID}-entity-analytics`],
      },
      read: {
        ui: ['entity-analytics'],
        api: [`${APP_ID}-entity-analytics`],
      },
    },
  },
  [ProductFeatureSecurityKey.detections]: {
    privileges: {
      all: {
        ui: ['detections'],
        api: ['cloud-security-posture-all', 'cloud-security-posture-read', 'bulkGetUserProfiles'],
      },
      read: {
        ui: ['detections'],
        api: ['cloud-security-posture-read', 'bulkGetUserProfiles'],
      },
    },
  },

  [ProductFeatureSecurityKey.investigationGuide]: {
    privileges: {
      all: {
        ui: ['investigation-guide'],
      },
      read: {
        ui: ['investigation-guide'],
      },
    },
  },
  [ProductFeatureSecurityKey.configurations]: {
    privileges: {
      all: {
        ui: ['configurations'],
        api: [],
      },
      read: {
        ui: [],
        api: [],
      },
    },
  },
  [ProductFeatureSecurityKey.aiValueReport]: {
    subFeatureIds: [SecuritySubFeatureId.socManagement],
  },
  [ProductFeatureSecurityKey.investigationGuideInteractions]: {
    privileges: {
      all: {
        ui: ['investigation-guide-interactions'],
      },
      read: {
        ui: ['investigation-guide-interactions'],
      },
    },
  },

  [ProductFeatureSecurityKey.threatIntelligence]: {
    privileges: {
      all: {
        ui: ['threat-intelligence'],
        api: [`${APP_ID}-threat-intelligence`],
      },
      read: {
        ui: ['threat-intelligence'],
        api: [`${APP_ID}-threat-intelligence`],
      },
    },
  },

  [ProductFeatureSecurityKey.endpointHostIsolation]: {
    subFeatureIds: [SecuritySubFeatureId.hostIsolation],
  },

  [ProductFeatureSecurityKey.endpointHostManagement]: {
    subFeatureIds: [SecuritySubFeatureId.endpointList],
  },

  [ProductFeatureSecurityKey.endpointTrustedDevices]: {
    subFeatureIds: [SecuritySubFeatureId.trustedDevices],
  },

  [ProductFeatureSecurityKey.endpointCustomYaraSignatures]: {
    subFeatureIds: [SecuritySubFeatureId.customYaraSignatures],
  },

  [ProductFeatureSecurityKey.endpointPolicyManagement]: {
    subFeatureIds: [SecuritySubFeatureId.policyManagement],
  },

  [ProductFeatureSecurityKey.endpointScriptsManagement]: {
    subFeatureIds: [SecuritySubFeatureId.scriptsManagement],
  },

  // Adds no additional kibana feature controls
  [ProductFeatureSecurityKey.endpointPolicyProtections]: {},

  // Endpoint Complete Tier:
  // Allows access to create/update HIEs
  [ProductFeatureSecurityKey.endpointHostIsolationExceptions]: {
    subFeaturesPrivileges: [
      {
        id: 'host_isolation_exceptions_all',
        api: [`${APP_ID}-accessHostIsolationExceptions`, `${APP_ID}-writeHostIsolationExceptions`],
        ui: ['accessHostIsolationExceptions', 'writeHostIsolationExceptions'],
      },
      {
        id: 'host_isolation_exceptions_read',
        api: [`${APP_ID}-accessHostIsolationExceptions`],
        ui: ['accessHostIsolationExceptions'],
      },
    ],
  },

  [ProductFeatureSecurityKey.endpointResponseActions]: {
    subFeatureIds: [
      SecuritySubFeatureId.responseActionsHistory,
      SecuritySubFeatureId.hostIsolation,
      SecuritySubFeatureId.processOperations,
      SecuritySubFeatureId.fileOperations,
      SecuritySubFeatureId.executeAction,
      SecuritySubFeatureId.scanAction,
    ],
    subFeaturesPrivileges: [
      {
        id: 'host_isolation_all',
        api: [`${APP_ID}-writeHostIsolation`],
        ui: ['writeHostIsolation'],
      },
    ],
  },

  [ProductFeatureSecurityKey.securityWorkflowInsights]: {
    subFeatureIds: [SecuritySubFeatureId.workflowInsights],
  },

  [ProductFeatureSecurityKey.endpointArtifactManagement]: {
    subFeatureIds: [
      SecuritySubFeatureId.hostIsolationExceptionsBasic,
      SecuritySubFeatureId.trustedApplications,
      SecuritySubFeatureId.blocklist,
      SecuritySubFeatureId.eventFilters,
      SecuritySubFeatureId.globalArtifactManagement,
    ],
  },

  [ProductFeatureSecurityKey.endpointExceptions]: {
    subFeatureIds: [SecuritySubFeatureId.endpointExceptions],
  },
};
