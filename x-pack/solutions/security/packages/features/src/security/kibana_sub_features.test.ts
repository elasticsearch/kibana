/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SubFeatureConfig } from '@kbn/features-plugin/common';
import {
  blocklistSubFeature,
  endpointExceptionsSubFeature,
  endpointListSubFeature,
  eventFiltersSubFeature,
  executeActionSubFeature,
  fileOperationsSubFeature,
  globalArtifactManagementSubFeature,
  hostIsolationExceptionsBasicSubFeature,
  hostIsolationSubFeature,
  policyManagementSubFeature,
  processOperationsSubFeature,
  responseActionsHistorySubFeature,
  scanActionSubFeature,
  scriptsManagementSubFeature,
  customYaraSignaturesSubFeature,
  socManagementSubFeature,
  trustedApplicationsSubFeature,
  trustedDevicesSubFeature,
  workflowInsightsSubFeature,
} from './kibana_sub_features';

const getAllPrivileges = (subFeature: SubFeatureConfig) =>
  subFeature.privilegeGroups.flatMap((g) => g.privileges);

describe('kibana_sub_features', () => {
  describe('excludeFromBasePrivileges', () => {
    const subFeaturesWithExcludeFromBasePrivileges = [
      { name: 'endpointListSubFeature', factory: endpointListSubFeature },
      { name: 'trustedApplicationsSubFeature', factory: trustedApplicationsSubFeature },
      { name: 'trustedDevicesSubFeature', factory: trustedDevicesSubFeature },
      {
        name: 'hostIsolationExceptionsBasicSubFeature',
        factory: hostIsolationExceptionsBasicSubFeature,
      },
      { name: 'blocklistSubFeature', factory: blocklistSubFeature },
      { name: 'eventFiltersSubFeature', factory: eventFiltersSubFeature },
      { name: 'policyManagementSubFeature', factory: policyManagementSubFeature },
      { name: 'responseActionsHistorySubFeature', factory: responseActionsHistorySubFeature },
      { name: 'scriptsManagementSubFeature', factory: scriptsManagementSubFeature },
      { name: 'customYaraSignaturesSubFeature', factory: customYaraSignaturesSubFeature },
      { name: 'processOperationsSubFeature', factory: processOperationsSubFeature },
      { name: 'fileOperationsSubFeature', factory: fileOperationsSubFeature },
      { name: 'scanActionSubFeature', factory: scanActionSubFeature },
      { name: 'workflowInsightsSubFeature', factory: workflowInsightsSubFeature },
      { name: 'socManagementSubFeature', factory: socManagementSubFeature },
      { name: 'hostIsolationSubFeature', factory: hostIsolationSubFeature },
      { name: 'executeActionSubFeature', factory: executeActionSubFeature },
    ];

    it.each(subFeaturesWithExcludeFromBasePrivileges)(
      '$name: all privileges have excludeFromBasePrivileges set to true',
      ({ factory }) => {
        const subFeature = factory();
        const privileges = getAllPrivileges(subFeature);
        expect(privileges.length).toBeGreaterThan(0);
        for (const privilege of privileges) {
          expect(privilege.excludeFromBasePrivileges).toBe(true);
        }
      }
    );

    const subFeaturesWithoutExcludeFromBasePrivileges = [
      { name: 'endpointExceptionsSubFeature', factory: () => endpointExceptionsSubFeature() },
      {
        name: 'globalArtifactManagementSubFeature',
        factory: () => globalArtifactManagementSubFeature({} as Record<string, boolean>),
      },
    ];

    it.each(subFeaturesWithoutExcludeFromBasePrivileges)(
      '$name: no privileges have excludeFromBasePrivileges set to true',
      ({ factory }) => {
        const subFeature = factory();
        const privileges = getAllPrivileges(subFeature);
        expect(privileges.length).toBeGreaterThan(0);
        for (const privilege of privileges) {
          expect(privilege.excludeFromBasePrivileges).not.toBe(true);
        }
      }
    );
  });
});
