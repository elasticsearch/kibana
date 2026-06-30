/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { useJourneySteps } from '../../monitor_details/hooks/use_journey_steps';

export const useStepDetails = ({ checkGroup }: { checkGroup: string }) => {
  const [stepIndex, setStepIndex] = React.useState(1);

  const { data: stepsData, loading: stepsLoading, stepEnds } = useJourneySteps({ checkGroup });

  const step = stepEnds.find((stepN) => stepN.synthetics?.step?.index === stepIndex);

  const totalSteps = stepsLoading ? 1 : stepEnds.length;

  return {
    step,
    stepIndex,
    setStepIndex,
    totalSteps,
    stepsData,
    loading: stepsLoading,
  };
};
