/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MouseEvent, KeyboardEvent } from 'react';
import React, { useContext, useEffect, useState, useCallback } from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButtonEmpty,
  EuiText,
  useEuiTheme,
  EuiProgress,
  EuiOutsideClickDetector,
  useIsWithinMaxBreakpoint,
} from '@elastic/eui';
import styled from '@emotion/styled';
import { SYNTHETICS_API_URLS } from '../../../../../../common/constants';
import { SyntheticsSettingsContext } from '../../../contexts';
import { useRetrieveStepImage } from '../monitor_test_result/use_retrieve_step_image';

import { ScreenshotImage } from './screenshot_image';

export const JourneyScreenshotDialog = ({
  timestamp,
  checkGroup,
  initialImgSrc,
  initialStepNumber,
  isOpen,
  onClose,
  remoteName,
}: {
  timestamp?: string;
  checkGroup: string | undefined;
  initialImgSrc: string | undefined;
  initialStepNumber: number;
  maxSteps: number | undefined;
  isOpen: boolean;
  onClose: () => void;
  remoteName?: string;
}) => {
  const { euiTheme } = useEuiTheme();
  const isSmall = useIsWithinMaxBreakpoint('m');
  const [stepNumber, setStepNumber] = useState(initialStepNumber);

  const { basePath } = useContext(SyntheticsSettingsContext);
  const imgPath = getScreenshotUrl({ basePath, checkGroup, stepNumber, remoteName });

  const imageResult = useRetrieveStepImage({
    hasIntersected: true,
    stepStatus: 'complete',
    imgPath,
    retryFetchOnRevisit: false,
    checkGroup,
    timestamp,
  });
  const { url, loading, stepName, maxSteps } = imageResult?.[imgPath] ?? {};
  const imgSrc = stepNumber === initialStepNumber ? initialImgSrc ?? url : url;

  useEffect(() => {
    if (isOpen) {
      setStepNumber(initialStepNumber);
    }
    // do not include initialStepNumber
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, setStepNumber]);

  const onKeyDown = useCallback(
    (evt: KeyboardEvent<HTMLElement>) => {
      if (evt?.key === 'Escape') {
        onClose();
        return;
      }

      if (!maxSteps) {
        return;
      }

      const isLeft = evt?.key === 'ArrowLeft';
      const isRight = evt?.key === 'ArrowRight';
      if (isLeft && stepNumber > 1) {
        setStepNumber((s) => s - 1);
      }

      if (isRight && stepNumber < maxSteps) {
        setStepNumber((s) => s + 1);
      }
    },
    [setStepNumber, stepNumber, maxSteps, onClose]
  );

  return isOpen ? (
    <EuiOutsideClickDetector onOutsideClick={onClose}>
      <EuiModal
        aria-label={i18n.translate('xpack.synthetics.monitor.screenshotDialog.ariaLabel', {
          defaultMessage: 'Journey screenshot dialog',
        })}
        onClose={(evt) => {
          // for table row click to work
          evt?.stopPropagation?.();
          onClose();
        }}
        css={{
          outline: 0,
          maxWidth: 'calc(90vw)',
          maxHeight: 'calc(90vh)',
          borderRadius: 0,
          padding: 0,
        }}
        onKeyDown={onKeyDown}
      >
        <ModalBodyStyled css={{ display: 'flex' }}>
          <ScreenshotImage
            label={i18n.translate('xpack.synthetics.monitor.screenshotImageLabel', {
              defaultMessage: '"{stepName}", {stepNumber} of {totalSteps}',
              values: {
                stepName,
                stepNumber,
                totalSteps: maxSteps ?? stepNumber,
              },
            })}
            imgSrc={imgSrc}
            isLoading={!!loading}
            animateLoading={false}
            hasBorder={false}
            size={'full'}
          />
        </ModalBodyStyled>

        <EuiModalFooter
          css={{
            outline: 0,
            backgroundColor: euiTheme.colors.lightShade,
            display: 'inline-block',
            width: '100%',
            textDecoration: 'none',
            padding: 0,
          }}
          onClick={(evt) => {
            // we don't want this to be captured by row click which leads to step list page
            evt.stopPropagation();
          }}
          onKeyDown={(_evt) => {
            // Just to satisfy ESLint
          }}
        >
          {loading ? (
            <EuiProgress data-test-subj="screenshotImageLoadingProgress" size="xs" />
          ) : null}
          <EuiFlexGroup alignItems="center" justifyContent="center" responsive={false}>
            <EuiFlexItem grow={true}>
              <EuiButtonEmpty
                data-test-subj="screenshotImagePreviousButton"
                css={{ marginLeft: isSmall ? 0 : 'auto' }}
                disabled={loading || !maxSteps || stepNumber === 1}
                onClick={(evt: MouseEvent<HTMLButtonElement>) => {
                  setStepNumber((s) => s - 1);
                  evt.preventDefault();
                }}
                iconType="chevronSingleLeft"
                aria-label={prevAriaLabel}
              >
                {prevAriaLabel}
              </EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false} css={{ flexBasis: 'fit-content' }}>
              <EuiText color={euiTheme.colors.textParagraph}>
                {i18n.translate('xpack.synthetics.monitor.stepOfSteps', {
                  defaultMessage: 'Step: {stepNumber} of {totalSteps}',
                  values: {
                    stepNumber,
                    totalSteps: maxSteps ?? stepNumber,
                  },
                })}
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={true}>
              <EuiButtonEmpty
                data-test-subj="screenshotImageNextButton"
                css={{ marginRight: isSmall ? 0 : 'auto' }}
                disabled={loading || !maxSteps || stepNumber === maxSteps}
                onClick={(evt: MouseEvent<HTMLButtonElement>) => {
                  setStepNumber((s) => s + 1);
                  evt.stopPropagation();
                }}
                iconType="chevronSingleRight"
                iconSide="right"
                aria-label={nextAriaLabel}
              >
                {nextAriaLabel}
              </EuiButtonEmpty>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiText
            color={euiTheme.colors.textParagraph}
            css={{
              outline: 0,
              padding: euiTheme.size.m,
              paddingTop: 0,
              textAlign: 'center',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            className="eui-textNoWrap"
            size="s"
          >
            {stepName}
          </EuiText>
        </EuiModalFooter>
      </EuiModal>
    </EuiOutsideClickDetector>
  ) : null;
};

const ModalBodyStyled = styled(EuiModalBody)`
  &&& {
    & > div {
      display: flex;
      justify-content: center;
      align-items: center;
      margin-top: 24px;
    }
  }
`;

export const getScreenshotUrl = ({
  basePath,
  checkGroup,
  stepNumber,
  remoteName,
  timestamp,
}: {
  basePath: string;
  checkGroup?: string;
  stepNumber: number;
  remoteName?: string;
  timestamp?: string;
}) => {
  if (!checkGroup) {
    return '';
  }
  const path = `${basePath}${SYNTHETICS_API_URLS.JOURNEY_SCREENSHOT.replace(
    '{checkGroup}',
    checkGroup
  ).replace('{stepIndex}', stepNumber.toString())}`;

  const params: string[] = [];
  // For remote monitors forward `remoteName` so the route handler targets
  // `${remoteName}:synthetics-*` via CCS.
  if (remoteName) {
    params.push(`remoteName=${encodeURIComponent(remoteName)}`);
  }
  // Forward the run timestamp so the screenshot query can be bounded to a
  // narrow window and prune frozen-tier shards instead of scanning every index.
  if (timestamp) {
    params.push(`timestamp=${encodeURIComponent(timestamp)}`);
  }

  return params.length ? `${path}?${params.join('&')}` : path;
};

const prevAriaLabel = i18n.translate('xpack.synthetics.monitor.step.previousStep', {
  defaultMessage: 'Previous step',
});

const nextAriaLabel = i18n.translate('xpack.synthetics.monitor.step.nextStep', {
  defaultMessage: 'Next step',
});
