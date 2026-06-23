/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReadKnowledgeBaseResponse } from '@kbn/elastic-assistant-common';
import React, { useCallback, useMemo } from 'react';
import useLocalStorage from 'react-use/lib/useLocalStorage';
import { some } from 'lodash';
import { noop } from 'lodash/fp';
import {
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLink,
  EuiPanel,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { SetupKnowledgeBaseButton } from '@kbn/elastic-assistant/impl/knowledge_base/setup_knowledge_base_button';
import {
  DEFEND_INSIGHTS_STORAGE_KEY,
  ConnectorSelectorInline,
  DEFAULT_ASSISTANT_NAMESPACE,
  AssistantSpaceIdProvider,
} from '@kbn/elastic-assistant';
import { useLoadConnectors } from '@kbn/inference-connectors';
import { FormattedMessage } from '@kbn/i18n-react';

import { useUserPrivileges } from '../../../../../../../common/components/user_privileges';
import { useSpaceId } from '../../../../../../../common/hooks/use_space_id';
import { WORKFLOW_INSIGHTS } from '../../../translations';
import { useKibana } from '../../../../../../../common/lib/kibana';

interface WorkflowInsightsScanSectionProps {
  isScanButtonDisabled: boolean;
  onScanButtonClick: ({
    actionTypeId,
    connectorId,
  }: {
    actionTypeId: string;
    connectorId: string;
  }) => void;
  inferenceEnabled: boolean;
  kbStatus?: ReadKnowledgeBaseResponse;
  defendInsightsPolicyResponseFailureEnabled: boolean;
}

export const WorkflowInsightsScanSection = ({
  isScanButtonDisabled,
  onScanButtonClick,
  inferenceEnabled,
  kbStatus,
  defendInsightsPolicyResponseFailureEnabled,
}: WorkflowInsightsScanSectionProps) => {
  const CONNECTOR_ID_LOCAL_STORAGE_KEY = 'connectorId';

  const spaceId = useSpaceId();
  const { http, settings, docLinks } = useKibana().services;
  const { data: aiConnectors } = useLoadConnectors({
    http,
    featureId: 'defend_insights',
    settings,
  });
  const { canWriteWorkflowInsights } = useUserPrivileges().endpointPrivileges;

  const { setupKB, setupOngoing, docsLinkText } = WORKFLOW_INSIGHTS.knowledgeBase;

  // Store the selected connector id in local storage so that it persists across page reloads
  const [localStorageWorkflowInsightsConnectorId, setLocalStorageWorkflowInsightsConnectorId] =
    useLocalStorage<string>(
      `${DEFAULT_ASSISTANT_NAMESPACE}.${DEFEND_INSIGHTS_STORAGE_KEY}.${
        spaceId || 'default'
      }.${CONNECTOR_ID_LOCAL_STORAGE_KEY}`
    );

  const [connectorId, setConnectorId] = React.useState<string | undefined>(
    localStorageWorkflowInsightsConnectorId
  );

  const onConnectorIdSelected = useCallback(
    (selectedConnectorId: string) => {
      setConnectorId(selectedConnectorId);
      setLocalStorageWorkflowInsightsConnectorId(selectedConnectorId);
    },
    [setLocalStorageWorkflowInsightsConnectorId]
  );

  // Check if the selected connector exists in the list of connectors, i.e. it is not deleted
  const connectorExists = useMemo(
    () => some(aiConnectors, ['id', connectorId]),
    [aiConnectors, connectorId]
  );

  const selectedConnectorActionTypeId = useMemo(() => {
    const selectedConnector = aiConnectors?.find((connector) => connector.id === connectorId);
    return selectedConnector?.actionTypeId;
  }, [aiConnectors, connectorId]);

  // Render the scan button only if a connector is selected
  const scanButton = useMemo(() => {
    if (!connectorExists) {
      return null;
    }

    const button = (
      <EuiFlexItem grow={false}>
        <EuiButton
          data-test-subj="workflowInsightsScanButton"
          size="s"
          isLoading={isScanButtonDisabled}
          isDisabled={!canWriteWorkflowInsights}
          onClick={() => {
            if (!connectorId || !selectedConnectorActionTypeId) return;
            onScanButtonClick({ connectorId, actionTypeId: selectedConnectorActionTypeId });
          }}
          fill
        >
          {isScanButtonDisabled ? WORKFLOW_INSIGHTS.scan.loading : WORKFLOW_INSIGHTS.scan.button}
        </EuiButton>
      </EuiFlexItem>
    );

    if (!canWriteWorkflowInsights) {
      return (
        <EuiToolTip content={WORKFLOW_INSIGHTS.scan.noPermissions} position={'top'}>
          {button}
        </EuiToolTip>
      );
    }
    return button;
  }, [
    canWriteWorkflowInsights,
    connectorExists,
    connectorId,
    isScanButtonDisabled,
    onScanButtonClick,
    selectedConnectorActionTypeId,
  ]);

  return (
    <EuiPanel paddingSize="m" hasShadow={false} hasBorder>
      <EuiFlexGroup direction="column" gutterSize="m">
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" gutterSize="m">
          <EuiFlexItem grow={false}>
            <EuiFlexGroup alignItems="center" gutterSize="s">
              <EuiFlexItem grow={false}>
                <EuiIcon type="sparkles" aria-hidden={true} />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="s">
                  <h4>{WORKFLOW_INSIGHTS.scan.title}</h4>
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup alignItems="center" gutterSize="s">
              <EuiFlexItem grow={false}>
                {spaceId && (
                  <AssistantSpaceIdProvider spaceId={spaceId}>
                    <ConnectorSelectorInline
                      onConnectorSelected={noop}
                      onConnectorIdSelected={onConnectorIdSelected}
                      selectedConnectorId={connectorId}
                    />
                  </AssistantSpaceIdProvider>
                )}
              </EuiFlexItem>
              {scanButton}
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
        {defendInsightsPolicyResponseFailureEnabled &&
          !!kbStatus &&
          !kbStatus?.defend_insights_exists && (
            <EuiFlexGroup direction="column" alignItems="center" gutterSize="m">
              <EuiFlexItem>
                <EuiText size="s">
                  {kbStatus?.is_setup_in_progress ? (
                    setupOngoing
                  ) : (
                    <FormattedMessage
                      id="xpack.securitySolution.endpointDetails.workflowInsights.knowledgeBase.setupRequired"
                      defaultMessage="This scan is for incompatible antiviruses. To also scan for Policy Response issues, you should first {setupKB}. This may take a while."
                      values={{ setupKB: <b>{setupKB}</b> }}
                    />
                  )}
                  {!kbStatus?.is_setup_in_progress && (
                    <EuiLink
                      href={docLinks.links.securitySolution.aiAssistant.knowledgeBaseHome}
                      target="_blank"
                    >
                      {` ${docsLinkText}`}
                    </EuiLink>
                  )}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem>
                <SetupKnowledgeBaseButton fill={false} />
              </EuiFlexItem>
            </EuiFlexGroup>
          )}
      </EuiFlexGroup>
    </EuiPanel>
  );
};
