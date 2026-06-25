/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useState } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiIcon, EuiText, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import * as i18n from './translations';

/** Collapsed comment preview length before showing expand affordance. */
export const CHANGE_HISTORY_COMMENT_COLLAPSED_LENGTH = 60;

/** Maximum characters shown when a comment is expanded. */
export const CHANGE_HISTORY_COMMENT_EXPANDED_LENGTH = 200;

interface ChangeHistoryItemCommentProps {
  comment: string;
}

export const ChangeHistoryItemComment = memo(function ChangeHistoryItemComment({
  comment,
}: ChangeHistoryItemCommentProps): JSX.Element {
  const { euiTheme } = useEuiTheme();
  const [expanded, setExpanded] = useState(false);
  const isExpandable = comment.length > CHANGE_HISTORY_COMMENT_COLLAPSED_LENGTH;
  const displayComment = expanded
    ? comment.slice(0, CHANGE_HISTORY_COMMENT_EXPANDED_LENGTH)
    : comment.slice(0, CHANGE_HISTORY_COMMENT_COLLAPSED_LENGTH);
  const isTruncated = expanded
    ? comment.length > CHANGE_HISTORY_COMMENT_EXPANDED_LENGTH
    : comment.length > CHANGE_HISTORY_COMMENT_COLLAPSED_LENGTH;

  const handleToggle = useCallback(
    (event: React.MouseEvent | React.KeyboardEvent) => {
      event.stopPropagation();

      if (!isExpandable) {
        return;
      }

      setExpanded((value) => !value);
    },
    [isExpandable]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        handleToggle(event);
      }
    },
    [handleToggle]
  );

  return (
    <EuiFlexGroup
      gutterSize="xs"
      alignItems="flexStart"
      responsive={false}
      tabIndex={isExpandable ? 0 : undefined}
      role={isExpandable ? 'button' : undefined}
      aria-expanded={isExpandable ? expanded : undefined}
      aria-label={isExpandable ? i18n.COMMENT_TOGGLE_ARIA_LABEL : undefined}
      onClick={handleToggle}
      onKeyDown={isExpandable ? handleKeyDown : undefined}
      css={css`
        width: 100%;
        min-width: 0;
        margin-top: ${euiTheme.size.xs};
        padding: ${euiTheme.size.xs} ${euiTheme.size.s};
        border-radius: ${euiTheme.border.radius.small};
        background-color: ${euiTheme.colors.backgroundBaseSubdued};
        cursor: ${isExpandable ? 'pointer' : 'default'};
      `}
      data-test-subj="changeHistoryItemComment"
    >
      {isExpandable && (
        <EuiFlexItem grow={false}>
          <EuiIcon type={expanded ? 'arrowDown' : 'arrowRight'} size="s" color="subdued" />
        </EuiFlexItem>
      )}
      <EuiFlexItem
        css={css`
          min-width: 0;
          flex: 1 1 auto;
        `}
      >
        <EuiText
          size="xs"
          color="subdued"
          css={
            expanded
              ? undefined
              : css`
                  overflow: hidden;
                  text-overflow: ellipsis;
                  white-space: nowrap;
                `
          }
        >
          {displayComment}
          {isTruncated ? '…' : ''}
        </EuiText>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
});
