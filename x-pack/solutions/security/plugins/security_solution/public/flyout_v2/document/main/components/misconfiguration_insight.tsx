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
import { useMisconfigurationPreview } from '@kbn/cloud-security-posture/src/hooks/use_misconfiguration_preview';
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
import { useGetFindingsStats } from '../../../../cloud_security_posture/components/misconfiguration/misconfiguration_preview';
import { FormattedCount } from '../../../../common/components/formatted_number';

interface MisconfigurationsInsightProps {
  /**
   * Entity identifiers used to filter the misconfigurations by.
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
   * Callback to show misconfiguration details. When omitted, the count is rendered as plain text.
   */
  onShowMisconfigurationsDetails?: () => void;
}

/*
 * Displays a distribution bar with the count of total misconfigurations for a given entity
 */
export const MisconfigurationsInsight: React.FC<MisconfigurationsInsightProps> = ({
  identityFields,
  direction,
  'data-test-subj': dataTestSubj,
  telemetryKey,
  onShowMisconfigurationsDetails,
}) => {
  const renderingId = useGeneratedHtmlId();
  const { euiTheme } = useEuiTheme();
  const euidApi = useEntityStoreEuidApi();
  const entityType = inferEntityTypeFromIdentityFields(identityFields);
  const cspPreviewOptions = useMemo(
    () =>
      buildEuidCspPreviewOptions(entityType, identityFields, euidApi, {
        legacyIdentityFields: identityFields,
      }),
    [euidApi, entityType, identityFields]
  );
  const { data } = useMisconfigurationPreview(cspPreviewOptions);

  const passedFindings = data?.count.passed || 0;
  const failedFindings = data?.count.failed || 0;
  const totalFindings = useMemo(
    () => passedFindings + failedFindings,
    [passedFindings, failedFindings]
  );
  const shouldRender = totalFindings > 0; // this component only renders if there are findings

  useEffect(() => {
    if (shouldRender && telemetryKey) {
      uiMetricService.trackUiMetric(METRIC_TYPE.COUNT, telemetryKey);
    }
  }, [shouldRender, telemetryKey, renderingId]);

  const misconfigurationsStats = useGetFindingsStats(passedFindings, failedFindings);

  const count = useMemo(
    () => (
      <div
        css={css`
          margin-top: ${euiTheme.size.xs};
          margin-bottom: ${euiTheme.size.xs};
        `}
      >
        {onShowMisconfigurationsDetails ? (
          <EuiToolTip
            content={
              <FormattedMessage
                id="xpack.securitySolution.flyout.insights.misconfiguration.misconfigurationCountTooltip"
                defaultMessage="Opens {count, plural, one {this misconfiguration} other {these misconfigurations}} in a new flyout"
                values={{ count: totalFindings }}
              />
            }
          >
            <EuiLink
              data-test-subj={`${dataTestSubj}-count`}
              onClick={onShowMisconfigurationsDetails}
            >
              <FormattedCount count={totalFindings} />
            </EuiLink>
          </EuiToolTip>
        ) : (
          <span data-test-subj={`${dataTestSubj}-count`}>
            <FormattedCount count={totalFindings} />
          </span>
        )}
      </div>
    ),
    [totalFindings, dataTestSubj, euiTheme.size, onShowMisconfigurationsDetails]
  );

  if (!shouldRender) return null;

  return (
    <EuiFlexItem data-test-subj={dataTestSubj}>
      <InsightDistributionBar
        title={
          <FormattedMessage
            id="xpack.securitySolution.insights.misconfigurationsTitle"
            defaultMessage="Misconfigurations:"
          />
        }
        stats={misconfigurationsStats}
        count={count}
        direction={direction}
        data-test-subj={`${dataTestSubj}-distribution-bar`}
      />
    </EuiFlexItem>
  );
};

MisconfigurationsInsight.displayName = 'MisconfigurationsInsight';
