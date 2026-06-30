/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { css } from '@emotion/react';
import { EuiFlexGroup, EuiFlexItem, EuiSpacer, EuiText, EuiTitle, useEuiTheme } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { DistributionBar } from '@kbn/security-solution-distribution-bar';
import { useVulnerabilitiesPreview } from '@kbn/cloud-security-posture/src/hooks/use_vulnerabilities_preview';
import { useGetSeverityStatusColor } from '@kbn/cloud-security-posture/src/hooks/use_get_severity_status_color';
import { getAbbreviatedNumber } from '@kbn/cloud-security-posture-common';
import { getVulnerabilityStats, hasVulnerabilitiesData } from '@kbn/cloud-security-posture';
import {
  ENTITY_FLYOUT_WITH_VULNERABILITY_PREVIEW,
  uiMetricService,
} from '@kbn/cloud-security-posture-common/utils/ui_metrics';
import { METRIC_TYPE } from '@kbn/analytics';
import { FF_ENABLE_ENTITY_STORE_V2, useEntityStoreEuidApi } from '@kbn/entity-store/public';
import type { EntityStoreRecord } from '../../../flyout/entity_details/shared/hooks/use_entity_from_store';
import {
  buildEuidCspPreviewOptions,
  inferEntityTypeFromIdentityFields,
} from '../../utils/build_euid_csp_preview_options';
import { ExpandablePanel } from '../../../flyout_v2/shared/components/expandable_panel';
import type { EntityDetailsPath } from '../../../flyout/entity_details/shared/components/left_panel/left_panel_header';
import {
  CspInsightLeftPanelSubTab,
  EntityDetailsLeftPanelTab,
} from '../../../flyout/entity_details/shared/components/left_panel/left_panel_header';
import type { IdentityFields } from '../../../flyout/document_details/shared/utils';
import { useUiSetting } from '../../../common/lib/kibana';

const VulnerabilitiesCount = ({
  vulnerabilitiesTotal,
}: {
  vulnerabilitiesTotal: string | number;
}) => {
  const { euiTheme } = useEuiTheme();

  return (
    <EuiFlexItem>
      <EuiFlexGroup direction="column" gutterSize="none">
        <EuiFlexItem>
          <EuiTitle size="s">
            <h3>{vulnerabilitiesTotal}</h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText
            size="xs"
            css={css`
              font-weight: ${euiTheme.font.weight.semiBold};
            `}
          >
            <FormattedMessage
              id="xpack.securitySolution.flyout.right.insights.vulnerabilities.vulnerabilitiesCountDescription"
              defaultMessage="Vulnerabilities"
            />
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlexItem>
  );
};

export const VulnerabilitiesPreview = ({
  identityFields,
  entityRecord,
  isPreviewMode,
  openDetailsPanel,
}: {
  identityFields: IdentityFields;
  entityRecord?: EntityStoreRecord | null;
  isPreviewMode: boolean;
  openDetailsPanel: (path: EntityDetailsPath) => void;
}) => {
  useEffect(() => {
    uiMetricService.trackUiMetric(METRIC_TYPE.CLICK, ENTITY_FLYOUT_WITH_VULNERABILITY_PREVIEW);
  }, []);

  const euidApi = useEntityStoreEuidApi();
  const entityStoreV2Enabled = useUiSetting<boolean>(FF_ENABLE_ENTITY_STORE_V2);
  const entityType = inferEntityTypeFromIdentityFields(identityFields);
  const cspPreviewOptions = useMemo(
    () =>
      buildEuidCspPreviewOptions(entityType, entityRecord, euidApi, {
        entityStoreV2Enabled,
        legacyIdentityFields: identityFields,
      }),
    [entityType, entityRecord, euidApi, entityStoreV2Enabled, identityFields]
  );
  const { data } = useVulnerabilitiesPreview(cspPreviewOptions);

  const { CRITICAL = 0, HIGH = 0, MEDIUM = 0, LOW = 0, NONE = 0 } = data?.count || {};

  const totalVulnerabilities = CRITICAL + HIGH + MEDIUM + LOW + NONE;

  const hasVulnerabilitiesFindings = hasVulnerabilitiesData({
    critical: CRITICAL,
    high: HIGH,
    medium: MEDIUM,
    low: LOW,
    none: NONE,
  });

  const { euiTheme } = useEuiTheme();
  const { getSeverityStatusColor } = useGetSeverityStatusColor();

  const goToEntityInsightTab = useCallback(
    () =>
      openDetailsPanel({
        tab: EntityDetailsLeftPanelTab.CSP_INSIGHTS,
        subTab: CspInsightLeftPanelSubTab.VULNERABILITIES,
      }),
    [openDetailsPanel]
  );

  const link = useMemo(
    () => ({
      callback: goToEntityInsightTab,
      tooltip: (
        <FormattedMessage
          id="xpack.securitySolution.flyout.right.insights.vulnerabilities.vulnerabilitiesTooltip"
          defaultMessage="Show all vulnerabilities findings"
        />
      ),
    }),
    [goToEntityInsightTab]
  );

  const vulnerabilityStats = getVulnerabilityStats(
    {
      critical: CRITICAL,
      high: HIGH,
      medium: MEDIUM,
      low: LOW,
      none: NONE,
    },
    getSeverityStatusColor
  );

  return (
    <ExpandablePanel
      header={{
        iconType: !isPreviewMode && hasVulnerabilitiesFindings ? 'chevronLimitLeft' : '',
        title: (
          <EuiTitle
            css={css`
              font-weight: ${euiTheme.font.weight.semiBold};
            `}
          >
            <FormattedMessage
              id="xpack.securitySolution.flyout.right.insights.vulnerabilities.vulnerabilitiesTitle"
              defaultMessage="Vulnerabilities"
            />
          </EuiTitle>
        ),
        link: hasVulnerabilitiesFindings ? link : undefined,
      }}
      data-test-subj={'securitySolutionFlyoutInsightsVulnerabilities'}
    >
      <EuiFlexGroup gutterSize="none">
        <VulnerabilitiesCount vulnerabilitiesTotal={getAbbreviatedNumber(totalVulnerabilities)} />
        <EuiFlexItem grow={2}>
          <EuiFlexGroup direction="column" gutterSize="none">
            <EuiFlexItem />
            <EuiFlexItem>
              <EuiSpacer />
              <DistributionBar stats={vulnerabilityStats} />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </ExpandablePanel>
  );
};
