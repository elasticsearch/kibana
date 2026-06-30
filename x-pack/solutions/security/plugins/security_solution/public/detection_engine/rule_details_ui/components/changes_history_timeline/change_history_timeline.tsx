/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import {
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { useUserPrivileges } from '../../../../common/components/user_privileges';
import type { RuleHistoryItem } from '../../../../../common/api/detection_engine/rule_management';
import { ChangeHistoryItem } from './change_history_item';
import { TrackingStartedFooter } from './change_history_footer';
import { DIFFABLE_CHANGE_ACTIONS } from './constants';
import * as i18n from './translations';

interface ChangeHistoryTimelineProps {
  items: RuleHistoryItem[];
  selectedItem?: RuleHistoryItem;
  startedAt?: Date;
  isLoading?: boolean;
  restoringItemId?: string;
  onSelectItem?: (item: RuleHistoryItem) => void;
  onRestore: (item: RuleHistoryItem) => void;
  /**
   * Requests loading more data
   */
  onLoadMore: () => void;
}

export function RuleChangesHistoryTimeline({
  items,
  selectedItem,
  startedAt,
  isLoading,
  restoringItemId,
  onSelectItem,
  onRestore,
  onLoadMore,
}: ChangeHistoryTimelineProps): JSX.Element {
  const { euiTheme } = useEuiTheme();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const {
    rules: { edit: canEditRules },
  } = useUserPrivileges().rulesPrivileges;

  // Track scrolling to load more items
  useEffect(() => {
    if (!sentinelRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onLoadMore();
        }
      },
      { threshold: 0 }
    );

    observer.observe(sentinelRef.current);

    return () => observer.disconnect();
  }, [onLoadMore]);

  const styles = useMemo(
    () => ({
      changesTimelineWrapper: css`
        display: flex;
        flex-direction: column;
        height: 100%;
      `,
      changesTimeline: css`
        flex: 1 1 0;
        overflow-y: auto;
        min-height: 0;
        // Extra inset space so item hover shadows/borders aren't clipped by the
        // overflow container. Setting overflowY forces overflowX to hidden too.
        padding-top: ${euiTheme.size.s};
        padding-left: ${euiTheme.size.m};
        padding-right: ${euiTheme.size.m};
      `,
    }),
    [euiTheme]
  );

  if (items.length === 0 && isLoading) {
    return <Loading />;
  }

  if (items.length === 0) {
    return <NoData />;
  }

  return (
    <div data-test-subj="ruleChangeHistory" css={styles.changesTimelineWrapper}>
      <div
        css={styles.changesTimeline}
        aria-label={i18n.TIMELINE_ARIA_LABEL}
        data-test-subj="ruleChangeHistoryList"
      >
        {items.map((item, index) => (
          <ChangeHistoryItem
            key={item.id}
            item={item}
            selected={selectedItem?.id === item.id}
            restoringItemId={restoringItemId}
            onRestore={
              !restoringItemId && isRestorableItem(item) && index !== 0 && canEditRules
                ? onRestore
                : undefined
            }
            onClick={restoringItemId ? undefined : onSelectItem}
          />
        ))}
        <div ref={sentinelRef} />
        {isLoading && (
          <>
            <EuiSpacer size="s" />
            <EuiFlexGroup justifyContent="center" alignItems="center" gutterSize="s">
              <EuiFlexItem grow={false}>
                <EuiLoadingSpinner size="m" />
              </EuiFlexItem>
            </EuiFlexGroup>
          </>
        )}
        <EuiSpacer size="s" />
      </div>
      {startedAt && <TrackingStartedFooter startedAt={startedAt} />}
    </div>
  );
}

function Loading(): JSX.Element {
  return (
    <EuiPanel hasBorder data-test-subj="ruleChangeHistoryTableLoading">
      <EuiFlexGroup justifyContent="center" alignItems="center" gutterSize="s">
        <EuiFlexItem grow={false}>
          <EuiLoadingSpinner size="m" />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="s">{i18n.LOADING_LABEL}</EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
}

function NoData(): JSX.Element {
  return (
    <EuiPanel hasBorder data-test-subj="ruleChangeHistoryTableEmpty">
      <EuiEmptyPrompt
        iconType="clock"
        title={<h2>{i18n.NO_CHANGE_HISTORY_TITLE}</h2>}
        body={<p>{i18n.NO_CHANGE_HISTORY_BODY}</p>}
      />
    </EuiPanel>
  );
}

function isRestorableItem(item: RuleHistoryItem): boolean {
  return DIFFABLE_CHANGE_ACTIONS.includes(item.action);
}
