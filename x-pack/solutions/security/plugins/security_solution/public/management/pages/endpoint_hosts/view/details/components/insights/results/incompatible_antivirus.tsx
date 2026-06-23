/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import {
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPanel,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { ENDPOINT_ARTIFACT_LISTS } from '@kbn/securitysolution-list-constants';

import type {
  ExceptionListRemediationType,
  SecurityWorkflowInsight,
} from '../../../../../../../../../common/endpoint/types/workflow_insights';
import type { WorkflowInsightRouteState } from '../../../../../types';
import { useUserPrivileges } from '../../../../../../../../common/components/user_privileges';
import { useKibana } from '../../../../../../../../common/lib/kibana';
import { APP_PATH, TRUSTED_APPS_PATH } from '../../../../../../../../../common/constants';
import { WORKFLOW_INSIGHTS } from '../../../../translations';
import { getEndpointDetailsPath } from '../../../../../../../common/routing';

interface WorkflowInsightsIncompatibleAntivirusResultProps {
  insight: SecurityWorkflowInsight;
  index: number;
  endpointId: string;
}

export const WorkflowInsightsIncompatibleAntivirusResult = ({
  insight,
  index,
  endpointId,
}: WorkflowInsightsIncompatibleAntivirusResultProps) => {
  const { ariaLabel, actionText, tooltipContent, tooltipNoPermissions } =
    WORKFLOW_INSIGHTS.issues.remediationButton.incompatibleAntivirus;

  const { canWriteTrustedApplications } = useUserPrivileges().endpointPrivileges;
  const {
    application: { navigateToUrl },
  } = useKibana().services;

  const openArtifactCreationPage = useCallback(
    ({ remediation, id }: { remediation: ExceptionListRemediationType; id: string }) => {
      const getUrlBasedOnListId = (listId: string) => {
        switch (listId) {
          case ENDPOINT_ARTIFACT_LISTS.trustedApps.id:
          default:
            return TRUSTED_APPS_PATH;
        }
      };

      const url = `${APP_PATH}${getUrlBasedOnListId(remediation.list_id)}?show=create`;

      const state: WorkflowInsightRouteState = {
        insight: {
          id,
          back_url: `${APP_PATH}${getEndpointDetailsPath({
            name: 'endpointDetails',
            selected_endpoint: endpointId,
          })}`,
          item: {
            comments: [],
            description: remediation.description,
            entries: remediation.entries,
            list_id: remediation.list_id,
            name: remediation.name,
            namespace_type: 'agnostic',
            tags: remediation.tags,
            type: 'simple',
            os_types: remediation.os_types,
          },
        },
      };

      navigateToUrl(url, {
        state,
      });
    },
    [endpointId, navigateToUrl]
  );

  return (insight.remediation.exception_list_items ?? []).map((exceptionListItem) => {
    return (
      <EuiPanel
        paddingSize="m"
        hasShadow={false}
        hasBorder
        key={index}
        data-test-subj={`workflowInsightsResult-${index}`}
      >
        <EuiFlexGroup alignItems={'center'} gutterSize={'m'}>
          <EuiFlexItem grow={false}>
            <EuiIcon type="securityApp" size="l" color="warning" aria-hidden={true} />
          </EuiFlexItem>

          <EuiFlexItem>
            <EuiText size="s">
              <EuiText size={'s'}>
                <strong>{insight.metadata.display_name || insight.value}</strong>
              </EuiText>
              <EuiText size={'s'} color={'subdued'}>
                {insight.message}
              </EuiText>
              <EuiText
                size={'xs'}
                color={'subdued'}
                css={{
                  wordBreak: 'break-word',
                }}
              >
                {exceptionListItem.entries[0].type === 'match' &&
                  exceptionListItem.entries[0].field === 'process.executable.caseless' &&
                  exceptionListItem.entries[0].value}
              </EuiText>
            </EuiText>
          </EuiFlexItem>

          <EuiFlexItem grow={false} css={{ marginLeft: 'auto' }}>
            <EuiToolTip
              content={canWriteTrustedApplications ? tooltipContent : tooltipNoPermissions}
              position={'top'}
            >
              <EuiButtonEmpty
                data-test-subj={`workflowInsightsResult-${index}-remediation`}
                isDisabled={!canWriteTrustedApplications}
                aria-label={ariaLabel}
                iconType="plusCircle"
                href={`${APP_PATH}${TRUSTED_APPS_PATH}?show=create`}
                onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                  e.preventDefault();
                  if (insight.id) {
                    openArtifactCreationPage({
                      remediation: exceptionListItem,
                      id: insight.id,
                    });
                  }
                }}
              >
                {actionText}
              </EuiButtonEmpty>
            </EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    );
  });
};
