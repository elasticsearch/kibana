/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { EuiSearchBar, EuiText } from '@elastic/eui';
import type { EuiSearchBarOnChangeArgs } from '@elastic/eui';
import {
  useContentListConfig,
  useContentListSearch,
  useContentListSelection,
  useContentListPhase,
} from '@kbn/content-list-provider';
import { i18n } from '@kbn/i18n';
import {
  CONTENT_LIST_TEST_SUBJECTS,
  getContentListToolbarSubjects,
} from '@kbn/content-list-common';
import { Filters } from './filters';
import { useFilters } from './hooks';
import { SelectionBar } from './selection_bar';
import { ToolbarSkeleton } from './skeleton/toolbar_skeleton';

/**
 * Props for the {@link ContentListToolbar} component.
 */
export interface ContentListToolbarProps {
  /** Optional children for declarative configuration via {@link Filters}. */
  children?: ReactNode;
  /** Optional `data-test-subj` attribute for testing. */
  'data-test-subj'?: string;
}

const defaultPlaceholder = i18n.translate(
  'contentManagement.contentList.toolbar.searchPlaceholder',
  { defaultMessage: 'Search…' }
);

const parseErrorPrefix = i18n.translate(
  'contentManagement.contentList.toolbar.searchParseErrorPrefix',
  { defaultMessage: 'Invalid search:' }
);

/**
 * `ContentListToolbar` component.
 *
 * `queryText` from state flows directly to `EuiSearchBar`'s `query` prop.
 * When the user types or commits a filter, `onChange` stores `query.text`
 * back to state. No displayText, no typingRef, no sync hacks — one source
 * of truth.
 */
const ContentListToolbarComponent = ({
  children,
  'data-test-subj': dataTestSubj = CONTENT_LIST_TEST_SUBJECTS.toolbar,
}: ContentListToolbarProps) => {
  const subjects = useMemo(() => getContentListToolbarSubjects(dataTestSubj), [dataTestSubj]);
  const phase = useContentListPhase();
  const { labels, supports } = useContentListConfig();
  const {
    queryText,
    setQueryFromEuiQuery,
    isSupported: searchIsSupported,
    fieldNames,
  } = useContentListSearch();
  const { selectedCount } = useContentListSelection();
  const filters = useFilters(children);

  // Surface `EuiSearchBar` parse errors below the input — the built-in
  // invalid-icon + browser `title` tooltip is easy to miss
  // ({@link https://github.com/elastic/kibana/issues/271705}).
  const [parseError, setParseError] = useState<string | null>(null);

  const handleSearchChange = useCallback(
    ({ query, error }: EuiSearchBarOnChangeArgs) => {
      if (error || !query) {
        // Capture the parse message for the hint popover but do not echo the
        // raw text back through the controlled `query` prop —
        // `EuiSearchBar.getDerivedStateFromProps` re-parses every new value
        // and would throw on unparseable text.
        setParseError(error ? error.message : null);
        return;
      }
      setParseError(null);
      setQueryFromEuiQuery(query);
    },
    [setQueryFromEuiQuery]
  );

  const searchHint = useMemo(
    () => ({
      content: (
        <EuiText color="danger" size="s" data-test-subj={subjects.searchParseError}>
          {parseErrorPrefix} {parseError}
        </EuiText>
      ),
      popoverProps: { isOpen: Boolean(parseError) },
    }),
    [parseError, subjects]
  );

  // Build an EuiSearchBar schema so it recognizes registered fields (e.g., `tag`,
  // `createdBy`) and doesn't escape the colon when the user types `field:value`.
  const boxSchema = useMemo(() => {
    if (fieldNames.length === 0) {
      return undefined;
    }
    const schemaFields: Record<string, { type: 'string' }> = {};
    for (const name of fieldNames) {
      schemaFields[name] = { type: 'string' };
    }
    return { strict: false, fields: schemaFields };
  }, [fieldNames]);

  // Only pass the SelectionBar as a toolsLeft item when there are actually
  // selected items. EuiSearchBar renders every toolsLeft entry as a flex item
  // regardless of whether the child renders null, producing an empty gap when
  // nothing is selected.
  const toolsLeft = useMemo(
    () =>
      supports.selection && selectedCount > 0
        ? [<SelectionBar key="selection" data-test-subj={subjects.selectionBar} />]
        : undefined,
    [supports.selection, selectedCount, subjects]
  );

  if (phase === 'initialLoad') {
    return (
      <ToolbarSkeleton
        filterCount={filters.length}
        hasSelection={supports.selection}
        data-test-subj={subjects.skeleton}
      />
    );
  }

  return (
    <EuiSearchBar
      query={queryText}
      box={{
        placeholder: labels.searchPlaceholder ?? defaultPlaceholder,
        incremental: true,
        'data-test-subj': subjects.searchBox,
        disabled: !searchIsSupported,
        ...(boxSchema && { schema: boxSchema }),
      }}
      onChange={handleSearchChange}
      toolsLeft={toolsLeft}
      filters={filters}
      hint={searchHint}
      data-test-subj={dataTestSubj}
    />
  );
};

// Attach sub-components to `ContentListToolbar` namespace.
export const ContentListToolbar = Object.assign(ContentListToolbarComponent, {
  Filters,
  SelectionBar,
});
