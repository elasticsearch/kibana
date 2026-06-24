/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { css } from '@emotion/react';
import { EuiFlyout, EuiFlyoutBody, EuiFlyoutHeader, EuiTitle, useEuiTheme } from '@elastic/eui';

import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { noop } from 'lodash';
import type { CasePostRequest } from '../../../../common/types/api';
import * as i18n from '../translations';
import type { CaseUI } from '../../../../common/ui/types';
import { CreateCaseForm } from '../form';
import type { UseCreateAttachments } from '../../../containers/use_create_attachments';
import type { CaseAttachmentsWithoutOwner } from '../../../types';

export interface CreateCaseFlyoutProps {
  afterCaseCreated?: (
    theCase: CaseUI,
    createAttachments: UseCreateAttachments['mutate']
  ) => Promise<void>;
  onClose?: () => void;
  onSuccess?: (theCase: CaseUI) => void;
  attachments?: CaseAttachmentsWithoutOwner;
  headerContent?: React.ReactNode;
  initialValue?: Pick<CasePostRequest, 'title' | 'description'>;
}

export const CreateCaseFlyout = React.memo<CreateCaseFlyoutProps>(
  ({ afterCaseCreated, attachments, headerContent, initialValue, onClose, onSuccess }) => {
    const { euiTheme } = useEuiTheme();
    const handleCancel = onClose || noop;
    const handleOnSuccess = onSuccess || noop;

    return (
      <>
        <ReactQueryDevtools initialIsOpen={false} />
        <EuiFlyout
          onClose={handleCancel}
          session="never"
          tour-step="create-case-flyout"
          aria-label={i18n.CREATE_CASE_LABEL}
          data-test-subj="create-case-flyout"
        >
          <EuiFlyoutHeader data-test-subj="create-case-flyout-header" hasBorder>
            <EuiTitle size="m">
              <h2>{i18n.CREATE_CASE_TITLE}</h2>
            </EuiTitle>
            {headerContent && headerContent}
          </EuiFlyoutHeader>
          <EuiFlyoutBody
            css={css`
              && .euiFlyoutBody__overflow {
                overflow-y: auto;
                overflow-x: hidden;
              }

              && .euiFlyoutBody__overflowContent {
                display: block;
                padding: ${euiTheme.size.l} ${euiTheme.size.l} ${euiTheme.size.xxxxl};
                height: auto;
              }
            `}
          >
            <div
              css={css`
                width: 100%;
              `}
            >
              <CreateCaseForm
                afterCaseCreated={afterCaseCreated}
                attachments={attachments}
                onCancel={handleCancel}
                onSuccess={handleOnSuccess}
                withSteps={false}
                initialValue={initialValue}
              />
            </div>
          </EuiFlyoutBody>
        </EuiFlyout>
      </>
    );
  }
);

CreateCaseFlyout.displayName = 'CreateCaseFlyout';
