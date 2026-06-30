/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { type FC } from 'react';
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
import { useChangeHistoryPreviewCompare } from '../../hooks/use_change_history_preview_compare';
import type { ChangeHistoryListItem } from '../../types/change_history_list_item';
import { getChangeHistoryErrorMessage } from '../../utils/get_change_history_error_message';
import * as i18n from '../timeline/translations';

const previewPanelStateCss = css`
  height: 100%;
  width: 100%;
`;

const PreviewPanelState = ({
  children,
  testSubj,
}: {
  children: React.ReactNode;
  testSubj: string;
}): JSX.Element => (
  <EuiFlexGroup
    direction="column"
    alignItems="center"
    justifyContent="center"
    responsive={false}
    css={previewPanelStateCss}
    data-test-subj={testSubj}
  >
    {children}
  </EuiFlexGroup>
);

export interface ChangeHistoryPreviewPanelProps {
  selectedChangeId?: string;
  listItems?: ChangeHistoryListItem[];
}

export const ChangeHistoryPreviewPanel: FC<ChangeHistoryPreviewPanelProps> = ({
  selectedChangeId,
  listItems = [],
}) => {
  const { adapter, objectId, renderPreview } = useChangeHistoryConfig();
  const { change, isLoading, error } = useChangeHistoryDetail({
    adapter,
    objectId,
    changeId: selectedChangeId,
    enabled: Boolean(selectedChangeId),
  });

  const { currentChange, previousChange, isLoadingCompareContext } = useChangeHistoryPreviewCompare(
    {
      adapter,
      objectId,
      listItems,
      selectedChange: change,
      selectedChangeId,
    }
  );

  if (!selectedChangeId) {
    return (
      <PreviewPanelState testSubj="changeHistoryPreviewEmpty">
        <EuiFlexItem grow={false}>
          <EuiEmptyPrompt
            iconType="inspect"
            title={<h3>{i18n.SELECT_CHANGE_PROMPT}</h3>}
            titleSize="xs"
          />
        </EuiFlexItem>
      </PreviewPanelState>
    );
  }

  if (isLoading) {
    return (
      <PreviewPanelState testSubj="changeHistoryPreviewLoading">
        <EuiFlexItem grow={false}>
          <EuiLoadingSpinner size="l" />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="s" color="subdued" textAlign="center">
            {i18n.PREVIEW_LOADING}
          </EuiText>
        </EuiFlexItem>
      </PreviewPanelState>
    );
  }

  if (error || !change) {
    const errorMessage = error ? getChangeHistoryErrorMessage(error) : undefined;

    return (
      <PreviewPanelState testSubj="changeHistoryPreviewError">
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
      </PreviewPanelState>
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
      {renderPreview({
        change,
        objectId,
        currentChange,
        previousChange,
        isLoadingCompareContext,
      })}
    </div>
  );
};
