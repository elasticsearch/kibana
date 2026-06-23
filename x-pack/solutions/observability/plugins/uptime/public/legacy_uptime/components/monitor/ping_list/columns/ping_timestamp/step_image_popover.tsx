/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiImage, EuiPopover } from '@elastic/eui';
import React from 'react';
import { i18n } from '@kbn/i18n';
import { euiStyled } from '@kbn/kibana-react-plugin/common';
import { LoadingImageState } from './no_image_available';
import type { ScreenshotRefImageData } from '../../../../../../../common/runtime_types';
import { fullSizeImageAlt } from './translations';
import { useCompositeImage } from '../../../../../hooks/use_composite_image';

const POPOVER_IMG_HEIGHT = 360;
const POPOVER_IMG_WIDTH = 640;

const StepImage = euiStyled(EuiImage)`
  &&& .euiImageFullScreenWrapper {
    figcaption {
      display: flex;
    }
  }
`;

interface ScreenshotImageProps {
  captionContent: string;
  imageCaption: JSX.Element;
}

const DefaultImage: React.FC<ScreenshotImageProps & { imageData?: string }> = ({
  captionContent,
  imageCaption,
  imageData,
}) =>
  imageData ? (
    <StepImage
      allowFullScreen={true}
      alt={captionContent}
      caption={imageCaption}
      data-test-subj="pingTimestampImage"
      hasShadow
      url={imageData}
      size="s"
      className="syntheticsStepImage"
    />
  ) : (
    <LoadingImageState />
  );

/**
 * This component provides an intermediate step for composite images. It causes a loading spinner to appear
 * while the image is being re-assembled, then calls the default image component and provides a data URL for the image.
 */
const RecomposedScreenshotImage: React.FC<
  ScreenshotImageProps & {
    imgRef: ScreenshotRefImageData;
    setImageData: React.Dispatch<string | undefined>;
    imageData: string | undefined;
  }
> = ({ captionContent, imageCaption, imageData, imgRef, setImageData }) => {
  // initially an undefined URL value is passed to the image display, and a loading spinner is rendered.
  // `useCompositeImage` will call `setImageData` when the image is composited, and the updated `imageData` will display.
  useCompositeImage(imgRef, setImageData, imageData);

  return (
    <DefaultImage
      captionContent={captionContent}
      imageCaption={imageCaption}
      imageData={imageData}
    />
  );
};

export interface StepImagePopoverProps {
  captionContent: string;
  imageCaption: JSX.Element;
  imgSrc?: string;
  imgRef?: ScreenshotRefImageData;
  isImagePopoverOpen: boolean;
}

const StepImageComponent: React.FC<
  Omit<StepImagePopoverProps, 'isImagePopoverOpen'> & {
    setImageData: React.Dispatch<string | undefined>;
    imageData: string | undefined;
  }
> = ({ captionContent, imageCaption, imageData, imgRef, imgSrc, setImageData }) => {
  if (imgSrc) {
    return (
      <DefaultImage
        captionContent={captionContent}
        imageCaption={imageCaption}
        imageData={imageData}
      />
    );
  } else if (imgRef) {
    return (
      <RecomposedScreenshotImage
        captionContent={captionContent}
        imageCaption={imageCaption}
        imageData={imageData}
        imgRef={imgRef}
        setImageData={setImageData}
      />
    );
  }
  return null;
};

export const StepImagePopover: React.FC<StepImagePopoverProps> = ({
  captionContent,
  imageCaption,
  imgRef,
  imgSrc,
  isImagePopoverOpen,
}) => {
  const [imageData, setImageData] = React.useState<string | undefined>(imgSrc || undefined);

  React.useEffect(() => {
    // for legacy screenshots, when a new image arrives, we must overwrite it
    if (imgSrc && imgSrc !== imageData) {
      setImageData(imgSrc);
    }
  }, [imgSrc, imageData]);

  const setImageDataCallback = React.useCallback(
    (newImageData: string | undefined) => setImageData(newImageData),
    [setImageData]
  );
  return (
    <EuiPopover
      aria-label={i18n.translate('xpack.uptime.stepImagePopover.popoverAriaLabel', {
        defaultMessage: 'Step image preview',
      })}
      anchorPosition="leftDown"
      button={
        <StepImageComponent
          captionContent={captionContent}
          imageCaption={imageCaption}
          imgRef={imgRef}
          imgSrc={imgSrc}
          setImageData={setImageDataCallback}
          imageData={imageData}
        />
      }
      isOpen={isImagePopoverOpen}
      closePopover={() => {}}
    >
      {imageData ? (
        <EuiImage
          alt={fullSizeImageAlt}
          url={imageData}
          style={{ height: POPOVER_IMG_HEIGHT, width: POPOVER_IMG_WIDTH, objectFit: 'contain' }}
        />
      ) : (
        <LoadingImageState />
      )}
    </EuiPopover>
  );
};
