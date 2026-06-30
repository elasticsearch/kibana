/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  EuiText,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { ChangeHistoryListItem } from '../../types/change_history_list_item';
import { ChangeHistoryEmptyPrompt } from './change_history_empty_prompt';
import { ChangeHistoryFooter } from './change_history_footer';
import { ChangeHistoryItem } from './change_history_item';
import * as i18n from './translations';

export interface ChangeHistoryTimelineProps {
  items: ChangeHistoryListItem[];
  selectedItemId?: string;
  historyStartedAt?: Date;
  isLoading?: boolean;
  onSelectItem?: (item: ChangeHistoryListItem) => void;
  onLoadMore?: () => void;
}

export function ChangeHistoryTimeline({
  items,
  selectedItemId,
  historyStartedAt,
  isLoading,
  onSelectItem,
  onLoadMore,
}: ChangeHistoryTimelineProps): JSX.Element {
  const { euiTheme } = useEuiTheme();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    if (!onLoadMore || isLoading || !scrollContainerRef.current || !sentinelRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onLoadMoreRef.current?.();
        }
      },
      { root: scrollContainerRef.current, threshold: 0 }
    );

    observer.observe(sentinelRef.current);

    return () => observer.disconnect();
  }, [isLoading, items.length, onLoadMore]);

  const firstItemId = items[0]?.id;

  useEffect(() => {
    if (!selectedItemId || !firstItemId || selectedItemId !== firstItemId) {
      return;
    }

    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      return;
    }

    if (typeof scrollContainer.scrollTo === 'function') {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      scrollContainer.scrollTop = 0;
    }
  }, [firstItemId, selectedItemId]);

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
        display: flex;
        flex-direction: column;
        gap: ${euiTheme.size.s};
        padding: ${euiTheme.size.s};
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
    <div data-test-subj="changeHistoryTimeline" css={styles.changesTimelineWrapper}>
      <div
        ref={scrollContainerRef}
        css={styles.changesTimeline}
        aria-label={i18n.TIMELINE_ARIA_LABEL}
        data-test-subj="changeHistoryTimelineList"
      >
        {items.map((item) => (
          <ChangeHistoryItem
            key={item.id}
            item={item}
            selected={selectedItemId === item.id}
            onClick={() => onSelectItem?.(item)}
          />
        ))}
        {onLoadMore && <div ref={sentinelRef} />}
        {isLoading && (
          <EuiFlexGroup justifyContent="center" alignItems="center" gutterSize="s">
            <EuiFlexItem grow={false}>
              <EuiLoadingSpinner size="m" />
            </EuiFlexItem>
          </EuiFlexGroup>
        )}
      </div>
      {historyStartedAt && <ChangeHistoryFooter startedAt={historyStartedAt} />}
    </div>
  );
}

function Loading(): JSX.Element {
  return (
    <EuiPanel hasBorder data-test-subj="changeHistoryTimelineLoading">
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
    <div
      css={css`
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        height: 100%;
      `}
      data-test-subj="changeHistoryTimelineEmpty"
    >
      <ChangeHistoryEmptyPrompt />
    </div>
  );
}
