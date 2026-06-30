/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect } from 'react';
import { EuiButton, EuiButtonEmpty, EuiTourStep } from '@elastic/eui';
import {
  ATTACKS_TOUR_ANCHOR_TIMEOUT_MS,
  ATTACKS_TOUR_POPOVER_WIDTH,
  ATTACKS_TOUR_STEP_TEST_ID,
} from './constants';
import { useAttacksTour } from './attacks_tour_provider';
import { useIsAnchorMounted } from './use_is_anchor_mounted';
import * as i18n from './translations';

/**
 * Renders the guided-tour popovers for the Attacks page. Each step anchors its
 * popover to an existing element via a CSS selector, so this component does not
 * wrap the page content. Steps and progress come from {@link useAttacksTour}.
 */
const AttacksTourComponent: React.FC = () => {
  const {
    tourState,
    steps,
    stepsTotal,
    isTourEnabled,
    nextStep,
    closeTour,
    finishTour,
    completeTour,
  } = useAttacksTour();
  const { isTourActive, currentTourStep } = tourState;

  const currentStep = steps[currentTourStep - 1];
  const isCurrentAnchorMounted = useIsAnchorMounted(currentStep?.anchor ?? 'body');

  // Anchor safety valve: if the active step's anchor never mounts, complete the
  // tour rather than leaving it stuck (which would also keep the callout hidden).
  useEffect(() => {
    if (!isTourEnabled || !isTourActive) {
      return;
    }
    if (!currentStep) {
      completeTour();
      return;
    }
    if (isCurrentAnchorMounted) {
      return;
    }
    const timer = setTimeout(completeTour, ATTACKS_TOUR_ANCHOR_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isTourEnabled, isTourActive, currentStep, isCurrentAnchorMounted, completeTour]);

  // Only mount `EuiTourStep` once the current step's anchor is in the DOM.
  // EuiTourStep resolves the anchor a single tick after mount; if the anchor
  // (e.g. the filter group button on a cold reload) isn't present yet, the
  // popover would render with no anchor and never recover.
  if (!isTourEnabled || !isTourActive || !currentStep || !isCurrentAnchorMounted) {
    return null;
  }

  const isLastStep = currentTourStep === stepsTotal;

  return (
    <EuiTourStep
      // Remount per step. EuiTourStep uses EuiWrappingPopover, which physically
      // moves the anchor element into the popover and only restores it on
      // unmount. Reusing one instance across steps leaves the popover pointing
      // at the first anchor and yanks later anchors out of place, so keying by
      // step forces a clean unmount/remount that re-anchors correctly.
      key={currentStep.stepId}
      anchor={currentStep.anchor}
      anchorPosition={currentStep.anchorPosition}
      content={currentStep.content}
      title={currentStep.title}
      step={currentTourStep}
      stepsTotal={stepsTotal}
      isStepOpen
      minWidth={ATTACKS_TOUR_POPOVER_WIDTH}
      maxWidth={ATTACKS_TOUR_POPOVER_WIDTH}
      onFinish={finishTour}
      data-test-subj={`${ATTACKS_TOUR_STEP_TEST_ID}-${currentStep.stepId}`}
      footerAction={
        isLastStep ? (
          <EuiButton
            color="success"
            size="s"
            onClick={finishTour}
            data-test-subj={`${ATTACKS_TOUR_STEP_TEST_ID}-finish`}
          >
            {i18n.STEP_FINISH_TOUR}
          </EuiButton>
        ) : (
          [
            <EuiButtonEmpty
              key="close"
              size="s"
              color="text"
              onClick={closeTour}
              data-test-subj={`${ATTACKS_TOUR_STEP_TEST_ID}-close`}
            >
              {i18n.STEP_CLOSE_TOUR}
            </EuiButtonEmpty>,
            <EuiButton
              key="next"
              color="success"
              size="s"
              onClick={nextStep}
              data-test-subj={`${ATTACKS_TOUR_STEP_TEST_ID}-next`}
            >
              {i18n.STEP_NEXT}
            </EuiButton>,
          ]
        )
      }
    />
  );
};

export const AttacksTour = React.memo(AttacksTourComponent);
AttacksTour.displayName = 'AttacksTour';
