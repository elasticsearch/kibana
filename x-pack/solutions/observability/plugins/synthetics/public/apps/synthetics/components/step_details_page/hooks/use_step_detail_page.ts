/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useParams } from 'react-router-dom';
import { useMemo } from 'react';
import { useSelectedLocation } from '../../monitor_details/hooks/use_selected_location';
import { useSyntheticsSettingsContext } from '../../../contexts';
import { useJourneySteps } from '../../monitor_details/hooks/use_journey_steps';
import { useGetUrlParams } from '../../../hooks';
import { useUrlSpaceId } from '../../../hooks/use_url_space_id';

export const useStepDetailPage = () => {
  const {
    checkGroupId,
    monitorId,
    stepIndex: stepIndexString,
  } = useParams<{
    checkGroupId: string;
    stepIndex: string;
    monitorId: string;
  }>();

  const stepIndex = Number(stepIndexString);

  const selectedLocation = useSelectedLocation();
  const spaceId = useUrlSpaceId();
  const { remoteName } = useGetUrlParams();

  const { data: journey, stepEnds } = useJourneySteps({ checkGroup: checkGroupId });

  const memoized = useMemo(
    () => ({
      activeStep: journey?.steps?.find((step) => step.synthetics?.step?.index === stepIndex),
    }),
    [journey, stepIndex]
  );

  const { basePath } = useSyntheticsSettingsContext();

  const handleStepHref = (stepNo: number) =>
    getStepDetailLink({
      basePath,
      monitorId,
      checkGroupId,
      stepIndex: stepNo,
      locationId: selectedLocation?.id,
      spaceId,
      remoteName,
    });

  return {
    checkGroupId,
    journey,
    stepIndex,
    stepEnds,
    ...memoized,
    handleStepHref,
  };
};

export const useStepDetailLink = ({
  checkGroupId,
  stepIndex,
}: {
  checkGroupId?: string;
  stepIndex: number | string;
}) => {
  const { basePath } = useSyntheticsSettingsContext();

  const { monitorId } = useParams<{
    monitorId: string;
  }>();

  const selectedLocation = useSelectedLocation();
  const spaceId = useUrlSpaceId();
  const { remoteName } = useGetUrlParams();

  if (!checkGroupId) {
    return '';
  }

  return getStepDetailLink({
    basePath,
    stepIndex,
    monitorId,
    checkGroupId,
    locationId: selectedLocation?.id,
    spaceId,
    remoteName,
  });
};

export const getStepDetailLink = ({
  checkGroupId,
  stepIndex,
  basePath,
  monitorId,
  locationId,
  spaceId,
  remoteName,
}: {
  checkGroupId: string;
  locationId?: string;
  stepIndex: number | string;
  basePath: string;
  monitorId: string;
  spaceId?: string;
  remoteName?: string;
}) => {
  const params = new URLSearchParams();
  if (locationId) params.set('locationId', locationId);
  if (spaceId) params.set('spaceId', spaceId);
  if (remoteName) params.set('remoteName', remoteName);
  const search = params.toString();
  return `${basePath}/app/synthetics/monitor/${monitorId}/test-run/${checkGroupId}/step/${stepIndex}${
    search ? `?${search}` : ''
  }`;
};
