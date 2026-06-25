/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiText,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { useChangeHistoryConfig } from '../../provider/use_change_history_config';
import { useChangeHistoryDetail } from '../../hooks/use_change_history_detail';
import { getChangeHistoryErrorMessage } from '../../utils/get_change_history_error_message';
import * as i18n from '../timeline/translations';

export function ChangeHistoryPreviewPanel(): JSX.Element {
  const { adapter, objectId, renderPreview, selectedChangeId } = useChangeHistoryConfig();
  const { change, isLoading, error } = useChangeHistoryDetail({
    adapter,
    objectId,
    changeId: selectedChangeId,
    enabled: Boolean(selectedChangeId),
  });

  if (!selectedChangeId) {
    return (
      <EuiFlexGroup
        alignItems="center"
        justifyContent="center"
        css={css`
          height: 100%;
        `}
        data-test-subj="changeHistoryPreviewEmpty"
      >
        <EuiFlexItem grow={false}>
          <EuiEmptyPrompt
            iconType="inspect"
            title={<h3>{i18n.SELECT_CHANGE_PROMPT}</h3>}
            titleSize="xs"
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  if (isLoading) {
    return (
      <EuiFlexGroup
        alignItems="center"
        justifyContent="center"
        css={css`
          height: 100%;
        `}
        data-test-subj="changeHistoryPreviewLoading"
      >
        <EuiFlexItem grow={false}>
          <EuiLoadingSpinner size="l" />
          <EuiText size="s" color="subdued">
            {i18n.PREVIEW_LOADING}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  if (error || !change) {
    const errorMessage = error ? getChangeHistoryErrorMessage(error) : undefined;

    return (
      <EuiFlexGroup
        alignItems="center"
        justifyContent="center"
        css={css`
          height: 100%;
        `}
        data-test-subj="changeHistoryPreviewError"
      >
        <EuiFlexItem grow={false}>
          <EuiEmptyPrompt
            iconType="alert"
            title={<h3>{i18n.PREVIEW_ERROR}</h3>}
            body={
              errorMessage ? (
                <EuiText size="s" color="subdued">
                  <p>{errorMessage}</p>
                </EuiText>
              ) : undefined
            }
            titleSize="xs"
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  return (
    <div
      css={css`
        height: 100%;
        min-height: 0;
        overflow: auto;
        padding: 0;
      `}
      data-test-subj="changeHistoryPreview"
    >
      {renderPreview({ change, objectId })}
    </div>
  );
}
