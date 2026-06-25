/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo } from 'react';
import { EuiModal, EuiModalBody, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { ChangeHistoryEmptyPrompt } from '../timeline/change_history_empty_prompt';
import { ChangeHistoryListErrorPrompt } from '../timeline/change_history_list_error_prompt';
import { ChangeHistoryTimeline } from '../timeline/change_history_timeline';
import { useChangeHistoryList } from '../../hooks/use_change_history_list';
import { useChangeHistoryConfig } from '../../provider/use_change_history_config';
import { ChangeHistoryPreviewPanel } from './change_history_preview_panel';
import { ChangeHistoryPreviewShell } from './change_history_preview_shell';
import { ChangeHistorySidebarPanel } from './change_history_sidebar_panel';

const getHistoryStartedAt = (timestamps: string[]): Date | undefined => {
  if (timestamps.length === 0) {
    return undefined;
  }

  const oldestTimestamp = timestamps[timestamps.length - 1];
  return oldestTimestamp ? new Date(oldestTimestamp) : undefined;
};

export function ChangeHistoryModal(): JSX.Element | null {
  const { euiTheme } = useEuiTheme();
  const {
    adapter,
    objectId,
    renderBadge,
    renderPreviewFooter,
    labels,
    isModalOpen,
    closeModal,
    selectedChangeId,
    setSelectedChangeId,
  } = useChangeHistoryConfig();

  const { items, total, isLoading, isLoadingMore, error, loadMore } = useChangeHistoryList({
    adapter,
    objectId,
    enabled: isModalOpen,
  });

  useEffect(() => {
    if (!isModalOpen || selectedChangeId || isLoading || items.length === 0) {
      return;
    }

    setSelectedChangeId(items[0]?.id);
  }, [isModalOpen, isLoading, items, selectedChangeId, setSelectedChangeId]);

  const styles = useMemo(
    () => ({
      modal: css`
        background-color: ${euiTheme.colors.backgroundBaseSubdued};
        block-size: 100vh;
        max-block-size: 100vh !important;
        inline-size: 100vw !important;
        max-inline-size: none !important;
        min-inline-size: 0 !important;
        border-radius: 0;

        .euiModal__closeIcon {
          display: none;
        }
      `,
      modalBody: css`
        flex: 1 1 auto;
        min-height: 0;
        overflow: hidden;

        &:last-of-type .euiModalBody__overflow {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          padding: ${euiTheme.size.s};
          padding-block-end: ${euiTheme.size.s};
          background: ${euiTheme.colors.backgroundBaseSubdued};
        }
      `,
      splitLayout: css`
        flex: 1;
        min-height: 0;
        height: 100%;
        display: flex;
        align-items: stretch;
        gap: ${euiTheme.size.s};
        overflow: hidden;
      `,
      sidebarEmptyState: css`
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        padding: ${euiTheme.size.m};
      `,
    }),
    [euiTheme]
  );

  if (!isModalOpen) {
    return null;
  }

  const hasItems = items.length > 0;
  const showLoadingSidebar = isLoading && !hasItems && !error;
  const showListError = Boolean(error) && !hasItems && !isLoading;
  const allItemsLoaded = hasItems && items.length >= total;
  const historyStartedAt = allItemsLoaded
    ? getHistoryStartedAt(items.map((item) => item.timestamp))
    : undefined;

  const previewFooter = renderPreviewFooter?.({
    objectId,
    selectedChangeId,
  });

  const renderSidebarContent = () => {
    if (showLoadingSidebar) {
      return <ChangeHistoryTimeline items={[]} isLoading />;
    }

    if (showListError) {
      return (
        <div css={styles.sidebarEmptyState} data-test-subj="changeHistoryModalError">
          <ChangeHistoryListErrorPrompt error={error} />
        </div>
      );
    }

    if (!hasItems) {
      return (
        <div css={styles.sidebarEmptyState} data-test-subj="changeHistoryModalEmpty">
          <ChangeHistoryEmptyPrompt />
        </div>
      );
    }

    return (
      <ChangeHistoryTimeline
        items={items}
        selectedItemId={selectedChangeId}
        historyStartedAt={historyStartedAt}
        isLoading={isLoadingMore}
        onSelectItem={(item) => setSelectedChangeId(item.id)}
        onLoadMore={loadMore}
        renderBadge={renderBadge}
      />
    );
  };

  return (
    <EuiModal
      onClose={closeModal}
      maxWidth={false}
      css={styles.modal}
      data-test-subj="changeHistoryModal"
    >
      <EuiModalBody css={styles.modalBody}>
        <div css={styles.splitLayout}>
          <ChangeHistoryPreviewShell
            backLabel={labels.previewBackLabel}
            title={labels.previewTitle}
            onBack={closeModal}
            footer={previewFooter}
          >
            <ChangeHistoryPreviewPanel />
          </ChangeHistoryPreviewShell>

          <ChangeHistorySidebarPanel title={labels.timelinePanelTitle} onClose={closeModal}>
            {renderSidebarContent()}
          </ChangeHistorySidebarPanel>
        </div>
      </EuiModalBody>
    </EuiModal>
  );
}
