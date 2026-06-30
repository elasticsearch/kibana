/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { useIsExperimentalFeatureEnabled } from '../../../common/hooks/use_experimental_features';
import {
  getAnomaliesTab,
  getInsightsInputTab,
  getResolutionGroupTab,
  getRiskInputTab,
} from '../../../entity_analytics/components/entity_details_flyout';
import { useHasAnomalies } from '../../../entity_analytics/api/hooks/use_has_anomalies';
import { UserAssetTableType } from '../../../explore/users/store/model';
import { ManagedUserDatasetKey } from '../../../../common/search_strategy/security_solution/users/managed_details';
import type {
  ManagedUserHits,
  ManagedUserHit,
} from '../../../../common/search_strategy/security_solution/users/managed_details';
import { ENTRA_TAB_TEST_ID, OKTA_TAB_TEST_ID } from './test_ids';
import { AssetDocumentTab } from './tabs/asset_document';
import { DocumentDetailsProvider } from '../../document_details/shared/context';
import { EntityType } from '../../../../common/entity_analytics/types';
import { useHasEntityResolutionLicense } from '../../../common/hooks/use_has_entity_resolution_license';
import type { LeftPanelTabsType } from '../shared/components/left_panel/left_panel_header';
import { EntityDetailsLeftPanelTab } from '../shared/components/left_panel/left_panel_header';
import type { IdentityFields } from '../../document_details/shared/utils';
import { getGraphViewTab } from '../shared/components/left';

export const useTabs = (
  managedUser: ManagedUserHits,
  name: string,
  isRiskScoreExist: boolean,
  scopeId: string,
  hasMisconfigurationFindings?: boolean,
  hasNonClosedAlerts?: boolean,
  identityFields?: IdentityFields,
  entityId?: string,
  entityStoreEntityId?: string
): LeftPanelTabsType => {
  const hasEntityResolutionLicense = useHasEntityResolutionLicense();
  const isAnomalyDetailsEnabled = useIsExperimentalFeatureEnabled('entityAnalyticsAnomalyDetails');
  const hasAnomalies = useHasAnomalies({
    entityId: entityStoreEntityId ?? '',
    entityType: EntityType.user,
    enabled: !!(entityStoreEntityId && isAnomalyDetailsEnabled),
  });

  return useMemo(() => {
    const tabs: LeftPanelTabsType = [];

    const entraManagedUser = managedUser[ManagedUserDatasetKey.ENTRA];
    const oktaManagedUser = managedUser[ManagedUserDatasetKey.OKTA];

    if (isRiskScoreExist || entityStoreEntityId) {
      tabs.push(
        getRiskInputTab({
          entityName: name,
          entityType: EntityType.user,
          scopeId,
          entityId: entityStoreEntityId,
        })
      );
    }

    if (entityStoreEntityId && isAnomalyDetailsEnabled && hasAnomalies) {
      tabs.push(
        getAnomaliesTab({
          entityId: entityStoreEntityId,
          entityType: EntityType.user,
        })
      );
    }

    if (oktaManagedUser) {
      tabs.push(getOktaTab(oktaManagedUser));
    }

    if (entraManagedUser) {
      tabs.push(getEntraTab(entraManagedUser));
    }

    if ((hasMisconfigurationFindings || hasNonClosedAlerts) && name) {
      tabs.push(
        getInsightsInputTab({
          field: 'user.name',
          value: name,
          entityId: entityId ?? identityFields?.['user.entity.id'] ?? '',
          scopeId,
          entityType: EntityType.user,
        })
      );
    }

    if (entityStoreEntityId) {
      tabs.push(getGraphViewTab({ entityId: entityStoreEntityId, scopeId }));
      if (hasEntityResolutionLicense) {
        tabs.push(
          getResolutionGroupTab({
            entityId: entityStoreEntityId,
            entityType: EntityType.user,
            scopeId,
          })
        );
      }
    }

    return tabs;
  }, [
    managedUser,
    isRiskScoreExist,
    entityStoreEntityId,
    isAnomalyDetailsEnabled,
    hasAnomalies,
    hasMisconfigurationFindings,
    hasNonClosedAlerts,
    name,
    scopeId,
    entityId,
    identityFields,
    hasEntityResolutionLicense,
  ]);
};

const getOktaTab = (oktaManagedUser: ManagedUserHit) => ({
  id: EntityDetailsLeftPanelTab.OKTA,
  'data-test-subj': OKTA_TAB_TEST_ID,
  name: (
    <FormattedMessage
      id="xpack.securitySolution.flyout.entityDetails.userDetails.okta.tabLabel"
      defaultMessage="Okta Data"
    />
  ),
  content: (
    <DocumentDetailsProvider
      id={oktaManagedUser._id}
      indexName={oktaManagedUser._index}
      scopeId={UserAssetTableType.assetOkta}
    >
      <AssetDocumentTab />
    </DocumentDetailsProvider>
  ),
});

const getEntraTab = (entraManagedUser: ManagedUserHit) => {
  return {
    id: EntityDetailsLeftPanelTab.ENTRA,
    'data-test-subj': ENTRA_TAB_TEST_ID,
    name: (
      <FormattedMessage
        id="xpack.securitySolution.flyout.entityDetails.userDetails.entra.tabLabel"
        defaultMessage="Entra Data"
      />
    ),
    content: (
      <DocumentDetailsProvider
        id={entraManagedUser._id}
        indexName={entraManagedUser._index}
        scopeId={UserAssetTableType.assetEntra}
      >
        <AssetDocumentTab />
      </DocumentDetailsProvider>
    ),
  };
};
