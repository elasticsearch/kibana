/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { useParams } from 'react-router-dom';
import { EuiSkeletonRectangle } from '@elastic/eui';
import { useJourneySteps } from '../monitor_details/hooks/use_journey_steps';

export const StepTitle = () => {
  const { checkGroupId, stepIndex } = useParams<{ checkGroupId: string; stepIndex: string }>();

  const { data } = useJourneySteps({ checkGroup: checkGroupId });

  const currentStep = data?.steps.find((step) => step.synthetics.step?.index === Number(stepIndex));

  if (!currentStep) {
    return <EuiSkeletonRectangle height="45px" width="100%" />;
  }

  return <>{`${currentStep?.synthetics?.step?.index}. ${currentStep?.synthetics?.step?.name}`}</>;
};
