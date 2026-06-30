/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useContext } from 'react';
import useIntersection from 'react-use/lib/useIntersection';

import { getScreenshotUrl } from './journey_screenshot_dialog';
import { SyntheticsSettingsContext } from '../../../contexts';

import { useRetrieveStepImage } from '../monitor_test_result/use_retrieve_step_image';
import { JourneyScreenshotPreview } from '../monitor_test_result/journey_screenshot_preview';
import type { ScreenshotImageSize } from './screenshot_size';
import { THUMBNAIL_SCREENSHOT_SIZE } from './screenshot_size';
import { useGetUrlParams } from '../../../hooks';

interface Props {
  timestamp?: string;
  checkGroup?: string;
  stepStatus?: string;
  initialStepNumber?: number;
  allStepsLoaded?: boolean;
  retryFetchOnRevisit?: boolean; // Set to `true` for "Run Once" / "Test Now" modes
  size?: ScreenshotImageSize;
  testNowMode?: boolean;
  unavailableMessage?: string;
  borderRadius?: number | string;
}

export const JourneyStepScreenshotContainer = ({
  allStepsLoaded,
  timestamp,
  checkGroup,
  stepStatus,
  initialStepNumber = 1,
  retryFetchOnRevisit = false,
  testNowMode,
  size = THUMBNAIL_SCREENSHOT_SIZE,
  unavailableMessage,
  borderRadius,
}: Props) => {
  const intersectionRef = React.useRef<HTMLImageElement>(null);

  const { basePath } = useContext(SyntheticsSettingsContext);

  const { remoteName } = useGetUrlParams();

  const imgPath = checkGroup
    ? getScreenshotUrl({
        basePath,
        checkGroup,
        stepNumber: initialStepNumber,
        remoteName,
        timestamp,
      })
    : '';

  const intersection = useIntersection(intersectionRef, {
    root: null,
    rootMargin: '0px',
    threshold: 0.1,
  });

  const imageResult = useRetrieveStepImage({
    hasIntersected: Boolean(intersection && intersection.intersectionRatio > 0),
    stepStatus,
    imgPath,
    retryFetchOnRevisit,
    checkGroup,
    testNowMode,
    timestamp,
  });

  const { url, loading, stepName, maxSteps } = imageResult?.[imgPath] ?? {};

  return (
    <div ref={intersectionRef}>
      <JourneyScreenshotPreview
        checkGroup={checkGroup}
        stepName={stepName}
        imgSrc={url}
        stepNumber={initialStepNumber}
        isStepFailed={stepStatus === 'failed'}
        maxSteps={maxSteps}
        isLoading={Boolean(loading || !allStepsLoaded)}
        size={size}
        unavailableMessage={unavailableMessage}
        borderRadius={borderRadius}
        timestamp={timestamp}
      />
    </div>
  );
};
