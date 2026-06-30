/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { type FC, useCallback } from 'react';

import {
  EuiButtonEmpty,
  EuiCodeBlock,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  useGeneratedHtmlId,
} from '@elastic/eui';

import { i18n } from '@kbn/i18n';
import type { ToastInputFields } from '@kbn/core-notifications-browser';
import { toMountPoint } from '@kbn/react-kibana-mount';

import { useAppDependencies } from '../app_dependencies';

const MAX_SIMPLE_MESSAGE_LENGTH = 140;

interface ToastNotificationTextProps {
  text: any;
  previewTextLength?: number;
  inline?: boolean;
  forceModal?: boolean;
}

export const ToastNotificationText: FC<ToastNotificationTextProps> = ({
  text,
  previewTextLength,
  inline = false,
  forceModal = false,
}) => {
  const { overlays, ...startServices } = useAppDependencies();
  const modalTitleId = useGeneratedHtmlId();

  if (!forceModal && typeof text === 'string' && text.length <= MAX_SIMPLE_MESSAGE_LENGTH) {
    return text;
  }

  if (
    !forceModal &&
    typeof text === 'object' &&
    text !== null &&
    typeof text.message === 'string' &&
    text.message.length <= MAX_SIMPLE_MESSAGE_LENGTH
  ) {
    return text.message;
  }

  const unformattedText =
    typeof text === 'object' && text !== null && text.message ? text.message : text;
  const formattedText =
    typeof unformattedText === 'object' ? JSON.stringify(text, null, 2) : unformattedText;
  const textLength = previewTextLength ?? 140;
  const previewText = `${formattedText.substring(0, textLength)}${
    formattedText.length > textLength ? ' ...' : ''
  }`;

  const openModal = () => {
    const modal = overlays.openModal(
      toMountPoint(
        <EuiModal aria-labelledby={modalTitleId} onClose={() => modal.close()}>
          <EuiModalHeader>
            <EuiModalHeaderTitle id={modalTitleId}>
              {i18n.translate('xpack.transform.toastText.modalTitle', {
                defaultMessage: 'Error details',
              })}
            </EuiModalHeaderTitle>
          </EuiModalHeader>
          <EuiModalBody>
            <EuiCodeBlock language="json" fontSize="m" paddingSize="s" isCopyable>
              {formattedText}
            </EuiCodeBlock>
          </EuiModalBody>
          <EuiModalFooter>
            <EuiButtonEmpty onClick={() => modal.close()}>
              {i18n.translate('xpack.transform.toastText.closeModalButtonText', {
                defaultMessage: 'Close',
              })}
            </EuiButtonEmpty>
          </EuiModalFooter>
        </EuiModal>,
        startServices
      )
    );
  };

  return (
    <>
      {!inline && <pre>{previewText}</pre>}
      <EuiButtonEmpty
        onClick={openModal}
        css={inline ? { blockSize: 0 } : {}}
        size={inline ? 's' : undefined}
      >
        {i18n.translate('xpack.transform.toastText.openModalButtonText', {
          defaultMessage: 'View details',
        })}
      </EuiButtonEmpty>
    </>
  );
};

/**
 * Hook version of <ToastNotificationText> for use with the EuiToast `actionProps` API.
 * Returns a function that produces `{ text, actionProps? }` to spread into toast service calls.
 */
export const useToastNotificationText = () => {
  const appDeps = useAppDependencies();
  const { overlays } = appDeps;
  const modalTitleId = useGeneratedHtmlId();

  return useCallback(
    (text: any, previewTextLength?: number): Pick<ToastInputFields, 'text' | 'actionProps'> => {
      // Short text: return plain string
      if (typeof text === 'string' && text.length <= MAX_SIMPLE_MESSAGE_LENGTH) {
        return { text };
      }
      if (
        typeof text === 'object' &&
        text !== null &&
        typeof text.message === 'string' &&
        text.message.length <= MAX_SIMPLE_MESSAGE_LENGTH
      ) {
        return { text: text.message as string };
      }

      // Long text: truncated preview + "View details" secondary action opening a modal
      const unformattedText =
        typeof text === 'object' && text !== null && text.message ? text.message : text;
      const formattedText =
        typeof unformattedText === 'object' ? JSON.stringify(text, null, 2) : unformattedText;
      const textLength = previewTextLength ?? MAX_SIMPLE_MESSAGE_LENGTH;
      const previewText = `${formattedText.substring(0, textLength)}${
        formattedText.length > textLength ? ' ...' : ''
      }`;

      const { overlays: _overlays, ...startServices } = appDeps;

      return {
        text: toMountPoint(<pre>{previewText}</pre>, startServices),
        actionProps: {
          primary: {
            onClick: () => {
              const modal = overlays.openModal(
                toMountPoint(
                  <EuiModal aria-labelledby={modalTitleId} onClose={() => modal.close()}>
                    <EuiModalHeader>
                      <EuiModalHeaderTitle id={modalTitleId}>
                        {i18n.translate('xpack.transform.toastText.modalTitle', {
                          defaultMessage: 'Error details',
                        })}
                      </EuiModalHeaderTitle>
                    </EuiModalHeader>
                    <EuiModalBody>
                      <EuiCodeBlock language="json" fontSize="m" paddingSize="s" isCopyable>
                        {formattedText}
                      </EuiCodeBlock>
                    </EuiModalBody>
                    <EuiModalFooter>
                      <EuiButtonEmpty onClick={() => modal.close()}>
                        {i18n.translate('xpack.transform.toastText.closeModalButtonText', {
                          defaultMessage: 'Close',
                        })}
                      </EuiButtonEmpty>
                    </EuiModalFooter>
                  </EuiModal>,
                  startServices
                )
              );
            },
            children: i18n.translate('xpack.transform.toastText.openModalButtonText', {
              defaultMessage: 'View details',
            }),
          },
        },
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overlays, modalTitleId]
  );
};
