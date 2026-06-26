/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useHasMisconfigurations } from '@kbn/cloud-security-posture/src/hooks/use_has_misconfigurations';
import { useHasVulnerabilities } from '@kbn/cloud-security-posture/src/hooks/use_has_vulnerabilities';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { useEntityStoreEuidApi } from '@kbn/entity-store/public';
import { buildEuidCspPreviewOptions } from '../../../../cloud_security_posture/utils/build_euid_csp_preview_options';
import type { IdentityFields } from '../../../document_details/shared/utils';
import type { EntityDetailsPath } from '../../shared/components/left_panel/left_panel_header';
import { useGlobalTime } from '../../../../common/containers/use_global_time';
import { useNonClosedAlerts } from '../../../../cloud_security_posture/hooks/use_non_closed_alerts';
import { DETECTION_RESPONSE_ALERTS_BY_STATUS_ID } from '../../../../overview/components/detection_response/alerts_by_status/types';
import { GenericEntityDetailsPanelKey } from '../../generic_details_left';

import { type UseGetGenericEntityParams } from './use_get_generic_entity';

export const useOpenGenericEntityDetailsLeftPanel = (
  params: {
    identityFields: IdentityFields;
    scopeId: string;
  } & UseGetGenericEntityParams
) => {
  const { identityFields, entityDocId, entityId, scopeId } = params;
  const { openLeftPanel } = useExpandableFlyoutApi();
  const euidApi = useEntityStoreEuidApi();
  const { hasMisconfigurationFindings } = useHasMisconfigurations(
    buildEuidCspPreviewOptions('generic', identityFields, euidApi)
  );
  const { hasVulnerabilitiesFindings } = useHasVulnerabilities(
    buildEuidCspPreviewOptions('generic', identityFields, euidApi)
  );
  const { to, from } = useGlobalTime();
  const { hasNonClosedAlerts } = useNonClosedAlerts({
    identityFields,
    to,
    from,
    queryId: `${DETECTION_RESPONSE_ALERTS_BY_STATUS_ID}-generic-entity-alerts`,
  });

  const openGenericEntityDetails = (path: EntityDetailsPath) => {
    return openLeftPanel({
      id: GenericEntityDetailsPanelKey,
      params: {
        entityDocId,
        entityId,
        identityFields,
        scopeId,
        isRiskScoreExist: false,
        hasMisconfigurationFindings,
        hasVulnerabilitiesFindings,
        hasNonClosedAlerts,
        path,
      },
    });
  };

  return {
    openGenericEntityDetails,
  };
};
