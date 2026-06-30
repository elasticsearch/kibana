/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiAccordion, EuiHorizontalRule, EuiSpacer, EuiTitle, useEuiTheme } from '@elastic/eui';
import React from 'react';
import { css } from '@emotion/react';
import { FormattedMessage } from '@kbn/i18n-react';
import { useHasVulnerabilities } from '@kbn/cloud-security-posture/src/hooks/use_has_vulnerabilities';
import { useHasMisconfigurations } from '@kbn/cloud-security-posture/src/hooks/use_has_misconfigurations';
import { FF_ENABLE_ENTITY_STORE_V2, useEntityStoreEuidApi } from '@kbn/entity-store/public';
import {
  buildEuidCspPreviewOptions,
  inferEntityTypeFromIdentityFields,
} from '../utils/build_euid_csp_preview_options';
import type { EntityIdentifierFields } from '../../../common/entity_analytics/types';
import type { IdentityFields } from '../../flyout/document_details/shared/utils';
import { MisconfigurationsPreview } from './misconfiguration/misconfiguration_preview';
import { VulnerabilitiesPreview } from './vulnerabilities/vulnerabilities_preview';
import { AlertsPreview } from './alerts/alerts_preview';
import { useGlobalTime } from '../../common/containers/use_global_time';
import { DETECTION_RESPONSE_ALERTS_BY_STATUS_ID } from '../../overview/components/detection_response/alerts_by_status/types';
import { useNonClosedAlerts } from '../hooks/use_non_closed_alerts';
import type { EntityDetailsPath } from '../../flyout/entity_details/shared/components/left_panel/left_panel_header';
import { useUiSetting } from '../../common/lib/kibana';
import type { EntityStoreRecord } from '../../flyout/entity_details/shared/hooks/use_entity_from_store';

export type CloudPostureEntityIdentifier =
  | Extract<
      EntityIdentifierFields,
      | EntityIdentifierFields.hostName
      | EntityIdentifierFields.userName
      | EntityIdentifierFields.generic
    >
  | 'related.entity'; // related.entity is not an entity identifier field, but it includes entity ids which we use to filter for related entities

export const EntityInsight = <T,>({
  identityFields,
  isPreviewMode,
  openDetailsPanel,
  entityType,
  entityRecord,
  hideHeaderIcons,
}: {
  identityFields: IdentityFields;
  isPreviewMode: boolean;
  openDetailsPanel: (path: EntityDetailsPath) => void;
  /** Host or user when the flyout represents that entity; enables v2 alerts resolution by `entity.id`. */
  entityType?: string;
  entityRecord?: EntityStoreRecord | null;
  /** When true, hides the chevron icons in the section headers. Used by the v2 flyout. */
  hideHeaderIcons?: boolean;
}) => {
  const { euiTheme } = useEuiTheme();
  const euidApi = useEntityStoreEuidApi();
  const entityStoreV2Enabled = useUiSetting<boolean>(FF_ENABLE_ENTITY_STORE_V2);
  const insightContent: React.ReactElement[] = [];

  const cspPreviewEntityType = inferEntityTypeFromIdentityFields(identityFields);
  const {
    hasMisconfigurationFindings: showMisconfigurationsPreview,
    passedFindings,
    failedFindings,
  } = useHasMisconfigurations(
    buildEuidCspPreviewOptions(cspPreviewEntityType, entityRecord, euidApi, {
      entityStoreV2Enabled,
      legacyIdentityFields: identityFields,
    })
  );

  const { hasVulnerabilitiesFindings } = useHasVulnerabilities(
    buildEuidCspPreviewOptions(cspPreviewEntityType, entityRecord, euidApi, {
      entityStoreV2Enabled,
      legacyIdentityFields: identityFields,
    })
  );

  const showVulnerabilitiesPreview =
    hasVulnerabilitiesFindings && Object.keys(identityFields).length > 0;

  const { to, from } = useGlobalTime();

  const { hasNonClosedAlerts: showAlertsPreview, filteredAlertsData } = useNonClosedAlerts({
    identityFields,
    entityRecord,
    entityType,
    to,
    from,
    queryId: DETECTION_RESPONSE_ALERTS_BY_STATUS_ID,
  });

  if (showAlertsPreview) {
    insightContent.push(
      <>
        <AlertsPreview
          alertsData={filteredAlertsData}
          isPreviewMode={isPreviewMode}
          openDetailsPanel={openDetailsPanel}
          hideHeaderIcons={hideHeaderIcons}
        />
        <EuiSpacer size="s" />
      </>
    );
  }
  if (showMisconfigurationsPreview)
    insightContent.push(
      <>
        <MisconfigurationsPreview
          isPreviewMode={isPreviewMode}
          passedFindings={passedFindings}
          failedFindings={failedFindings}
          openDetailsPanel={openDetailsPanel}
          hideHeaderIcons={hideHeaderIcons}
        />
        <EuiSpacer size="s" />
      </>
    );
  if (showVulnerabilitiesPreview)
    insightContent.push(
      <>
        <VulnerabilitiesPreview
          identityFields={identityFields}
          entityRecord={entityRecord}
          isPreviewMode={isPreviewMode}
          openDetailsPanel={openDetailsPanel}
        />
        <EuiSpacer size="s" />
      </>
    );
  return (
    <>
      {insightContent.length > 0 && (
        <>
          <EuiAccordion
            initialIsOpen={true}
            id="entityInsight-accordion"
            data-test-subj="entityInsightTestSubj"
            buttonProps={{
              'data-test-subj': 'entityInsight-accordion-button',
              css: css`
                color: ${euiTheme.colors.primary};
              `,
            }}
            buttonContent={
              <EuiTitle size="xs">
                <h3>
                  <FormattedMessage
                    id="xpack.securitySolution.flyout.entityDetails.insightsTitle"
                    defaultMessage="Insights"
                  />
                </h3>
              </EuiTitle>
            }
          >
            <EuiSpacer size="m" />
            {insightContent}
          </EuiAccordion>
          <EuiHorizontalRule />
        </>
      )}
    </>
  );
};
