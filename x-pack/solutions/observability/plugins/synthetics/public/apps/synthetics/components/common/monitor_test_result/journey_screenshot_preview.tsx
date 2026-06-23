/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import { EuiPopover, useEuiTheme } from '@elastic/eui';

import { i18n } from '@kbn/i18n';
import type { ScreenshotImageSize } from '../screenshot/screenshot_size';
import { POPOVER_SCREENSHOT_SIZE } from '../screenshot/screenshot_size';
import { JourneyScreenshotDialog } from '../screenshot/journey_screenshot_dialog';
import type { ScreenshotImageProps } from '../screenshot/screenshot_image';
import { ScreenshotImage } from '../screenshot/screenshot_image';
import { useGetUrlParams } from '../../../hooks';

export interface StepImagePopoverProps {
  timestamp?: string;
  checkGroup: string | undefined;
  stepName?: string;
  stepNumber: number;
  imgSrc?: string;
  maxSteps: number | undefined;
  isStepFailed: boolean;
  isLoading: boolean;
  size: ScreenshotImageSize;
  unavailableMessage?: string;
  borderRadius?: string | number;
}

export const JourneyScreenshotPreview: React.FC<StepImagePopoverProps> = ({
  timestamp,
  checkGroup,
  stepName,
  stepNumber,
  imgSrc,
  maxSteps,
  isStepFailed,
  isLoading,
  size,
  unavailableMessage,
  borderRadius,
}) => {
  const { euiTheme } = useEuiTheme();
  const { remoteName } = useGetUrlParams();
  const [isImagePopoverOpen, setIsImagePopoverOpen] = useState(false);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);

  // Only render the dialog if the image is at least once clicked
  const [isImageEverClick, setIsImageEverClicked] = useState(false);

  const onImgFocus = useCallback<NonNullable<ScreenshotImageProps['onFocus']>>(
    (_evt) => {
      setIsImagePopoverOpen(true);
    },
    [setIsImagePopoverOpen]
  );

  const onImgBlur = useCallback<NonNullable<ScreenshotImageProps['onBlur']>>(
    (_evt) => {
      setIsImagePopoverOpen(false);
    },
    [setIsImagePopoverOpen]
  );

  const onImgClick = useCallback<NonNullable<ScreenshotImageProps['onClick']>>(
    (evt) => {
      evt.stopPropagation();

      setIsImageEverClicked(true);
      setIsImageDialogOpen(true);
      setIsImagePopoverOpen(false);
    },
    [setIsImagePopoverOpen]
  );

  const onDialogClose = useCallback(() => {
    setIsImageDialogOpen(false);
  }, [setIsImageDialogOpen]);

  const renderScreenshotImage = (screenshotSize: ScreenshotImageSize) => (
    <ScreenshotImage
      label={i18n.translate('xpack.synthetics.monitorTestResult.screenshotImageLabel', {
        defaultMessage: '"{stepName}", {stepNumber} of {totalSteps}',
        values: {
          stepName,
          stepNumber,
          totalSteps: maxSteps ?? stepNumber,
        },
      })}
      imgSrc={imgSrc}
      isLoading={isLoading}
      size={screenshotSize}
      unavailableMessage={unavailableMessage}
      borderColor={isStepFailed ? euiTheme.colors.danger : undefined}
      borderRadius={borderRadius}
      onFocus={onImgFocus}
      onBlur={onImgBlur}
      onClick={onImgClick}
    />
  );

  return (
    <>
      {isImageEverClick ? (
        <JourneyScreenshotDialog
          checkGroup={checkGroup}
          initialImgSrc={imgSrc}
          initialStepNumber={stepNumber}
          maxSteps={maxSteps}
          isOpen={isImageDialogOpen}
          onClose={onDialogClose}
          timestamp={timestamp}
          remoteName={remoteName}
        />
      ) : null}
      <EuiPopover
        anchorPosition="leftDown"
        button={renderScreenshotImage(size)}
        isOpen={isImagePopoverOpen}
        aria-label={i18n.translate('xpack.synthetics.journeyScreenshotPreview.popoverAriaLabel', {
          defaultMessage: 'Screenshot preview',
        })}
      >
        {renderScreenshotImage(POPOVER_SCREENSHOT_SIZE)}
      </EuiPopover>
    </>
  );
};
