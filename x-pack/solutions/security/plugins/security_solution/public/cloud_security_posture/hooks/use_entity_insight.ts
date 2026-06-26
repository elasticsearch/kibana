/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { useCallback, useMemo } from 'react';
import { useHasVulnerabilities } from '@kbn/cloud-security-posture/src/hooks/use_has_vulnerabilities';
import { useHasMisconfigurations } from '@kbn/cloud-security-posture/src/hooks/use_has_misconfigurations';
import { useEntityStoreEuidApi } from '@kbn/entity-store/public';
import { buildEuidCspPreviewOptions } from '../utils/build_euid_csp_preview_options';
import { UserDetailsPanelKey } from '../../flyout/entity_details/user_details_left';
import { HostDetailsPanelKey } from '../../flyout/entity_details/host_details_left';
import { EntityDetailsLeftPanelTab } from '../../flyout/entity_details/shared/components/left_panel/left_panel_header';
import { useGlobalTime } from '../../common/containers/use_global_time';
import { DETECTION_RESPONSE_ALERTS_BY_STATUS_ID } from '../../overview/components/detection_response/alerts_by_status/types';
import { useNonClosedAlerts } from './use_non_closed_alerts';
import type { IdentityFields } from '../../flyout/document_details/shared/utils';
import { useEntityFromStore } from '../../flyout/entity_details/shared/hooks/use_entity_from_store';
import { getRiskFromEntityRecord } from '../../flyout/entity_details/shared/entity_store_risk_utils';

export const useNavigateEntityInsight = ({
  identityFields,
  subTab,
  queryIdExtension,
}: {
  identityFields: IdentityFields;
  subTab: string;
  queryIdExtension: string;
}) => {
  const isHostNameField = 'host.name' in identityFields;
  const { to, from } = useGlobalTime();
  const euidApi = useEntityStoreEuidApi();

  const { hasNonClosedAlerts } = useNonClosedAlerts({
    identityFields,
    entityType: isHostNameField ? 'host' : 'user',
    to,
    from,
    queryId: `${DETECTION_RESPONSE_ALERTS_BY_STATUS_ID}${queryIdExtension}`,
  });

  const primaryField = useMemo(() => {
    if (identityFields['host.name']) return 'host.name';
    if (identityFields['user.name']) return 'user.name';
    return Object.keys(identityFields)[0] || '';
  }, [identityFields]);

  const value = useMemo(() => {
    return identityFields[primaryField] || Object.values(identityFields)[0] || '';
  }, [identityFields, primaryField]);

  const entityType = primaryField === 'host.name' ? 'host' : 'user';

  const { hasVulnerabilitiesFindings } = useHasVulnerabilities(
    buildEuidCspPreviewOptions(entityType, identityFields, euidApi)
  );

  const entityFromStore = useEntityFromStore({
    entityId:
      entityType === 'host' ? identityFields['host.entity.id'] : identityFields['user.entity.id'],
    identityFields,
    entityType,
    skip: false,
  });

  const hasRiskScore = useMemo(() => {
    const record = entityFromStore.entityRecord;
    return record ? !!getRiskFromEntityRecord(record)?.calculated_level : false;
  }, [entityFromStore.entityRecord]);

  const { hasMisconfigurationFindings } = useHasMisconfigurations(
    buildEuidCspPreviewOptions(entityType, identityFields, euidApi)
  );
  const { openLeftPanel } = useExpandableFlyoutApi();

  const goToEntityInsightTab = useCallback(() => {
    openLeftPanel({
      id: isHostNameField ? HostDetailsPanelKey : UserDetailsPanelKey,
      params: isHostNameField
        ? {
            name: value,
            isRiskScoreExist: hasRiskScore,
            hasMisconfigurationFindings,
            hasVulnerabilitiesFindings,
            hasNonClosedAlerts,
            path: {
              tab: EntityDetailsLeftPanelTab.CSP_INSIGHTS,
              subTab,
            },
          }
        : {
            user: { name: value },
            isRiskScoreExist: hasRiskScore,
            hasMisconfigurationFindings,
            hasNonClosedAlerts,
            path: {
              tab: EntityDetailsLeftPanelTab.CSP_INSIGHTS,
              subTab,
            },
          },
    });
  }, [
    openLeftPanel,
    isHostNameField,
    value,
    hasRiskScore,
    hasMisconfigurationFindings,
    hasVulnerabilitiesFindings,
    hasNonClosedAlerts,
    subTab,
  ]);

  return { goToEntityInsightTab };
};
