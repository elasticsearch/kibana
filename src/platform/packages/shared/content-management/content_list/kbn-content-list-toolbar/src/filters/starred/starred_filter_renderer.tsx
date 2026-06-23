/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback } from 'react';
import { EuiFilterButton } from '@elastic/eui';
import type { Query } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useContentListConfig } from '@kbn/content-list-provider';
import { CONTENT_LIST_TEST_SUBJECTS } from '@kbn/content-list-common';

const STARRED_FIELD = 'starred';

const i18nText = {
  label: i18n.translate('contentManagement.contentList.starredRenderer.label', {
    defaultMessage: 'Starred',
  }),
};

/**
 * Props for the {@link StarredFilterRenderer} component.
 *
 * When used with `EuiSearchBar` `custom_component` filters, the search bar passes
 * `query` and `onChange` props. The starred filter uses these to add or remove
 * `is:starred` in the query text.
 */
export interface StarredFilterRendererProps {
  /** Query object from `EuiSearchBar`. */
  query?: Query;
  /** `onChange` callback from `EuiSearchBar`. */
  onChange?: (query: Query) => void;
  /** Optional `data-test-subj` attribute for testing. */
  'data-test-subj'?: string;
}

/**
 * `StarredFilterRenderer` component for `EuiSearchBar` `custom_component` filter.
 *
 * Renders a single toggle button that adds/removes `is:starred` from the query.
 * Unlike the tag filter (multi-select popover), starred is a simple boolean toggle.
 */
export const StarredFilterRenderer = ({
  query,
  onChange,
  'data-test-subj': dataTestSubj = CONTENT_LIST_TEST_SUBJECTS.starredFilter,
}: StarredFilterRendererProps) => {
  const { supports } = useContentListConfig();

  const active = query?.hasIsClause(STARRED_FIELD) ?? false;

  const handleClick = useCallback(() => {
    if (!query || !onChange) {
      return;
    }

    const nextQuery = active
      ? query.removeIsClause(STARRED_FIELD)
      : query.addMustIsClause(STARRED_FIELD);

    onChange(nextQuery);
  }, [query, onChange, active]);

  if (!supports.starred) {
    return null;
  }

  // Uses EUI's "single filter" pattern (`isToggle` + `isSelected`) so the
  // button renders with `aria-pressed={active}` semantics and the proper
  // toggled visual state. `hasActiveFilters` adds EUI's existing
  // active-highlight on top, matching the treatment used by the recents
  // filter so both single-filter toggles look and behave the same way.
  // The icon also swaps between `starFilled`/`starEmpty` to reinforce the
  // toggled state visually — a luxury the recents filter does not have
  // because EUI doesn't ship a paired filled/empty clock glyph.
  return (
    <EuiFilterButton
      isToggle
      isSelected={active}
      hasActiveFilters={active}
      iconType={active ? 'starFilled' : 'starEmpty'}
      onClick={handleClick}
      data-test-subj={dataTestSubj}
    >
      {i18nText.label}
    </EuiFilterButton>
  );
};
