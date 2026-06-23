/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { memo, useCallback } from 'react';
import { css } from '@emotion/react';
import { EuiAvatar, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { UserAvatarTip } from '@kbn/user-profile-components';
import {
  useCreatedByFilterToggle,
  useProfile,
  MANAGED_USER_FILTER,
  MANAGED_USER_LABEL,
  NO_CREATOR_USER_FILTER,
  NO_CREATOR_USER_LABEL,
} from '@kbn/content-list-provider';
import { CONTENT_LIST_TEST_SUBJECTS } from '@kbn/content-list-common';

/** Props for the {@link CreatedByCell} component. */
export interface CreatedByCellProps {
  /** The user ID (`uid`) of the item's creator. */
  createdBy?: string;
  /** Whether the item is system-managed (e.g. part of a package). */
  managed?: boolean;
}

const cellCss = css`
  display: inline-flex;
  align-items: center;
  cursor: pointer;
`;

/**
 * Determine the filter type from a keyboard or mouse event's modifier keys.
 * Cmd (Mac) or Ctrl (Windows/Linux) -> exclude; otherwise -> include.
 */
const getFilterType = (e: { metaKey: boolean; ctrlKey: boolean }): 'include' | 'exclude' =>
  e.metaKey || e.ctrlKey ? 'exclude' : 'include';

/**
 * Cell renderer for `Column.CreatedBy`.
 *
 * Self-loading: uses `useProfile(uid)` which triggers a batched load if the
 * profile is not yet cached. Multiple cells mounting in the same frame get
 * their requests batched into a single `bulkResolve`.
 *
 * All avatar types are clickable: clicking toggles an include filter,
 * holding Cmd/Ctrl toggles exclude. Managed items use the `__managed__`
 * sentinel, items without a creator use `__no_creator__`, and regular
 * items filter by their UID.
 */
export const CreatedByCell = memo(({ createdBy, managed }: CreatedByCellProps) => {
  const user = useProfile(!managed ? createdBy : undefined);
  const toggleFilter = useCreatedByFilterToggle();

  const filterKey = managed ? MANAGED_USER_FILTER : createdBy ?? NO_CREATOR_USER_FILTER;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      toggleFilter(filterKey, getFilterType(e));
    },
    [filterKey, toggleFilter]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleFilter(filterKey, getFilterType(e));
      }
    },
    [filterKey, toggleFilter]
  );

  if (managed) {
    return (
      <span
        css={cellCss}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label={i18n.translate(
          'contentManagement.contentList.table.createdByCell.filterAriaLabel',
          { defaultMessage: 'Filter by creator: {name}', values: { name: MANAGED_USER_LABEL } }
        )}
        data-test-subj={CONTENT_LIST_TEST_SUBJECTS.createdByManaged}
      >
        <EuiToolTip content={MANAGED_USER_LABEL} position="top">
          <EuiAvatar name={MANAGED_USER_LABEL} size="s" iconType="package" color="subdued" />
        </EuiToolTip>
      </span>
    );
  }

  if (!createdBy) {
    return (
      <span
        css={cellCss}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label={i18n.translate(
          'contentManagement.contentList.table.createdByCell.filterAriaLabel',
          { defaultMessage: 'Filter by creator: {name}', values: { name: NO_CREATOR_USER_LABEL } }
        )}
        data-test-subj={CONTENT_LIST_TEST_SUBJECTS.createdByNoCreator}
      >
        <EuiToolTip content={NO_CREATOR_USER_LABEL} position="top">
          <EuiAvatar name={NO_CREATOR_USER_LABEL} size="s" iconType="userAvatar" color="subdued" />
        </EuiToolTip>
      </span>
    );
  }

  if (!user) {
    return <span>—</span>;
  }

  return (
    <span
      css={cellCss}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={i18n.translate(
        'contentManagement.contentList.table.createdByCell.filterAriaLabel',
        { defaultMessage: 'Filter by creator: {name}', values: { name: user.fullName } }
      )}
      data-test-subj={CONTENT_LIST_TEST_SUBJECTS.createdByAvatar}
    >
      <UserAvatarTip {...{ user: user.user, avatar: user.avatar, size: 's' }} />
    </span>
  );
});

CreatedByCell.displayName = 'CreatedByCell';
