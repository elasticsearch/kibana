/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import ReactDOM from 'react-dom';

import {
  EuiButton,
  EuiCallOut,
  EuiCodeBlock,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSpacer,
} from '@elastic/eui';
import type { OverlayStart } from '@kbn/core-overlays-browser';
import type { RenderingService } from '@kbn/core-rendering-browser';
import { FormattedMessage } from '@kbn/i18n-react';

interface ErrorToastProps {
  title: string;
  error: Error;
  toastMessage: string;
  openModal: OverlayStart['openModal'];
  rendering: RenderingService;
}

interface RequestError extends Error {
  body?: { attributes?: { error: { caused_by: { type: string; reason: string } } } };
}

const isRequestError = (e: Error | RequestError): e is RequestError => {
  if ('body' in e) {
    return e.body?.attributes?.error?.caused_by !== undefined;
  }
  return false;
};

/**
 * This should instead be replaced by the overlay service once it's available.
 * This does not use React portals so that if the parent toast times out, this modal
 * does not disappear. NOTE: this should use a global modal in the overlay service
 * in the future.
 */
export function showErrorDialog({
  title,
  error,
  openModal,
  rendering,
}: Pick<ErrorToastProps, 'error' | 'title' | 'openModal' | 'rendering'>) {
  let text = '';

  if (isRequestError(error)) {
    text += `${error?.body?.attributes?.error?.caused_by.type}\n`;
    text += `${error?.body?.attributes?.error?.caused_by.reason}\n\n`;
  }

  if (error.stack) {
    text += error.stack;
  }

  const modal = openModal(
    mount(
      rendering.addContext(
        <>
          <EuiModalHeader>
            <EuiModalHeaderTitle>{title}</EuiModalHeaderTitle>
          </EuiModalHeader>
          <EuiModalBody data-test-subj="errorModalBody">
            <EuiCallOut size="s" color="danger" iconType="error" title={error.message} />
            {text && (
              <React.Fragment>
                <EuiSpacer size="s" />
                <EuiCodeBlock isCopyable={true} paddingSize="s">
                  {text}
                </EuiCodeBlock>
              </React.Fragment>
            )}
          </EuiModalBody>
          <EuiModalFooter>
            <EuiButton onClick={() => modal.close()} fill>
              <FormattedMessage
                id="core.notifications.errorToast.closeModal"
                defaultMessage="Close"
              />
            </EuiButton>
          </EuiModalFooter>
        </>
      )
    )
  );
}

export function getErrorToastActionProps({
  title,
  error,
  openModal,
  rendering,
}: Pick<ErrorToastProps, 'title' | 'error' | 'openModal' | 'rendering'>) {
  return {
    primary: {
      size: 's' as const,
      color: 'danger' as const,
      'data-test-subj': 'errorToastBtn',
      children: (
        <FormattedMessage
          id="core.toasts.errorToast.seeFullError"
          defaultMessage="See the full error"
        />
      ),
      onClick: () => showErrorDialog({ title, error, openModal, rendering }),
    },
  };
}

const mount = (component: React.ReactElement) => (container: HTMLElement) => {
  ReactDOM.render(component, container);
  return () => ReactDOM.unmountComponentAtNode(container);
};
