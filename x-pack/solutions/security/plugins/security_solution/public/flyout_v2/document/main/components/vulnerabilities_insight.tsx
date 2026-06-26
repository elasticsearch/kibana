/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo } from 'react';
import {
  type EuiFlexGroupProps,
  EuiFlexItem,
  EuiLink,
  EuiToolTip,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { css } from '@emotion/react';
import { useVulnerabilitiesPreview } from '@kbn/cloud-security-posture/src/hooks/use_vulnerabilities_preview';
import { useGetSeverityStatusColor } from '@kbn/cloud-security-posture/src/hooks/use_get_severity_status_color';
import { getVulnerabilityStats, hasVulnerabilitiesData } from '@kbn/cloud-security-posture';
import {
  type CloudSecurityUiCounters,
  uiMetricService,
} from '@kbn/cloud-security-posture-common/utils/ui_metrics';
import { METRIC_TYPE } from '@kbn/analytics';
import { useEntityStoreEuidApi } from '@kbn/entity-store/public';
import {
  buildEuidCspPreviewOptions,
  inferEntityTypeFromIdentityFields,
} from '../../../../cloud_security_posture/utils/build_euid_csp_preview_options';
import { InsightDistributionBar } from './insight_distribution_bar';
import { FormattedCount } from '../../../../common/components/formatted_number';

interface VulnerabilitiesInsightProps {
  /**
   * Entity identifiers used to filter the vulnerabilities by.
   */
  identityFields: Record<string, string>;
  /**
   * The direction of the flex group
   */
  direction?: EuiFlexGroupProps['direction'];
  /**
   * The data-test-subj to use for the component
   */
  ['data-test-subj']?: string;
  /**
   * used to track the instance of this component, prefer kebab-case
   */
  telemetryKey?: CloudSecurityUiCounters;
  /**
   * Callback to show vulnerability details. When omitted, the count is rendered as plain text.
   */
  onShowVulnerabilitiesDetails?: () => void;
}

/*
 * Displays a distribution bar and the total vulnerabilities count for a given entity
 */
export const VulnerabilitiesInsight: React.FC<VulnerabilitiesInsightProps> = ({
  identityFields,
  direction,
  'data-test-subj': dataTestSubj,
  telemetryKey,
  onShowVulnerabilitiesDetails,
}) => {
  const renderingId = useGeneratedHtmlId();
  const { euiTheme } = useEuiTheme();
  const { getSeverityStatusColor } = useGetSeverityStatusColor();
  const euidApi = useEntityStoreEuidApi();
  const entityType = inferEntityTypeFromIdentityFields(identityFields);
  const cspPreviewOptions = useMemo(
    () =>
      buildEuidCspPreviewOptions(entityType, identityFields, euidApi, {
        legacyIdentityFields: identityFields,
      }),
    [euidApi, entityType, identityFields]
  );
  const { data } = useVulnerabilitiesPreview(cspPreviewOptions);

  const { CRITICAL = 0, HIGH = 0, MEDIUM = 0, LOW = 0, NONE = 0 } = data?.count || {};
  const totalVulnerabilities = useMemo(
    () => CRITICAL + HIGH + MEDIUM + LOW + NONE,
    [CRITICAL, HIGH, MEDIUM, LOW, NONE]
  );

  // this component only renders if there are findings
  const shouldRender = useMemo(
    () =>
      hasVulnerabilitiesData({
        critical: CRITICAL,
        high: HIGH,
        medium: MEDIUM,
        low: LOW,
        none: NONE,
      }),
    [CRITICAL, HIGH, MEDIUM, LOW, NONE]
  );

  useEffect(() => {
    if (shouldRender && telemetryKey) {
      uiMetricService.trackUiMetric(METRIC_TYPE.COUNT, telemetryKey);
    }
  }, [shouldRender, telemetryKey, renderingId]);

  const vulnerabilitiesStats = useMemo(
    () =>
      getVulnerabilityStats(
        {
          critical: CRITICAL,
          high: HIGH,
          medium: MEDIUM,
          low: LOW,
          none: NONE,
        },
        getSeverityStatusColor
      ),
    [CRITICAL, HIGH, MEDIUM, LOW, NONE, getSeverityStatusColor]
  );

  const count = useMemo(
    () => (
      <div
        css={css`
          margin-top: ${euiTheme.size.xs};
          margin-bottom: ${euiTheme.size.xs};
        `}
      >
        {onShowVulnerabilitiesDetails ? (
          <EuiToolTip
            content={
              <FormattedMessage
                id="xpack.securitySolution.flyout.insights.vulnerabilities.vulnerabilitiesCountTooltip"
                defaultMessage="Opens {count, plural, one {this vulnerability} other {these vulnerabilities}} in a new flyout"
                values={{ count: totalVulnerabilities }}
              />
            }
          >
            <EuiLink
              data-test-subj={`${dataTestSubj}-count`}
              onClick={onShowVulnerabilitiesDetails}
            >
              <FormattedCount count={totalVulnerabilities} />
            </EuiLink>
          </EuiToolTip>
        ) : (
          <span data-test-subj={`${dataTestSubj}-count`}>
            <FormattedCount count={totalVulnerabilities} />
          </span>
        )}
      </div>
    ),
    [totalVulnerabilities, dataTestSubj, euiTheme.size, onShowVulnerabilitiesDetails]
  );

  if (!shouldRender) return null;

  return (
    <EuiFlexItem data-test-subj={dataTestSubj}>
      <InsightDistributionBar
        title={
          <FormattedMessage
            id="xpack.securitySolution.flyout.insights.vulnerabilitiesTitle"
            defaultMessage="Vulnerabilities:"
          />
        }
        stats={vulnerabilitiesStats}
        count={count}
        direction={direction}
        data-test-subj={`${dataTestSubj}-distribution-bar`}
      />
    </EuiFlexItem>
  );
};

VulnerabilitiesInsight.displayName = 'VulnerabilitiesInsight';
