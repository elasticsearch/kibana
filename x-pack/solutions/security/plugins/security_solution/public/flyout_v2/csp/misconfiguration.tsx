/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiSpacer,
  EuiFlyoutHeader,
  EuiFlyoutBody,
} from '@elastic/eui';
import { CspEvaluationBadge } from '@kbn/cloud-security-posture';
import { useMisconfigurationFinding } from '@kbn/cloud-security-posture/src/hooks/use_misconfiguration_finding';
import { createMisconfigurationFindingsQuery } from '@kbn/cloud-security-posture-common/utils/findings_query_builders';
import { i18n } from '@kbn/i18n';
import { useKibana } from '../../common/lib/kibana';
import { PreferenceFormattedDate } from '../../common/components/formatted_date';
import { FlyoutError } from '../shared/components/flyout_error';
import { FlyoutLoading } from '../shared/components/flyout_loading';
import { FlyoutTitle } from '../shared/components/flyout_title';

export interface MisconfigurationProps {
  /**
   * The unique identifier of the cloud resource associated with the misconfiguration.
   */
  resourceId: string;
  /**
   * The unique identifier of the CSP rule that was evaluated.
   */
  ruleId: string;
}

/**
 * V2 system-flyout compatible misconfiguration finding panel.
 * This is a simplified version that doesn't use expandable flyout components.
 */
export const Misconfiguration = memo(({ resourceId, ruleId }: MisconfigurationProps) => {
  const { cloudSecurityPosture } = useKibana().services;
  const CspFlyout = cloudSecurityPosture.getCloudSecurityPostureMisconfigurationFlyout();

  const { data, isLoading, isError } = useMisconfigurationFinding({
    query: createMisconfigurationFindingsQuery(resourceId, ruleId),
    enabled: true,
    pageSize: 1,
  });

  const finding = data?.result.hits[0]?._source;

  if (isLoading) {
    return <FlyoutLoading data-test-subj="misconfiguration-panel-loading" />;
  }

  if (isError || !finding) {
    return <FlyoutError />;
  }

  return (
    <>
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup gutterSize="xs" responsive={false} direction="column">
          <EuiFlexItem grow={false}>
            <CspEvaluationBadge type={finding?.result?.evaluation} />
          </EuiFlexItem>
          {finding['@timestamp'] && (
            <EuiFlexItem grow={false}>
              <EuiText size="xs">
                <b>
                  {i18n.translate('xpack.securitySolution.csp.findingsFlyout.evaluatedAt', {
                    defaultMessage: 'Evaluated at ',
                  })}
                </b>
                <PreferenceFormattedDate value={new Date(finding['@timestamp'])} />
                <EuiSpacer size="xs" />
              </EuiText>
            </EuiFlexItem>
          )}
          <EuiFlexItem>
            <FlyoutTitle title={finding.rule.name} />
          </EuiFlexItem>
        </EuiFlexGroup>
        <CspFlyout.Header finding={finding} />
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <CspFlyout.Body finding={finding} />
      </EuiFlyoutBody>
    </>
  );
});

Misconfiguration.displayName = 'Misconfiguration';
