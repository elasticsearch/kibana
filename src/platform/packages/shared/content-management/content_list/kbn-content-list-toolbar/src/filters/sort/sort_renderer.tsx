/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useMemo, useCallback } from 'react';
import { EuiSelectable, EuiIcon, useEuiTheme, type Query } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import {
  useContentListConfig,
  useContentListSort,
  DEFAULT_SORT_FIELDS,
  type SortField,
  type SortingConfig,
} from '@kbn/content-list-provider';
import { CONTENT_LIST_TEST_SUBJECTS } from '@kbn/content-list-common';
import { useFilterPopover, FilterPopover } from '../filter_popover';

// Helper to safely extract SortingConfig from features.sorting.
const getSortingConfig = (
  sorting: SortingConfig | boolean | undefined
): SortingConfig | undefined => {
  return typeof sorting === 'object' ? sorting : undefined;
};

/**
 * Props for the {@link SortRenderer} component.
 *
 * When used with `EuiSearchBar` `custom_component` filters, the search bar passes
 * `query` and `onChange` props. The sort filter doesn't use these (it manages sort
 * state separately via `useContentListSort`), but we accept them for compatibility.
 */
export interface SortRendererProps {
  /** Query object from `EuiSearchBar` (unused - sort doesn't affect query). */
  query: Query;
  /** `onChange` callback from `EuiSearchBar` (unused - sort doesn't affect query). */
  onChange?: (query: Query) => void;
  /** Optional `data-test-subj` attribute for testing. */
  'data-test-subj'?: string;
}

/**
 * Internal interface for sort option items.
 */
interface SortItem {
  /** Display label for the sort option. */
  label: string;
  /** Field to sort by. */
  field: string;
  /** Sort direction. */
  direction: 'asc' | 'desc';
  /** Optional React node to append (e.g., sort direction icon). */
  append?: React.ReactNode;
  /** Whether this option is checked. */
  checked?: 'on' | undefined;
}

const i18nText = {
  headerSort: i18n.translate('contentManagement.contentList.sortRenderer.headerLabel', {
    defaultMessage: 'Sort by',
  }),
  nameAsc: i18n.translate('contentManagement.contentList.sortRenderer.nameAscLabel', {
    defaultMessage: 'A-Z',
  }),
  nameDesc: i18n.translate('contentManagement.contentList.sortRenderer.nameDescLabel', {
    defaultMessage: 'Z-A',
  }),
  dateAsc: i18n.translate('contentManagement.contentList.sortRenderer.dateAscLabel', {
    defaultMessage: 'Oldest first',
  }),
  dateDesc: i18n.translate('contentManagement.contentList.sortRenderer.dateDescLabel', {
    defaultMessage: 'Newest first',
  }),
};

/** Fields that receive the `A-Z` / `Z-A` treatment by default. */
const TITLE_LIKE_FIELDS = new Set(['title', 'name']);

/** Returns `true` when the field should default to A-Z / Z-A labels. */
const isTitleLikeField = (field: string): boolean => {
  const lower = field.toLowerCase();
  return TITLE_LIKE_FIELDS.has(lower) || lower.endsWith('.title');
};

/** Fields that receive the `Oldest first` / `Newest first` treatment by default. */
const DATE_LIKE_FIELDS = new Set(['updatedat', 'createdat', 'date', 'timestamp']);

/**
 * Returns `true` when the field should default to date-oriented labels.
 *
 * Matches:
 * - Known date fields (case-insensitive): `updatedAt`, `createdAt`, `date`, `timestamp`.
 * - camelCase `*At` convention (case-sensitive): `deletedAt`, `publishedAt`, etc.
 * - Fields ending in `date` (case-insensitive): `startDate`, `endDate`, etc.
 */
const isDateLikeField = (field: string): boolean => {
  const lower = field.toLowerCase();
  if (DATE_LIKE_FIELDS.has(lower) || lower.endsWith('date')) {
    return true;
  }
  // Match camelCase timestamp convention: `updatedAt`, `createdAt`, `deletedAt`, etc.
  // Must end with literal `At` (case-sensitive) and be at least 3 chars to avoid matching "At".
  return field.length > 2 && field.endsWith('At');
};

/**
 * Generates sort options from an array of {@link SortField} configurations.
 *
 * Label resolution follows the same strategy as `TableListView`:
 *
 * 1. Explicit `ascLabel` / `descLabel` on the field (highest priority).
 * 2. Title-like fields (`title`, `name`, `*.title`) default to `A-Z` / `Z-A`.
 * 3. Date-like fields (`updatedAt`, `createdAt`, `*At`, `*date`) default to
 *    `Oldest first` / `Newest first`.
 * 4. Everything else falls back to `"{name} (ascending)"` / `"{name} (descending)"`.
 *
 * Consumers can always override heuristic labels by providing explicit
 * `ascLabel` / `descLabel` on the {@link SortField}.
 *
 * @param fields - Array of sort field configurations.
 * @returns Array of {@link SortItem} options for the sort selector.
 */
const generateOptionsFromFields = (fields: SortField[]): SortItem[] => {
  const options: SortItem[] = [];

  for (const { field, name, ascLabel, descLabel } of fields) {
    options.push({
      label: ascLabel ?? getDefaultLabel(field, name, 'asc'),
      field,
      direction: 'asc',
      append: <EuiIcon type="sortUp" aria-hidden={true} />,
    });

    options.push({
      label: descLabel ?? getDefaultLabel(field, name, 'desc'),
      field,
      direction: 'desc',
      append: <EuiIcon type="sortDown" aria-hidden={true} />,
    });
  }

  return options;
};

/**
 * Generates a default sort label when no explicit label is provided.
 *
 * - Title-like fields (`title`, `name`, `*.title`) → `A-Z` / `Z-A`.
 * - Date-like fields (`updatedAt`, `createdAt`, `*At`, `*date`) → `Oldest first` / `Newest first`.
 * - All other fields → `"{name} (ascending)"` / `"{name} (descending)"`.
 *
 * @param field - The field identifier.
 * @param name - The display name.
 * @param direction - Sort direction.
 * @returns A formatted label string.
 */
const getDefaultLabel = (field: string, name: string, direction: 'asc' | 'desc'): string => {
  if (isTitleLikeField(field)) {
    return direction === 'asc' ? i18nText.nameAsc : i18nText.nameDesc;
  }

  if (isDateLikeField(field)) {
    return direction === 'asc' ? i18nText.dateAsc : i18nText.dateDesc;
  }

  return direction === 'asc'
    ? i18n.translate('contentManagement.contentList.sortRenderer.genericAscLabel', {
        defaultMessage: '{name} (ascending)',
        values: { name },
      })
    : i18n.translate('contentManagement.contentList.sortRenderer.genericDescLabel', {
        defaultMessage: '{name} (descending)',
        values: { name },
      });
};

/**
 * `SortRenderer` component for the toolbar sort dropdown.
 *
 * This is the actual UI component for the sort dropdown.
 * It renders a popover with a selectable list of sort options.
 *
 * @param props - The component props. See {@link SortRendererProps}.
 * @returns A React element containing the sort dropdown.
 */
export const SortRenderer = ({
  'data-test-subj': dataTestSubj = CONTENT_LIST_TEST_SUBJECTS.sortFilter,
}: SortRendererProps) => {
  const { euiTheme } = useEuiTheme();
  const config = useContentListConfig();
  const { field, direction, setSort } = useContentListSort();
  const { isOpen, toggle, close } = useFilterPopover();

  const sortingConfig = getSortingConfig(config.features.sorting);

  const baseOptions = useMemo((): SortItem[] => {
    if (sortingConfig?.fields && sortingConfig.fields.length > 0) {
      return generateOptionsFromFields(sortingConfig.fields);
    }

    if (sortingConfig?.options && sortingConfig.options.length > 0) {
      return sortingConfig.options.map((option) => ({
        label: option.label,
        field: option.field,
        direction: option.direction,
        append: (
          <EuiIcon type={option.direction === 'asc' ? 'sortUp' : 'sortDown'} aria-hidden={true} />
        ),
      }));
    }

    // Default options when no sorting config is provided.
    return generateOptionsFromFields(DEFAULT_SORT_FIELDS);
  }, [sortingConfig]);

  // Derive checked state from provider sort values instead of duplicating in local state.
  const options = useMemo(
    (): SortItem[] =>
      baseOptions.map((option) => ({
        ...option,
        checked: option.field === field && option.direction === direction ? 'on' : undefined,
      })),
    [baseOptions, field, direction]
  );

  const selectedOptionLabel = useMemo(() => {
    return options.find((opt) => opt.checked === 'on')?.label ?? i18nText.headerSort;
  }, [options]);

  const handleSelectChange = useCallback(
    (updatedOptions: SortItem[]) => {
      const selectedOption = updatedOptions.find((opt) => opt.checked === 'on');
      if (selectedOption) {
        setSort(selectedOption.field, selectedOption.direction);
        close();
      }
    },
    [setSort, close]
  );

  return (
    <FilterPopover
      title={i18nText.headerSort}
      buttonLabel={selectedOptionLabel}
      isOpen={isOpen}
      onToggle={toggle}
      onClose={close}
      panelWidth={euiTheme.base * 18}
      data-test-subj={dataTestSubj}
    >
      <EuiSelectable<SortItem>
        singleSelection="always"
        aria-label={i18n.translate('contentManagement.contentList.sortRenderer.ariaLabel', {
          defaultMessage: 'Sorting options',
        })}
        options={options}
        onChange={handleSelectChange}
        data-test-subj={CONTENT_LIST_TEST_SUBJECTS.sortSelectOptions}
      >
        {(list) => list}
      </EuiSelectable>
    </FilterPopover>
  );
};
