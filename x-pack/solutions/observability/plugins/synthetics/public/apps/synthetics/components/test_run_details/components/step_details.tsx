/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup, EuiFlexItem, EuiPanel, EuiSpacer, EuiTitle } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import React from 'react';
import type {
  JourneyStep,
  SyntheticsJourneyApiResponse,
} from '../../../../../../common/runtime_types';
import { StepNumberNav } from './step_number_nav';
import { StepScreenshotDetails } from '../step_screenshot_details';
import { StepTabs } from '../step_tabs';

export const StepDetails = ({
  step,
  loading,
  stepIndex,
  stepsData,
  totalSteps,
  setStepIndex,
  isApiMonitor = false,
}: {
  loading: boolean;
  step?: JourneyStep;
  stepsData?: SyntheticsJourneyApiResponse;
  stepIndex: number;
  totalSteps: number;
  setStepIndex: (stepIndex: number) => void;
  // API journeys reuse the synthexec step pipeline but never produce
  // screenshots, so callers pass true to suppress the StepScreenshotDetails
  // panel inside.
  isApiMonitor?: boolean;
}) => {
  if (totalSteps === 0 && !loading) return null;

  return (
    <EuiPanel hasShadow={false} hasBorder>
      <EuiFlexGroup alignItems="center">
        <EuiFlexItem grow={true}>
          <EuiTitle size="xs">
            <h3>
              <FormattedMessage
                id="xpack.synthetics.synthetics.testDetail.totalSteps"
                defaultMessage="Step {stepIndex} of {totalSteps}"
                values={{
                  stepIndex,
                  totalSteps,
                }}
              />
            </h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <StepNumberNav
            stepIndex={stepIndex}
            totalSteps={totalSteps}
            handleNextStep={() => {
              setStepIndex(stepIndex + 1);
            }}
            handlePreviousStep={() => {
              setStepIndex(stepIndex - 1);
            }}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      {!isApiMonitor && (
        <>
          <StepScreenshotDetails stepIndex={stepIndex} step={step} />
          <EuiSpacer size="m" />
        </>
      )}
      <StepTabs stepsList={stepsData?.steps} step={step} loading={loading} />
    </EuiPanel>
  );
};
