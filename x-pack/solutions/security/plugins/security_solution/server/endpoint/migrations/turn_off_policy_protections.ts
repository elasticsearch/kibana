/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { UpdatePackagePolicyWithId } from '@kbn/fleet-plugin/common';
import type { AuthenticatedUser } from '@kbn/security-plugin/common';
import { ProductFeatureSecurityKey } from '@kbn/security-solution-features/keys';
import { merge } from 'lodash';
import {
  checkIfPopupMessagesContainCustomNotifications,
  ensureOnlyEventCollectionIsAllowed,
  isPolicySetToEventCollectionOnly,
  resetCustomNotifications,
} from '../../../common/endpoint/models/policy_config_helpers';
import type { PolicyData } from '../../../common/endpoint/types';
import type { EndpointInternalFleetServicesInterface } from '../services/fleet';
import { getPolicyDataForUpdate } from '../../../common/endpoint/service/policy';
import type { ProductFeaturesService } from '../../lib/product_features_service/product_features_service';

export const turnOffPolicyProtectionsIfNotSupported = async (
  esClient: ElasticsearchClient,
  fleetServices: EndpointInternalFleetServicesInterface,
  productFeaturesService: ProductFeaturesService,
  logger: Logger
): Promise<void> => {
  const log = logger.get('endpoint', 'policyProtectionsComplianceChecks');

  const isProtectionUpdatesFeatureEnabled = productFeaturesService.isEnabled(
    ProductFeatureSecurityKey.endpointProtectionUpdates
  );
  const isPolicyProtectionsEnabled = productFeaturesService.isEnabled(
    ProductFeatureSecurityKey.endpointPolicyProtections
  );
  const isCustomNotificationEnabled = productFeaturesService.isEnabled(
    ProductFeatureSecurityKey.endpointCustomNotification
  );

  if (
    isPolicyProtectionsEnabled &&
    isProtectionUpdatesFeatureEnabled &&
    isCustomNotificationEnabled
  ) {
    log.info('All relevant features are enabled. Nothing to do!');
    return;
  }

  const { packagePolicy, savedObjects, endpointPolicyKuery } = fleetServices;
  const internalSoClient = savedObjects.createInternalScopedSoClient({ readonly: false });
  const updates: UpdatePackagePolicyWithId[] = [];
  const messages: string[] = [];
  const perPage = 1000;
  let hasMoreData = true;
  let page = 1;

  while (hasMoreData) {
    const { items, total } = await packagePolicy.list(internalSoClient, {
      page,
      kuery: endpointPolicyKuery,
      perPage,
    });

    hasMoreData = page * perPage < total;
    page++;

    for (const item of items) {
      const integrationPolicy = item as PolicyData;
      const policySettings = integrationPolicy.inputs[0].config.policy.value;
      const { message, isOnlyCollectingEvents } = isPolicySetToEventCollectionOnly(policySettings);
      const shouldDowngradeProtectionUpdates =
        !isProtectionUpdatesFeatureEnabled && policySettings.global_manifest_version !== 'latest';
      const shouldDowngradeCustomNotifications =
        !isCustomNotificationEnabled &&
        checkIfPopupMessagesContainCustomNotifications(policySettings);

      if (
        (!isPolicyProtectionsEnabled && !isOnlyCollectingEvents) ||
        shouldDowngradeProtectionUpdates ||
        shouldDowngradeCustomNotifications
      ) {
        if (!isPolicyProtectionsEnabled && !isOnlyCollectingEvents) {
          messages.push(
            `Policy [${integrationPolicy.id}][${integrationPolicy.name}] updated to disable protections. Trigger: [${message}]`
          );
        }
        if (shouldDowngradeProtectionUpdates) {
          messages.push(
            `Policy [${integrationPolicy.id}][${integrationPolicy.name}] updated to downgrade protection updates.`
          );
        }
        if (shouldDowngradeCustomNotifications) {
          messages.push(
            `Policy [${integrationPolicy.id}][${integrationPolicy.name}] updated to reset custom notifications.`
          );
        }

        integrationPolicy.inputs[0].config.policy.value = merge(
          {},
          policySettings,
          !isPolicyProtectionsEnabled && !isOnlyCollectingEvents
            ? ensureOnlyEventCollectionIsAllowed(policySettings)
            : {},
          shouldDowngradeProtectionUpdates ? { global_manifest_version: 'latest' } : {},
          shouldDowngradeCustomNotifications ? resetCustomNotifications() : {}
        );

        updates.push({
          ...getPolicyDataForUpdate(integrationPolicy),
          id: integrationPolicy.id,
        });
      }
    }
  }

  if (updates.length > 0) {
    log.info(`Found ${updates.length} policies that need updates:\n${messages.join('\n')}`);
    const bulkUpdateResponse = await fleetServices.packagePolicy.bulkUpdate(
      internalSoClient,
      esClient,
      updates,
      { user: { username: 'elastic' } as AuthenticatedUser }
    );
    log.debug(() => `Bulk update response:\n${JSON.stringify(bulkUpdateResponse, null, 2)}`);
    if (bulkUpdateResponse.failedPolicies.length > 0) {
      log.error(
        `Done. ${bulkUpdateResponse.failedPolicies.length} out of ${
          updates.length
        } failed to update:\n${JSON.stringify(bulkUpdateResponse.failedPolicies, null, 2)}`
      );
    } else {
      log.info('Done. All updates applied successfully');
    }
  } else {
    log.info(`Done. Checked ${page * perPage} policies and no updates needed`);
  }
};
