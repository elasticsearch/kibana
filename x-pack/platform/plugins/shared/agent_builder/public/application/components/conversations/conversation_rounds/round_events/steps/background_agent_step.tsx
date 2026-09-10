/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiIcon,
  EuiLink,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import type { BackgroundAgentCompleteStep as BackgroundAgentCompleteStepData } from '@kbn/agent-builder-common';
import { ExecutionStatus, AGENT_BUILDER_UI_EBT } from '@kbn/agent-builder-common';
import { getEbtProps } from '@kbn/ebt-click';
import { StepLayout } from '../step_layout';
import { JsonCodeBlock } from '../json_code_block';

const viewJsonLabel = i18n.translate(
  'xpack.agentBuilder.roundEvents.steps.backgroundAgent.viewJson',
  { defaultMessage: 'View JSON' }
);

const flyoutTitle = i18n.translate(
  'xpack.agentBuilder.roundEvents.steps.backgroundAgent.flyoutTitle',
  { defaultMessage: 'Background agent result' }
);

interface BackgroundAgentStepProps {
  step: BackgroundAgentCompleteStepData;
}

export const BackgroundAgentStep: React.FC<BackgroundAgentStepProps> = ({ step }) => {
  return <StepLayout label={<BackgroundAgentHeadline step={step} />} />;
};

const BackgroundAgentHeadline: React.FC<{ step: BackgroundAgentCompleteStepData }> = ({ step }) => {
  const [isFlyoutOpen, setIsFlyoutOpen] = useState(false);
  const openFlyout = useCallback(() => setIsFlyoutOpen(true), []);
  const closeFlyout = useCallback(() => setIsFlyoutOpen(false), []);

  const isFailure =
    step.status === ExecutionStatus.failed || step.status === ExecutionStatus.aborted;

  const flyoutData = {
    execution_id: step.execution_id,
    status: step.status,
    response: step.response,
    error: step.error,
    completed_at: step.completed_at,
  };

  return (
    <EuiFlexGroup direction="row" gutterSize="s" alignItems="center" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiText size="s" color={isFailure ? 'danger' : 'inherit'}>
          <p role="status">
            {isFailure ? (
              <FormattedMessage
                id="xpack.agentBuilder.roundEvents.steps.backgroundAgent.failed"
                defaultMessage="Background agent {status}"
                values={{
                  status: <EuiBadge color="danger">{step.status}</EuiBadge>,
                }}
              />
            ) : (
              <FormattedMessage
                id="xpack.agentBuilder.roundEvents.steps.backgroundAgent.completed"
                defaultMessage="Background agent completed"
              />
            )}
          </p>
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiIcon type="dot" size="s" color="textDisabled" aria-hidden={true} />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiLink
          color="text"
          onClick={openFlyout}
          data-test-subj="backgroundAgentViewJsonLink"
          {...getEbtProps({
            element: AGENT_BUILDER_UI_EBT.element.pageContent,
            action: AGENT_BUILDER_UI_EBT.action.conversation.VIEW_TOOL_RESPONSE,
            detail: 'conversation',
          })}
        >
          {viewJsonLabel}
        </EuiLink>
      </EuiFlexItem>
      {isFlyoutOpen && (
        <EuiFlyout onClose={closeFlyout} aria-labelledby="backgroundAgentFlyoutTitle" size="m">
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size="m">
              <h2 id="backgroundAgentFlyoutTitle">{flyoutTitle}</h2>
            </EuiTitle>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            <JsonCodeBlock data={flyoutData} />
          </EuiFlyoutBody>
        </EuiFlyout>
      )}
    </EuiFlexGroup>
  );
};
