/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiText, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { FormattedMessage } from '@kbn/i18n-react';
import { AGENT_BUILDER_UI_EBT } from '@kbn/agent-builder-common';
import { isErrorResult } from '@kbn/agent-builder-common/tools/tool_result';
import type { ToolCallStep as ToolCallStepData } from '@kbn/agent-builder-common/chat/conversation';
import { StepLayout } from '../step_layout';
import { ToolCallStep } from './tool_call_step';

interface ToolCallGroupProps {
  steps: ToolCallStepData[];
}

export const ToolCallGroup: React.FC<ToolCallGroupProps> = ({ steps }) => {
  const { euiTheme } = useEuiTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const onToggle = () => setIsExpanded((v) => !v);

  const allResponded = steps.every((s) => s.results.length > 0);
  const hasError = steps.some((s) => s.results.some(isErrorResult));

  const label = (
    <EuiText size="s" color={hasError ? 'danger' : 'inherit'}>
      <p role="status">
        {allResponded ? (
          <FormattedMessage
            id="xpack.agentBuilder.roundEvents.toolCallGroup.responded"
            defaultMessage="{count, plural, one {# tool responded} other {# tools responded}}"
            values={{ count: steps.length }}
          />
        ) : (
          <FormattedMessage
            id="xpack.agentBuilder.roundEvents.toolCallGroup.calling"
            defaultMessage="{count, plural, one {Calling # tool} other {Calling # tools}}"
            values={{ count: steps.length }}
          />
        )}
      </p>
    </EuiText>
  );

  const expansionStyles = css`
    padding-left: ${euiTheme.size.s};
  `;

  return (
    <div data-test-subj="agentBuilderToolCallGroup">
      <StepLayout
        label={label}
        onClick={onToggle}
        isExpanded={isExpanded}
        expansion={
          <div css={expansionStyles}>
            <EuiFlexGroup direction="column" gutterSize="s">
              {steps.map((step) => (
                <EuiFlexItem grow={false} key={step.tool_call_id}>
                  <ToolCallStep step={step} />
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          </div>
        }
        ebtAction={AGENT_BUILDER_UI_EBT.action.conversation.EXPAND_TOOL_CALL_GROUP}
      />
    </div>
  );
};
