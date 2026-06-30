/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  EuiButtonIcon,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiImage,
  EuiTitle,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { RuleObjectId } from '../../../../../common/api/detection_engine';
import noChangeHistoryImg from './images/no_change_history.png';
import { SecurityPageName } from '../../../../app/types';
import { useKibana } from '../../../../common/lib/kibana';
import { APP_UI_ID } from '../../../../../common/constants';
import { getRuleDetailsTabUrl } from '../../../../common/components/link_to/redirect_to_detection_engine';
import type { RuleHistoryItem } from '../../../../../common/api/detection_engine/rule_management';
import { useRule } from '../../../rule_management/logic';
import { RuleChangesHistoryTimeline } from '../changes_history_timeline';
import { useInfiniteChangeHistory } from '../../../rule_management/api/hooks/use_infinite_change_history';
import { RuleDetailTabs } from '../../pages/rule_details/use_rule_details_tabs';
import { RuleChangesDiff } from '../changes_diff/changes_diff';
import { useChangeHistoryAutoSelection } from './use_change_history_auto_selection';
import { useRuleRestoreFromHistory } from './use_rule_restore_from_history';
import { useRuleRestoreConflict } from './use_rule_restore_conflict';
import { RuleRestoreConflictModal } from './rule_restore_conflict_modal';
import * as i18n from './translations';

const SIDEBAR_WIDTH = 400;
const NO_HISTORY_IMG_SIZE = 128;

interface RuleChangesHistoryProps {
  ruleId: RuleObjectId;
  header?: React.ReactNode;
}

export const RuleChangesHistory = memo(function RuleChangesHistory({
  ruleId,
  header,
}: RuleChangesHistoryProps): JSX.Element {
  const { euiTheme } = useEuiTheme();
  const {
    application: { navigateToApp },
  } = useKibana().services;
  const handleClose = useCallback(() => {
    navigateToApp(APP_UI_ID, {
      deepLinkId: SecurityPageName.rules,
      path: getRuleDetailsTabUrl(ruleId, RuleDetailTabs.overview),
    });
  }, [navigateToApp, ruleId]);
  const { isFetching: isRuleLoading, data: rule } = useRule(ruleId, false, {
    refetchOnWindowFocus: false,
  });

  const [selectedItem, setSelectedItem] = useState<RuleHistoryItem | undefined>();
  const { data, isLoading, isFetching, isFetchingNextPage, fetchNextPage, hasNextPage } =
    useInfiniteChangeHistory({ ruleId });
  const handleNextPageLoading = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }

    fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data?.pages]);
  const hasNoHistory = !isLoading && items.length === 0;
  const trackingStartedAt = data?.pages[0]?.tracking_started_at;
  const changeHistoryStartedAt = useMemo(
    () => (trackingStartedAt ? new Date(trackingStartedAt) : undefined),
    [trackingStartedAt]
  );

  const { lockSelectionDecision, unlockSelectionDecision } = useChangeHistoryAutoSelection({
    ruleId,
    items,
    isFetchingFirstPage: isFetching && !isFetchingNextPage,
    setSelectedItem,
  });

  const {
    conflictState,
    handleConflict,
    handleConflictReviewChanges,
    handleConflictRestoreAnyway,
    handleConflictCancel,
  } = useRuleRestoreConflict({ unlockSelectionDecision });

  const { restoreFromHistory, restoringItemId } = useRuleRestoreFromHistory({
    ruleId,
    ruleRevision: rule?.revision,
    onRestoreSuccess: unlockSelectionDecision,
    onConflict: handleConflict,
  });

  const handleSelectItem = useCallback(
    (item: RuleHistoryItem) => {
      lockSelectionDecision();
      setSelectedItem(item);
    },
    [lockSelectionDecision, setSelectedItem]
  );

  const styles = useMemo(
    () => ({
      mainCss: css`
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      `,
      diffCss: css`
        flex: 1;
        min-height: 0;
        overflow-y: auto;
      `,
      sidebarHeaderCss: css`
        padding: ${euiTheme.size.m};
      `,
      flyoutBodyCss: css`
        & .euiFlyoutBody__overflowContent {
          height: 100%;
          display: flex;
          flex-direction: column;
        }
      `,
      flyoutCss: css`
        top: calc(var(--euiFixedHeadersOffset, 0) + ${euiTheme.size.base});
        bottom: ${euiTheme.size.base};
        height: auto;
        border-top-left-radius: ${euiTheme.border.radius.medium};
        border-bottom-left-radius: ${euiTheme.border.radius.medium};
      `,
    }),
    [euiTheme]
  );

  if (hasNoHistory) {
    return (
      <div css={styles.mainCss}>
        {header}
        <EuiEmptyPrompt
          icon={
            <EuiImage
              src={noChangeHistoryImg}
              size={NO_HISTORY_IMG_SIZE}
              alt={i18n.NO_CHANGE_HISTORY_TITLE}
            />
          }
          title={<h2>{i18n.NO_CHANGE_HISTORY_TITLE}</h2>}
          body={<p>{i18n.NO_CHANGE_HISTORY_BODY}</p>}
          data-test-subj="ruleChangesHistoryEmpty"
        />
      </div>
    );
  }

  return (
    <>
      {conflictState && (
        <RuleRestoreConflictModal
          item={conflictState.item}
          isDeletedRule={conflictState.isDeletedRule}
          onCancel={handleConflictCancel}
          onReviewChanges={handleConflictReviewChanges}
          onRestoreAnyway={handleConflictRestoreAnyway}
        />
      )}
      <EuiFlyout
        type="push"
        size={`${SIDEBAR_WIDTH}px`}
        ownFocus={false}
        onClose={handleClose}
        hideCloseButton
        pushMinBreakpoint="xs"
        paddingSize="none"
        aria-labelledby="ruleChangesHistorySidebarTitle"
        data-test-subj="ruleChangesHistorySidebar"
        css={styles.flyoutCss}
      >
        <EuiFlyoutHeader hasBorder>
          <EuiFlexGroup
            alignItems="center"
            gutterSize="s"
            responsive={false}
            css={styles.sidebarHeaderCss}
          >
            <EuiFlexItem>
              <EuiTitle size="xs">
                <h2 id="ruleChangesHistorySidebarTitle">{i18n.VERSION_HISTORY_TITLE}</h2>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiToolTip content={i18n.CLOSE_VERSION_HISTORY} disableScreenReaderOutput>
                <EuiButtonIcon
                  iconType="cross"
                  aria-label={i18n.CLOSE_VERSION_HISTORY}
                  onClick={handleClose}
                  data-test-subj="ruleChangesHistoryClose"
                />
              </EuiToolTip>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutHeader>
        <EuiFlyoutBody css={styles.flyoutBodyCss}>
          <RuleChangesHistoryTimeline
            key={ruleId}
            items={items}
            selectedItem={selectedItem}
            isLoading={isLoading || isFetching || isRuleLoading}
            startedAt={changeHistoryStartedAt}
            onLoadMore={handleNextPageLoading}
            onSelectItem={handleSelectItem}
            onRestore={restoreFromHistory}
            restoringItemId={restoringItemId}
          />
        </EuiFlyoutBody>
      </EuiFlyout>
      <div css={styles.mainCss}>
        {header}
        <div css={styles.diffCss}>
          <RuleChangesDiff item={selectedItem} isLoading={isLoading} />
        </div>
      </div>
    </>
  );
});
