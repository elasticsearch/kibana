/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import {
  EuiButtonIcon,
  EuiCodeBlock,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiText,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { css } from '@emotion/react';
import type { StepStatus } from './tutorial_state';
import type { EsResponse } from '../../../hooks/use_execute_tutorial_step';

export interface StepCodeSectionProps {
  apiSnippet: string;
  status: StepStatus;
  response?: EsResponse;
  error?: string;
  isReady: boolean;
  onExecute: () => void;
  apiSnippetHighlightLines?: string;
  responseHighlightLines?: string;
}

const PLACEHOLDER_TEXT = i18n.translate(
  'xpack.searchGettingStarted.tutorial.stepCode.placeholder',
  { defaultMessage: 'Execute API call to see result' }
);

const CODE_PANEL_HEIGHT = 300;

const codeBlockFillHeight = css`
  flex: 1;
  min-height: 0;

  & .euiCodeBlock__pre {
    flex: 1;
  }
`;

const formatResponseBody = (response: EsResponse): string => {
  try {
    return JSON.stringify(response.body, null, 2);
  } catch {
    return String(response.body);
  }
};

const ResponsePane: React.FC<
  Pick<StepCodeSectionProps, 'status' | 'response' | 'error' | 'responseHighlightLines'>
> = ({ status, response, error, responseHighlightLines }) => {
  if (status === 'running') {
    return (
      <EuiFlexGroup
        alignItems="center"
        justifyContent="center"
        css={css`
          flex: 1;
        `}
      >
        <EuiLoadingSpinner size="l" />
      </EuiFlexGroup>
    );
  }

  if (status === 'failed') {
    return (
      <EuiCodeBlock
        language="json"
        fontSize="s"
        paddingSize="m"
        overflowHeight={CODE_PANEL_HEIGHT}
        isCopyable
        css={codeBlockFillHeight}
      >
        {response ? formatResponseBody(response) : error ?? 'Unknown error'}
      </EuiCodeBlock>
    );
  }

  if (status === 'completed' && response) {
    return (
      <EuiCodeBlock
        language="json"
        fontSize="s"
        paddingSize="m"
        overflowHeight={CODE_PANEL_HEIGHT}
        isCopyable
        css={codeBlockFillHeight}
        lineNumbers={
          responseHighlightLines ? { start: 1, highlight: responseHighlightLines } : false
        }
      >
        {formatResponseBody(response)}
      </EuiCodeBlock>
    );
  }

  return (
    <EuiFlexGroup
      alignItems="center"
      justifyContent="center"
      css={css`
        flex: 1;
      `}
    >
      <EuiText size="s" color="subdued">
        {PLACEHOLDER_TEXT}
      </EuiText>
    </EuiFlexGroup>
  );
};

export const StepCodeSection: React.FC<StepCodeSectionProps> = ({
  apiSnippet,
  status,
  response,
  error,
  isReady,
  onExecute,
  apiSnippetHighlightLines,
  responseHighlightLines,
}) => {
  const { euiTheme } = useEuiTheme();
  const isExecuting = status === 'running';
  const isCompleted = status === 'completed';
  const isFailed = status === 'failed';
  const canExecute = isReady && !isExecuting && !isCompleted;
  const showHighlights = isCompleted || isFailed;

  const codePanelStyle = useMemo(
    () => css`
      border: ${euiTheme.border.thin};
      border-radius: ${euiTheme.border.radius.medium};
      overflow: hidden;
      height: ${CODE_PANEL_HEIGHT}px;
      display: flex;
      flex-direction: column;
    `,
    [euiTheme]
  );

  const apiSnippetStyle = useMemo(
    () => css`
      ${codePanelStyle};
      &,
      & * {
        cursor: not-allowed !important;
      }
    `,
    [codePanelStyle]
  );

  const tooltipContent = (() => {
    if (isExecuting || isCompleted) return undefined;
    if (!isReady) {
      return i18n.translate('xpack.searchGettingStarted.tutorial.stepCode.notReady', {
        defaultMessage: 'Complete previous steps first',
      });
    }
    return i18n.translate('xpack.searchGettingStarted.tutorial.stepCode.execute', {
      defaultMessage: 'Run',
    });
  })();

  const handleClick = useCallback(() => {
    onExecute();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, [onExecute]);

  return (
    <EuiFlexGroup gutterSize="s" alignItems="stretch" responsive={false}>
      <EuiFlexItem grow={5}>
        <div css={apiSnippetStyle}>
          <EuiCodeBlock
            language="json"
            fontSize="s"
            paddingSize="m"
            overflowHeight={CODE_PANEL_HEIGHT}
            isCopyable
            css={codeBlockFillHeight}
            lineNumbers={
              showHighlights && apiSnippetHighlightLines
                ? { start: 1, highlight: apiSnippetHighlightLines }
                : false
            }
          >
            {apiSnippet}
          </EuiCodeBlock>
        </div>
      </EuiFlexItem>

      <EuiFlexItem
        grow={false}
        css={css`
          justify-content: center;
          align-items: center;
        `}
      >
        <EuiToolTip content={tooltipContent}>
          <EuiButtonIcon
            iconType="playFilled"
            aria-label={i18n.translate(
              'xpack.searchGettingStarted.tutorial.stepCode.executeAriaLabel',
              { defaultMessage: 'Execute API call' }
            )}
            color="primary"
            display="fill"
            size="m"
            isDisabled={!canExecute}
            isLoading={isExecuting}
            onClick={handleClick}
            data-test-subj="stepExecuteButton"
          />
        </EuiToolTip>
      </EuiFlexItem>

      <EuiFlexItem grow={5}>
        <div css={codePanelStyle}>
          <ResponsePane
            status={status}
            response={response}
            error={error}
            responseHighlightLines={showHighlights ? responseHighlightLines : undefined}
          />
        </div>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
