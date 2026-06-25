/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiEmptyPrompt, EuiText } from '@elastic/eui';
import { getChangeHistoryErrorMessage } from '../../utils/get_change_history_error_message';
import * as i18n from './translations';

export interface ChangeHistoryListErrorPromptProps {
  error?: Error;
}

export function ChangeHistoryListErrorPrompt({
  error,
}: ChangeHistoryListErrorPromptProps): JSX.Element {
  const errorMessage = error ? getChangeHistoryErrorMessage(error) : undefined;

  return (
    <EuiEmptyPrompt
      iconType="alert"
      title={<h2>{i18n.LIST_ERROR}</h2>}
      body={
        errorMessage ? (
          <EuiText size="s" color="subdued">
            <p>{errorMessage}</p>
          </EuiText>
        ) : undefined
      }
      data-test-subj="changeHistoryListError"
    />
  );
}
