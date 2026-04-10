/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  EuiButton,
  EuiCallOut,
  EuiCodeBlock,
  EuiFlexGroup,
  EuiFlexItem,
  EuiMarkdownFormat,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { ResolvedStep } from './tutorial_state';
import { StepCodeSection } from './step_code_section';
import { StepExplanation } from './step_explanation';
import {
  getResponseHighlightLines,
  getSnippetHighlightLines,
} from '../new_tutorial_content/utils/highlight_utils';

export interface TutorialStepCardProps {
  step: ResolvedStep;
  stepIndex: number;
  isCurrentStep: boolean;
  isReady: boolean;
  onExecute: () => void;
  onAdvance: () => void;
  isLastStep: boolean;
}

export const TutorialStepCard: React.FC<TutorialStepCardProps> = ({
  step,
  stepIndex,
  isCurrentStep,
  isReady,
  onExecute,
  onAdvance,
  isLastStep,
}) => {
  const { resolved, state } = step;
  const isCompleted = state.status === 'completed';
  const isFailed = state.status === 'failed';
  const isRunning = state.status === 'running';
  const isIngestData = step.source.type === 'ingestData';

  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    if (!isRunning && isRetrying) {
      setIsRetrying(false);
    }
  }, [isRunning, isRetrying]);

  const handleRetry = useCallback(() => {
    setIsRetrying(true);
    onExecute();
  }, [onExecute]);

  const retryInProgress = isRetrying && isRunning;

  const responseHighlightLines = useMemo(() => {
    if (!isCompleted || !state.response) return undefined;
    const formatted = JSON.stringify(state.response.body, null, 2);
    return getResponseHighlightLines(formatted, step.source.valuesToSave) || undefined;
  }, [isCompleted, state.response, step.source.valuesToSave]);

  const apiSnippetHighlightLines = useMemo(() => {
    if (!isCompleted || !step.source.apiSnippetHighlights?.length) return undefined;
    return (
      getSnippetHighlightLines(resolved.apiSnippet, step.source.apiSnippetHighlights) || undefined
    );
  }, [isCompleted, resolved.apiSnippet, step.source.apiSnippetHighlights]);

  const showExplanation = isCompleted;
  const showRetryButton = (isFailed || retryInProgress) && isCurrentStep;
  const showAdvanceButton =
    (isCompleted || isFailed || retryInProgress) && isCurrentStep && !isLastStep;
  const showCompleteButton =
    (isCompleted || isFailed || retryInProgress) && isCurrentStep && isLastStep;
  const canIngest = isReady && !isRunning && !isCompleted;

  return (
    <EuiPanel hasBorder paddingSize="l" data-test-subj={`tutorialStep-${stepIndex}`}>
      <EuiMarkdownFormat textSize="m">{resolved.header}</EuiMarkdownFormat>
      <EuiSpacer size="s" />
      <EuiText size="s">
        <EuiMarkdownFormat textSize="s">{resolved.description}</EuiMarkdownFormat>
      </EuiText>
      <EuiSpacer size="m" />

      {isIngestData ? (
        <>
          <EuiCodeBlock language="json" fontSize="s" paddingSize="m" isCopyable>
            {resolved.apiSnippet}
          </EuiCodeBlock>
          <EuiSpacer size="m" />
          <EuiButton
            fill={!isCompleted}
            iconType={isCompleted ? 'check' : 'download'}
            color={isCompleted ? 'success' : 'primary'}
            isLoading={isRunning}
            isDisabled={!canIngest}
            onClick={onExecute}
            data-test-subj={`tutorialStep-${stepIndex}-ingest`}
          >
            {isCompleted
              ? i18n.translate('xpack.searchGettingStarted.tutorial.step.ingested', {
                  defaultMessage: 'Documents ingested',
                })
              : i18n.translate('xpack.searchGettingStarted.tutorial.step.ingest', {
                  defaultMessage: 'Ingest sample documents',
                })}
          </EuiButton>
          {isFailed && state.error && (
            <>
              <EuiSpacer size="s" />
              <EuiCallOut
                announceOnMount
                color="danger"
                iconType="error"
                size="s"
                title={state.error}
              />
            </>
          )}
        </>
      ) : (
        <StepCodeSection
          apiSnippet={resolved.apiSnippet}
          status={state.status}
          response={state.response}
          error={state.error}
          isReady={isReady}
          onExecute={onExecute}
          apiSnippetHighlightLines={apiSnippetHighlightLines}
          responseHighlightLines={responseHighlightLines}
        />
      )}

      <EuiSpacer size="m" />

      <StepExplanation explanation={resolved.explanation} visible={showExplanation} />

      {(showAdvanceButton || showCompleteButton || showRetryButton) && (
        <>
          <EuiSpacer size="m" />
          <EuiFlexGroup justifyContent="flexEnd" gutterSize="s">
            {showRetryButton && (
              <EuiFlexItem grow={false}>
                <EuiButton
                  color="warning"
                  iconType="refresh"
                  isLoading={retryInProgress}
                  onClick={handleRetry}
                  data-test-subj={`tutorialStep-${stepIndex}-retry`}
                >
                  {i18n.translate('xpack.searchGettingStarted.tutorial.step.retry', {
                    defaultMessage: 'Retry',
                  })}
                </EuiButton>
              </EuiFlexItem>
            )}
            {showAdvanceButton && (
              <EuiFlexItem grow={false}>
                <EuiButton
                  fill
                  iconType="arrowRight"
                  iconSide="right"
                  onClick={onAdvance}
                  data-test-subj={`tutorialStep-${stepIndex}-next`}
                >
                  {i18n.translate('xpack.searchGettingStarted.tutorial.step.next', {
                    defaultMessage: 'Next step',
                  })}
                </EuiButton>
              </EuiFlexItem>
            )}
            {showCompleteButton && (
              <EuiFlexItem grow={false}>
                <EuiButton
                  fill
                  iconType="check"
                  onClick={onAdvance}
                  data-test-subj={`tutorialStep-${stepIndex}-complete`}
                >
                  {i18n.translate('xpack.searchGettingStarted.tutorial.step.complete', {
                    defaultMessage: 'Complete tutorial',
                  })}
                </EuiButton>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </>
      )}
    </EuiPanel>
  );
};
