/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useMemo, useCallback } from 'react';
import {
  EuiPopoverFooter,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiText,
  EuiTextColor,
  EuiBadge,
  Query,
} from '@elastic/eui';
import { isMac } from '@kbn/shared-ux-utility';
import { i18n } from '@kbn/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Platform detection for modifier keys.
// ─────────────────────────────────────────────────────────────────────────────

const modifierKeyPrefix = isMac ? '⌘' : '^';

/**
 * Checks if the exclude modifier key is pressed (Cmd on Mac, Ctrl on Windows/Linux).
 *
 * @param e - An event object containing `metaKey` and `ctrlKey` properties.
 * @returns `true` if the exclude modifier is pressed.
 */
export const isExcludeModifier = (e: { metaKey: boolean; ctrlKey: boolean }): boolean => {
  return (isMac && e.metaKey) || (!isMac && e.ctrlKey);
};

/**
 * Checks if the match-all modifier key (Shift) is pressed.
 *
 * @param e - An event object containing a `shiftKey` property.
 * @returns `true` if Shift is pressed.
 */
export const isMatchAllModifier = (e: { shiftKey: boolean }): boolean => e.shiftKey;

// ─────────────────────────────────────────────────────────────────────────────
// Filter types and utilities.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The boolean mode applied to a single filter value:
 *
 * - `'include'` — match-any (OR), written as an OR-group clause (`tag:(a or b)`).
 * - `'includeAll'` — match-all (AND), written as a bare scalar clause (`tag:a`).
 * - `'exclude'` — negated, written as a negated OR-group (`-tag:(a)`).
 */
export type FilterType = 'include' | 'includeAll' | 'exclude';
export type FilterSelection = Record<string, FilterType>;

/**
 * Converts a value to an array (handles single values and arrays).
 */
const toArray = (item: unknown): unknown[] => (Array.isArray(item) ? item : [item]);

/**
 * Maps filter state to `EuiSelectable` checked state.
 *
 * Both match modes report `'on'` so the option counts as selected; the visual
 * distinction (check vs. green plus) is drawn by {@link FilterStateIcon}.
 *
 * - `'include'` / `'includeAll'` → `'on'`.
 * - `'exclude'` → `'off'`.
 * - `undefined` → `undefined` (no indicator).
 */
export const getCheckedState = (state: FilterType | null | undefined): 'on' | 'off' | undefined => {
  if (state === 'include' || state === 'includeAll') {
    return 'on';
  }
  if (state === 'exclude') {
    return 'off';
  }
  return undefined;
};

// ─────────────────────────────────────────────────────────────────────────────
// `FilterStateIcon` component.
// Leading status icon rendered per option (the list hides EUI's default icons).
// ─────────────────────────────────────────────────────────────────────────────

const filterStateIconLabels = {
  include: i18n.translate('contentManagement.contentList.filter.includeIconLabel', {
    defaultMessage: 'Included (match any)',
  }),
  includeAll: i18n.translate('contentManagement.contentList.filter.includeAllIconLabel', {
    defaultMessage: 'Required (match all)',
  }),
  exclude: i18n.translate('contentManagement.contentList.filter.excludeIconLabel', {
    defaultMessage: 'Excluded',
  }),
};

/**
 * Leading status icon for a filter option: a check for match-any, a green plus
 * for match-all, a cross for exclude, and an empty spacer when inactive (so
 * rows stay aligned).
 */
export const FilterStateIcon = ({ state }: { state: FilterType | null | undefined }) => {
  if (state === 'includeAll') {
    return (
      <EuiIcon
        type="plusInCircleFilled"
        color="success"
        aria-label={filterStateIconLabels.includeAll}
      />
    );
  }
  if (state === 'include') {
    return <EuiIcon type="check" color="success" aria-label={filterStateIconLabels.include} />;
  }
  if (state === 'exclude') {
    return <EuiIcon type="cross" color="danger" aria-label={filterStateIconLabels.exclude} />;
  }
  return <EuiIcon type="empty" aria-hidden={true} />;
};

// ─────────────────────────────────────────────────────────────────────────────
// `useFieldQueryFilter` hook.
// Generic hook for managing include/exclude filter state via `EuiSearchBar` query.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for the {@link useFieldQueryFilter} hook.
 */
export interface UseFieldQueryFilterOptions {
  /** The field name in the query (e.g., `'tag'`, `'createdBy'`). */
  fieldName: string;
  /** Query object from `EuiSearchBar`. */
  query?: Query;
  /** Callback when filter changes. */
  onChange?: (query: Query) => void;
  /**
   * Single selection mode — only one value can be selected at a time.
   * When `true`, selecting a new value clears any previous selection.
   *
   * @default false
   */
  singleSelection?: boolean;
}

/**
 * Result object returned by the {@link useFieldQueryFilter} hook.
 */
export interface UseFieldQueryFilterResult {
  /** Map of value to {@link FilterType} (`'include'` or `'exclude'`). */
  selection: FilterSelection;
  /** Number of active filters. */
  activeCount: number;
  /** Gets the current state of a value. */
  getState: (value: string) => FilterType | null;
  /** Toggles a value's filter state. */
  toggle: (value: string, targetType: FilterType) => void;
  /** Clears all filters for this field. */
  clearAll: () => void;
}

/**
 * Generic hook for managing include/exclude filter state.
 *
 * Works with `EuiSearchBar`'s `query`/`onChange` pattern to sync filter state
 * with the search query text.
 */
export const useFieldQueryFilter = ({
  fieldName,
  query,
  onChange,
  singleSelection = false,
}: UseFieldQueryFilterOptions): UseFieldQueryFilterResult => {
  const parsedQuery = query ?? null;

  const selection = useMemo((): FilterSelection => {
    if (!parsedQuery) {
      return {};
    }

    const result: FilterSelection = {};

    // OR-group clauses (`field:(A or B)`) are match-any/exclude — the format the
    // popover writes for plain and Cmd/Ctrl clicks.
    const includeOrClause = parsedQuery.ast.getOrFieldClause(fieldName, undefined, true, 'eq');
    if (includeOrClause) {
      toArray(includeOrClause.value).forEach((v) => {
        result[String(v)] = 'include';
      });
    }

    const excludeOrClause = parsedQuery.ast.getOrFieldClause(fieldName, undefined, false, 'eq');
    if (excludeOrClause) {
      toArray(excludeOrClause.value).forEach((v) => {
        result[String(v)] = 'exclude';
      });
    }

    // Bare scalar clauses (`field:value`) are match-all (written by Shift+click,
    // or typed manually); negated scalars are exclude. OR-groups above win when
    // the same value appears in both forms.
    const simpleClauses = parsedQuery.ast.getFieldClauses(fieldName);
    if (simpleClauses) {
      simpleClauses.forEach((clause) => {
        if (Array.isArray(clause.value)) {
          return;
        }
        const type: FilterType = clause.match === 'must' ? 'includeAll' : 'exclude';
        const key = String(clause.value);
        if (!result[key]) {
          result[key] = type;
        }
      });
    }

    return result;
  }, [parsedQuery, fieldName]);

  const getState = useCallback(
    (value: string): FilterType | null => selection[value] ?? null,
    [selection]
  );

  const toggle = useCallback(
    (value: string, targetType: FilterType) => {
      // Use existing parsed query or create empty one.
      let q = parsedQuery ?? Query.parse('');
      const currentState = getState(value);

      // In single selection mode, clear all existing selections first.
      if (singleSelection) {
        // Remove both OR-field and simple field clauses so no stale values remain.
        q = q.removeOrFieldClauses(fieldName).removeSimpleFieldClauses(fieldName);
        // If clicking the already-selected value, just clear it (toggle off).
        if (currentState === targetType) {
          onChange?.(q);
          return;
        }
      } else {
        // Multi-select: remove the current value if it's already set.
        // Chain both removal methods to handle values written by the UI (OR-field)
        // and values typed manually by the user (simple field clause).
        if (currentState) {
          q = q.removeOrFieldValue(fieldName, value).removeSimpleFieldValue(fieldName, value);
        }
      }

      if (currentState !== targetType) {
        // Match-all is a bare scalar clause (`field:value`); match-any and
        // exclude are OR-group clauses (`field:(value)` / `-field:(value)`).
        q =
          targetType === 'includeAll'
            ? q.addSimpleFieldValue(fieldName, value, true, 'eq')
            : q.addOrFieldValue(fieldName, value, targetType === 'include', 'eq');
      }

      onChange?.(q);
    },
    [parsedQuery, getState, fieldName, onChange, singleSelection]
  );

  const clearAll = useCallback(() => {
    if (!parsedQuery) {
      return;
    }
    // Remove both OR-field clauses and simple field clauses (e.g. `field:value` typed manually).
    onChange?.(parsedQuery.removeOrFieldClauses(fieldName).removeSimpleFieldClauses(fieldName));
  }, [parsedQuery, fieldName, onChange]);

  return {
    selection,
    activeCount: Object.keys(selection).length,
    getState,
    toggle,
    clearAll,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// `ModifierKeyTip` component.
// Footer component showing the keyboard shortcut for exclude.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Props for the {@link ModifierKeyTip} component.
 */
export interface ModifierKeyTipProps {
  /** Whether to show the Shift = match all hint. @default true */
  showMatchAll?: boolean;
  /** Optional additional content to display below the tip. */
  children?: React.ReactNode;
}

/**
 * Footer component that displays the modifier-key shortcuts: Cmd/Ctrl+click to
 * exclude and (when {@link ModifierKeyTipProps.showMatchAll} is set) Shift+click
 * to require a value (match all).
 */
export const ModifierKeyTip = ({ showMatchAll = true, children }: ModifierKeyTipProps) => {
  return (
    <EuiPopoverFooter paddingSize="m">
      <EuiFlexGroup direction="column" alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem>
          <EuiText size="xs">
            <EuiTextColor color="subdued">
              {i18n.translate('contentManagement.contentList.filter.modifierKeyHelpText', {
                defaultMessage: '{modifierKeyPrefix} + click exclude',
                values: { modifierKeyPrefix },
              })}
            </EuiTextColor>
          </EuiText>
        </EuiFlexItem>
        {showMatchAll && (
          <EuiFlexItem>
            <EuiText size="xs">
              <EuiTextColor color="subdued">
                {i18n.translate('contentManagement.contentList.filter.matchAllKeyHelpText', {
                  defaultMessage: '⇧ + click match all',
                })}
              </EuiTextColor>
            </EuiText>
          </EuiFlexItem>
        )}
        {children}
      </EuiFlexGroup>
    </EuiPopoverFooter>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// `FilterCountBadge` component.
// Badge showing item count, changes color when filter is active.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Props for the {@link FilterCountBadge} component.
 */
export interface FilterCountBadgeProps {
  /** Number of items matching this filter option. */
  count: number;
  /** Whether this filter option is currently active (included or excluded). */
  isActive: boolean;
}

/**
 * Badge that displays item counts in filter options.
 * Shows accent color when the filter is active, hollow when inactive.
 */
export const FilterCountBadge = ({ count, isActive }: FilterCountBadgeProps) => {
  return <EuiBadge color={isActive ? 'accent' : 'hollow'}>{count}</EuiBadge>;
};
