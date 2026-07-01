/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiAvatar,
  useEuiTheme,
  type Query,
} from '@elastic/eui';
import {
  useContentListConfig,
  useFilterFacets,
  useProfileCache,
  SENTINEL_KEYS,
  MANAGED_USER_FILTER,
} from '@kbn/content-list-provider';
import type { UserProfileEntry } from '@kbn/content-list-provider';
import {
  SelectableFilterPopover,
  StandardFilterOption,
  type SelectableFilterOption,
} from '../selectable_filter_popover';

/**
 * Props for the {@link UserFieldFilterRenderer} component.
 */
export interface UserFieldFilterRendererProps {
  /** The filter field name (e.g. `'createdBy'`, `'updatedBy'`). */
  fieldName: string;
  /** Title displayed in the popover header and button. */
  title: string;
  /** Query object from `EuiSearchBar`. */
  query?: Query;
  /** `onChange` callback from `EuiSearchBar`. */
  onChange?: (query: Query) => void;
  /** Message shown when no users are available. */
  emptyMessage: string;
  /** Message shown when search yields no matches. */
  noMatchesMessage: string;
  /** Optional `data-test-subj` attribute for testing. */
  'data-test-subj'?: string;
}

/**
 * Generic filter popover renderer for user-UID-based fields.
 *
 * Consumes `useFilterFacets(fieldName)` for display-ready user facets with
 * counts, matching the same pattern used by `TagFilterRenderer`.
 *
 * Reusable across `createdBy`, `updatedBy`, and other user-UID fields.
 */
export const UserFieldFilterRenderer = ({
  fieldName,
  title,
  query,
  onChange,
  emptyMessage,
  noMatchesMessage,
  'data-test-subj': dataTestSubj,
}: UserFieldFilterRendererProps) => {
  const { supports } = useContentListConfig();
  const { euiTheme } = useEuiTheme();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const profileCache = useProfileCache();
  const facetsQuery = useFilterFacets<UserProfileEntry>(fieldName, { enabled: isPopoverOpen });

  // Seed the profile cache with profiles resolved by `getFacets`.
  // This is essential for the direct `ContentListProvider` path where a
  // custom facet config fetches profiles externally — without seeding,
  // `parseQueryText` can't resolve emails written by the popover to UIDs.
  // The client provider path already warms the cache in its `getFacets`,
  // so this is a no-op there (seed doesn't overwrite existing entries).
  useEffect(() => {
    if (!facetsQuery.data || !profileCache) {
      return;
    }
    const entries = facetsQuery.data.map((f) => f.data).filter((e): e is UserProfileEntry => !!e);
    if (entries.length > 0) {
      profileCache.seed(entries);
    }
  }, [facetsQuery.data, profileCache]);

  const options = useMemo(
    (): Array<SelectableFilterOption<UserProfileEntry>> =>
      (facetsQuery.data ?? [])
        .map(({ key, label, count, data }) => ({
          key,
          label,
          value: data?.email || label,
          count,
          data,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [facetsQuery.data]
  );

  const renderOption = useCallback(
    (
      option: SelectableFilterOption<UserProfileEntry>,
      { isActive, state }: { isActive: boolean; state?: 'include' | 'includeAll' | 'exclude' }
    ) => {
      const testSubj = `${fieldName}-searchbar-option-${option.key}`;
      const isSentinel = SENTINEL_KEYS.has(option.key);
      const avatar = isSentinel ? (
        <EuiAvatar
          name={option.label}
          size="s"
          iconType={option.key === MANAGED_USER_FILTER ? 'package' : 'userAvatar'}
          color="subdued"
          data-test-subj={testSubj}
        />
      ) : (
        <EuiAvatar name={option.label} size="s" data-test-subj={testSubj} />
      );

      return (
        <StandardFilterOption count={option.count} isActive={isActive} state={state}>
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>{avatar}</EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="s">{option.label}</EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </StandardFilterOption>
      );
    },
    [fieldName]
  );

  if (!supports.userProfiles) {
    return null;
  }

  return (
    <SelectableFilterPopover<UserProfileEntry>
      fieldName={fieldName}
      title={title}
      query={query}
      onChange={onChange}
      options={options}
      renderOption={renderOption}
      allowMatchAll={false}
      isLoading={facetsQuery.isLoading}
      emptyMessage={emptyMessage}
      noMatchesMessage={noMatchesMessage}
      panelMinWidth={euiTheme.base * 22}
      onToggle={setIsPopoverOpen}
      data-test-subj={dataTestSubj}
    />
  );
};
