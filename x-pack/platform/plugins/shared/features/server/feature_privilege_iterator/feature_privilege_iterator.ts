/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import _ from 'lodash';

import type { LicenseType } from '@kbn/licensing-types';
import type { AlertingKibanaPrivilege } from '../../common/alerting_kibana_privilege';
import type { FeatureKibanaPrivileges, KibanaFeature } from '..';
import { subFeaturePrivilegeIterator } from './sub_feature_privilege_iterator';

/**
 * Options to control feature privilege iteration.
 */
export interface FeaturePrivilegeIteratorOptions {
  /**
   * Augment each privilege definition with its sub-feature privileges.
   */
  augmentWithSubFeaturePrivileges: boolean;

  /**
   * Function that returns whether the current license is equal to or greater than the given license type.
   * Controls which sub-features are returned, as they may have different license terms than the overall feature.
   */
  licenseHasAtLeast: (licenseType: LicenseType) => boolean | undefined;

  /**
   * Optional predicate to filter the returned set of privileges.
   */
  predicate?: (privilegeId: string, privilege: FeatureKibanaPrivileges) => boolean;
}

/**
 * Utility for iterating through all privileges belonging to a specific feature.
 * Iteration can be customized in several ways:
 * - Filter privileges with a given predicate.
 * - Augment privileges with their respective sub-feature privileges.
 *
 * @param feature the feature whose privileges to iterate through.
 * @param options options to control iteration.
 */
export type FeaturePrivilegeIterator = (
  feature: KibanaFeature,
  options: FeaturePrivilegeIteratorOptions
) => IterableIterator<{ privilegeId: string; privilege: FeatureKibanaPrivileges }>;

const featurePrivilegeIterator: FeaturePrivilegeIterator = function* featurePrivilegeIterator(
  feature: KibanaFeature,
  options: FeaturePrivilegeIteratorOptions
) {
  for (const entry of Object.entries(feature.privileges ?? {})) {
    const [privilegeId, privilege] = entry;

    if (options.predicate && !options.predicate(privilegeId, privilege)) {
      continue;
    }

    if (options.augmentWithSubFeaturePrivileges) {
      yield {
        privilegeId,
        privilege: mergeWithSubFeatures(privilegeId, privilege, feature, options.licenseHasAtLeast),
      };
    } else {
      yield { privilegeId, privilege };
    }
  }
};

function mergeWithSubFeatures(
  privilegeId: string,
  privilege: FeatureKibanaPrivileges,
  feature: KibanaFeature,
  licenseHasAtLeast: FeaturePrivilegeIteratorOptions['licenseHasAtLeast']
) {
  const mergedConfig = _.cloneDeep(privilege);
  for (const subFeaturePrivilege of subFeaturePrivilegeIterator(feature, licenseHasAtLeast)) {
    if (subFeaturePrivilege.includeIn !== 'read' && subFeaturePrivilege.includeIn !== privilegeId) {
      continue;
    }

    mergedConfig.api = mergeArrays(mergedConfig.api, subFeaturePrivilege.api);

    mergedConfig.app = mergeArrays(mergedConfig.app, subFeaturePrivilege.app);

    mergedConfig.catalogue = mergeArrays(mergedConfig.catalogue, subFeaturePrivilege.catalogue);

    const managementEntries = Object.entries(mergedConfig.management ?? {});
    const subFeatureManagementEntries = Object.entries(subFeaturePrivilege.management ?? {});

    mergedConfig.management = [managementEntries, subFeatureManagementEntries]
      .flat()
      .reduce((acc, [sectionId, managementApps]) => {
        acc[sectionId] = mergeArrays(acc[sectionId], managementApps);
        return acc;
      }, {} as Record<string, string[]>);

    mergedConfig.ui = mergeArrays(mergedConfig.ui, subFeaturePrivilege.ui);

    mergedConfig.savedObject.all = mergeArrays(
      mergedConfig.savedObject.all,
      subFeaturePrivilege.savedObject.all
    );

    mergedConfig.savedObject.read = mergeArrays(
      mergedConfig.savedObject.read,
      subFeaturePrivilege.savedObject.read
    );

    /**
     * Merges all alerting rule types and consumers
     * from features and sub features.
     * Removes duplicated values.
     */
    const mergeAlertingEntries = (entries: AlertingKibanaPrivilege): AlertingKibanaPrivilege => {
      const alertingMap = new Map<string, Set<string>>();

      for (const entry of entries) {
        const consumers = alertingMap.get(entry.ruleTypeId) ?? new Set();
        entry.consumers.forEach((consumer) => consumers.add(consumer));
        alertingMap.set(entry.ruleTypeId, consumers);
      }

      return Array.from(alertingMap).map(([ruleTypeId, consumers]) => ({
        ruleTypeId,
        consumers: Array.from(consumers),
      }));
    };

    mergedConfig.alerting = {
      rule: {
        all: mergeAlertingEntries([
          ...(mergedConfig.alerting?.rule?.all ?? []),
          ...(subFeaturePrivilege.alerting?.rule?.all ?? []),
        ]),
        enable: mergeAlertingEntries([
          ...(mergedConfig.alerting?.rule?.enable ?? []),
          ...(subFeaturePrivilege.alerting?.rule?.enable ?? []),
        ]),
        manual_run: mergeAlertingEntries([
          ...(mergedConfig.alerting?.rule?.manual_run ?? []),
          ...(subFeaturePrivilege.alerting?.rule?.manual_run ?? []),
        ]),
        manage_rule_settings: mergeAlertingEntries([
          ...(mergedConfig.alerting?.rule?.manage_rule_settings ?? []),
          ...(subFeaturePrivilege.alerting?.rule?.manage_rule_settings ?? []),
        ]),
        read: mergeAlertingEntries([
          ...(mergedConfig.alerting?.rule?.read ?? []),
          ...(subFeaturePrivilege.alerting?.rule?.read ?? []),
        ]),
      },
      alert: {
        all: mergeAlertingEntries([
          ...(mergedConfig.alerting?.alert?.all ?? []),
          ...(subFeaturePrivilege.alerting?.alert?.all ?? []),
        ]),
        read: mergeAlertingEntries([
          ...(mergedConfig.alerting?.alert?.read ?? []),
          ...(subFeaturePrivilege.alerting?.alert?.read ?? []),
        ]),
      },
    };

    mergedConfig.cases = {
      all: mergeArrays(mergedConfig.cases?.all ?? [], subFeaturePrivilege.cases?.all ?? []),
      create: mergeArrays(
        mergedConfig.cases?.create ?? [],
        subFeaturePrivilege.cases?.create ?? []
      ),
      read: mergeArrays(mergedConfig.cases?.read ?? [], subFeaturePrivilege.cases?.read ?? []),
      update: mergeArrays(
        mergedConfig.cases?.update ?? [],
        subFeaturePrivilege.cases?.update ?? []
      ),
      delete: mergeArrays(
        mergedConfig.cases?.delete ?? [],
        subFeaturePrivilege.cases?.delete ?? []
      ),
      push: mergeArrays(mergedConfig.cases?.push ?? [], subFeaturePrivilege.cases?.push ?? []),
      settings: mergeArrays(
        mergedConfig.cases?.settings ?? [],
        subFeaturePrivilege.cases?.settings ?? []
      ),
      createComment: mergeArrays(
        mergedConfig.cases?.createComment ?? [],
        subFeaturePrivilege.cases?.createComment ?? []
      ),
      reopenCase: mergeArrays(
        mergedConfig.cases?.reopenCase ?? [],
        subFeaturePrivilege.cases?.reopenCase ?? []
      ),
      assign: mergeArrays(
        mergedConfig.cases?.assign ?? [],
        subFeaturePrivilege.cases?.assign ?? []
      ),
      ...(mergedConfig.cases?.manageTemplates !== undefined ||
      subFeaturePrivilege.cases?.manageTemplates !== undefined
        ? {
            manageTemplates: mergeArrays(
              mergedConfig.cases?.manageTemplates ?? [],
              subFeaturePrivilege.cases?.manageTemplates ?? []
            ),
          }
        : {}),
    };

    // `alerts.read` is a boolean flag, so a sub-feature privilege included in the primary
    // privilege grants alerts read access to it without ever revoking access the primary
    // privilege already grants on its own.
    if (subFeaturePrivilege.alerts?.read) {
      mergedConfig.alerts = { ...mergedConfig.alerts, read: true };
    }
  }
  return mergedConfig;
}

function mergeArrays(input1: readonly string[] | undefined, input2: readonly string[] | undefined) {
  const first = input1 ?? [];
  const second = input2 ?? [];
  return Array.from(new Set([...first, ...second]));
}

export { featurePrivilegeIterator };
