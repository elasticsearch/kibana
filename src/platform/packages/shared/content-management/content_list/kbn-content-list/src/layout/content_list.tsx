/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { type ReactNode } from 'react';
import { useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { useContentListPhase } from '@kbn/content-list-provider';
import { CONTENT_LIST_TEST_SUBJECTS } from '@kbn/content-list-common';
import { ContentListEmptyState } from '../empty_state';

/**
 * Props for {@link ContentList}.
 */
export interface ContentListProps {
  /**
   * Sections laid out inside a flex-column container with consistent gap
   * between them. Typical children are `<ContentListToolbar />`,
   * `<ContentListTable />`, and `<ContentListFooter />`.
   */
  children: ReactNode;
  /**
   * Rendered in place of `children` when the phase is `'empty'`. When omitted,
   * `ContentList` renders a provider-aware default prompt. Pass `null` to
   * intentionally suppress the empty-state region.
   */
  emptyState?: ReactNode;
  /** Optional `data-test-subj`. */
  'data-test-subj'?: string;
}

/**
 * Layout shell for a Content List.
 */
export const ContentList = ({
  children,
  emptyState,
  'data-test-subj': dataTestSubj = 'content-list',
}: ContentListProps) => {
  const phase = useContentListPhase();
  const { euiTheme } = useEuiTheme();

  if (phase === 'empty') {
    return (
      <div data-test-subj={`${dataTestSubj}-emptyState`}>
        {emptyState === undefined ? (
          <ContentListEmptyState data-test-subj={CONTENT_LIST_TEST_SUBJECTS.defaultEmptyState} />
        ) : (
          emptyState
        )}
      </div>
    );
  }

  return (
    <div
      data-test-subj={dataTestSubj}
      css={css`
        display: flex;
        flex-direction: column;
        gap: ${euiTheme.size.m};
      `}
    >
      {children}
    </div>
  );
};
