/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable no-console */
import React, { useCallback, useRef, useEffect } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { TutorialDefinition } from '../../../hooks/use_tutorial_content';
import { useResetWithCleanup } from '../../../hooks/use_reset_with_cleanup';
import { useTutorialState } from './tutorial_state';
import { TutorialStepCard } from './tutorial_step_card';
import { TutorialSummary } from './tutorial_summary';
import { CleanupStepCard } from './cleanup_step_card';

export interface TutorialRunnerProps {
  tutorial: TutorialDefinition;
  onBack: () => void;
}

export const TutorialRunner: React.FC<TutorialRunnerProps> = ({ tutorial, onBack }) => {
  const { state, steps, executeStep, advanceStep, isStepReady, reset } = useTutorialState(
    tutorial.slug
  );

  const hasCleanup = !!tutorial.cleanup?.length;
  const totalStepCount = steps.length + (hasCleanup ? 1 : 0);
  const showCleanup = hasCleanup && state.currentStep >= steps.length && !state.completed;

  const stepRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const { resetWithCleanup, isResetting } = useResetWithCleanup(
    tutorial.cleanup,
    state.savedValues,
    () => {
      reset();
      stepRefs.current.get(0)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  );

  const setStepRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) {
      stepRefs.current.set(index, el);
    } else {
      stepRefs.current.delete(index);
    }
  }, []);

  const prevStepRef = useRef(state.currentStep);
  useEffect(() => {
    if (state.currentStep > prevStepRef.current) {
      const el = stepRefs.current.get(state.currentStep);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    prevStepRef.current = state.currentStep;
  }, [state.currentStep]);

  const scrollToCurrentStep = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const el = stepRefs.current.get(state.currentStep);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [state.currentStep]);

  const handleExecute = useCallback(
    (stepIndex: number) => {
      const step = steps[stepIndex];
      console.log('[Telemetry] Step executed', {
        tutorial: tutorial.slug,
        stepId: step?.source.id,
        stepIndex,
      });
      executeStep(stepIndex).catch(() => {
        // Error state is handled via stepStates; no additional action needed
      });
    },
    [executeStep, steps, tutorial.slug]
  );

  const handleAdvance = useCallback(() => {
    const currentStepDef = steps[state.currentStep];
    const isOnCleanup = hasCleanup && state.currentStep === steps.length;
    const isLastRegularStep = !hasCleanup && state.currentStep === steps.length - 1;
    if (isOnCleanup || isLastRegularStep) {
      console.log('[Telemetry] Complete tutorial clicked', {
        tutorial: tutorial.slug,
        stepId: currentStepDef?.source.id ?? 'cleanup',
        stepIndex: state.currentStep,
      });
    } else {
      console.log('[Telemetry] Next step clicked', {
        tutorial: tutorial.slug,
        stepId: currentStepDef?.source.id,
        stepIndex: state.currentStep,
      });
    }
    advanceStep();
  }, [advanceStep, hasCleanup, state.currentStep, steps, tutorial.slug]);

  const visibleSteps = steps.slice(0, state.currentStep + 1);

  return (
    <EuiFlexGroup direction="column" gutterSize="l">
      <EuiFlexGroup
        justifyContent="spaceBetween"
        alignItems="center"
        css={css`
          position: sticky;
          top: var(--euiFixedHeadersOffset, 0);
          z-index: 10;
          background: var(--euiColorEmptyShade, #fff);
          padding-block: 12px;
          margin-block: -12px;
        `}
      >
        <EuiFlexItem grow={false}>
          <EuiTitle size="s">
            <h2>{tutorial.title}</h2>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="s" alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiToolTip
                content={i18n.translate('xpack.searchGettingStarted.tutorial.runner.jumpToStep', {
                  defaultMessage: 'Jump to current step',
                })}
              >
                <EuiButtonEmpty
                  size="s"
                  onClick={scrollToCurrentStep}
                  data-test-subj="tutorialStepProgress"
                >
                  {i18n.translate('xpack.searchGettingStarted.tutorial.runner.stepProgress', {
                    defaultMessage: 'Step {current} of {total}',
                    values: {
                      current: Math.min(state.currentStep + 1, totalStepCount),
                      total: totalStepCount,
                    },
                  })}
                </EuiButtonEmpty>
              </EuiToolTip>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                iconType="refresh"
                color="text"
                onClick={resetWithCleanup}
                isLoading={isResetting}
                data-test-subj="tutorialReset"
              >
                {i18n.translate('xpack.searchGettingStarted.tutorial.runner.reset', {
                  defaultMessage: 'Reset',
                })}
              </EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                iconType="arrowLeft"
                color="text"
                onClick={onBack}
                data-test-subj="tutorialBack"
              >
                {i18n.translate('xpack.searchGettingStarted.tutorial.runner.back', {
                  defaultMessage: 'All tutorials',
                })}
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>

      {visibleSteps.map((step, i) => (
        <div
          key={step.source.id}
          ref={(el) => setStepRef(i, el)}
          css={css`
            scroll-margin-top: calc(var(--euiFixedHeadersOffset, 0) + 60px);
          `}
        >
          <TutorialStepCard
            step={step}
            stepIndex={i}
            isCurrentStep={i === state.currentStep}
            isReady={isStepReady(i)}
            onExecute={() => handleExecute(i)}
            onAdvance={handleAdvance}
            isLastStep={!hasCleanup && i === steps.length - 1}
          />
        </div>
      ))}

      {showCleanup && (
        <div
          ref={(el) => setStepRef(steps.length, el)}
          css={css`
            scroll-margin-top: calc(var(--euiFixedHeadersOffset, 0) + 60px);
          `}
        >
          <CleanupStepCard
            cleanup={tutorial.cleanup!}
            savedValues={state.savedValues}
            onComplete={handleAdvance}
          />
        </div>
      )}

      {state.completed && (
        <>
          <EuiSpacer size="l" />
          <TutorialSummary summary={tutorial.summary} />
        </>
      )}
    </EuiFlexGroup>
  );
};
