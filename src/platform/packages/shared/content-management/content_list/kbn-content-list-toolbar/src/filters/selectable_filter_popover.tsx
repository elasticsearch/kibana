/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useMemo, useRef } from 'react';
import {
  EuiSelectable,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiPanel,
  type Query,
} from '@elastic/eui';
import { useFilterPopover, FilterPopover } from './filter_popover';
import { FilterPopoverHeader } from './filter_popover_header';
import {
  useFieldQueryFilter,
  isExcludeModifier,
  isMatchAllModifier,
  getCheckedState,
  ModifierKeyTip,
  FilterCountBadge,
  FilterStateIcon,
  type FilterType,
} from './filter_utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for a selectable filter option.
 */
export interface SelectableFilterOption<T extends object = Record<string, unknown>> {
  /** Unique key for the option. */
  key: string;
  /** Display label. */
  label: string;
  /** Value to store in the query (defaults to `key` if not provided). */
  value?: string;
  /** Item count for this option. */
  count?: number;
  /** Custom data associated with this option. */
  data?: T;
}

/**
 * Props for the {@link SelectableFilterPopover} component.
 */
export interface SelectableFilterPopoverProps<T extends object = Record<string, unknown>> {
  /** Field name in the query (e.g., `'tag'`, `'createdBy'`). */
  fieldName: string;
  /** Title displayed in the popover header and button. */
  title: string;
  /** Query object from `EuiSearchBar`. */
  query?: Query;
  /** Callback when filter changes. */
  onChange?: (query: Query) => void;
  /** Options to display. See {@link SelectableFilterOption}. */
  options: Array<SelectableFilterOption<T>>;
  /** Render function for option content. */
  renderOption: (
    option: SelectableFilterOption<T>,
    state: {
      checked: 'on' | 'off' | undefined;
      isActive: boolean;
      /** The value's filter mode, or `undefined` when inactive. */
      state: FilterType | undefined;
    }
  ) => React.ReactNode;
  /**
   * Single selection mode — only one value can be selected at a time.
   * Also hides the modifier key tip since exclude is not supported.
   *
   * @default false
   */
  singleSelection?: boolean;
  /**
   * Allow Shift+click to mark a value as match-all (AND). Disable for fields
   * where match-all is meaningless (e.g. a single-valued `createdBy`).
   *
   * @default true
   */
  allowMatchAll?: boolean;
  /** Whether the options are loading. */
  isLoading?: boolean;
  /** Empty state message to display. */
  emptyMessage?: string;
  /** No matches message to display. */
  noMatchesMessage?: string;
  /** Width of the popover panel. */
  panelWidth?: number;
  /** Minimum width of the popover panel. */
  panelMinWidth?: number;
  /** Optional footer content (rendered below {@link ModifierKeyTip}). */
  footerContent?: React.ReactNode;
  /** Optional header content rendered above the selectable list (e.g. a search input). */
  headerContent?: React.ReactNode;
  /** Called when the popover opens or closes. */
  onToggle?: (isOpen: boolean) => void;
  /** `data-test-subj` attribute for testing. */
  'data-test-subj'?: string;
}

/**
 * Internal interface for selectable options used within the popover.
 */
interface InternalSelectableOption<T extends object> {
  key: string;
  label: string;
  value: string;
  checked?: 'on' | 'off' | undefined;
  data?: T;
  count: number;
  view: React.ReactNode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `SelectableFilterPopover` component.
 *
 * A reusable multi-select filter popover with include/exclude support.
 *
 * Provides:
 * - `EuiSelectable` with search.
 * - Include/exclude via modifier key (Cmd/Ctrl + click).
 * - Filter counts with active state badges.
 * - Standard header with selection count and clear button.
 * - Standard footer with modifier key tip.
 *
 * @example
 * ```tsx
 * <SelectableFilterPopover
 *   fieldName="tag"
 *   title="Tags"
 *   query={query}
 *   onChange={onChange}
 *   options={tags.map(tag => ({
 *     key: tag.id,
 *     label: tag.name,
 *     count: tagCounts[tag.name] ?? 0,
 *     data: tag,
 *   }))}
 *   renderOption={(option, { isActive }) => (
 *     <StandardFilterOption count={option.count ?? 0} isActive={isActive}>
 *       <EuiHealth color={option.data.color}>{option.label}</EuiHealth>
 *     </StandardFilterOption>
 *   )}
 * />
 * ```
 */
export const SelectableFilterPopover = <T extends object = Record<string, unknown>>({
  fieldName,
  title,
  query,
  onChange,
  options,
  renderOption,
  singleSelection = false,
  allowMatchAll = true,
  isLoading,
  emptyMessage,
  noMatchesMessage,
  panelWidth,
  panelMinWidth,
  footerContent,
  headerContent,
  onToggle: onToggleProp,
  'data-test-subj': dataTestSubj = 'selectableFilterPopover',
}: SelectableFilterPopoverProps<T>) => {
  const { isOpen, toggle: rawToggle, close: rawClose } = useFilterPopover();

  const toggle = useCallback(() => {
    rawToggle();
    onToggleProp?.(!isOpen);
  }, [rawToggle, onToggleProp, isOpen]);

  const close = useCallback(() => {
    rawClose();
    if (isOpen) {
      onToggleProp?.(false);
    }
  }, [rawClose, onToggleProp, isOpen]);
  const {
    selection,
    toggle: toggleValue,
    clearAll,
  } = useFieldQueryFilter({
    fieldName,
    query,
    onChange,
    singleSelection,
  });

  // Track the modifier key state from the most recent user interaction so
  // `handleSelectChange` can distinguish include / match-all / exclude.
  // Capture-phase handlers fire before `EuiSelectable` processes the event,
  // guaranteeing the ref is set before `onChange` runs.
  const lastModifierRef = useRef<{ exclude: boolean; matchAll: boolean }>({
    exclude: false,
    matchAll: false,
  });
  const handleInteractionCapture = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    lastModifierRef.current = { exclude: isExcludeModifier(e), matchAll: isMatchAllModifier(e) };
  }, []);

  // The badge count is derived from the parsed query (`selection`), so it must
  // be available before `options` resolves — facets are typically fetched
  // lazily on first popover open. Until that happens, show the raw count of
  // active clauses so URL-hydrated filters render immediately on page load.
  // Once `options` is non-empty, drop unresolved or stale clauses (e.g.
  // `tag:NonExistent`) so the badge matches what the popover actually shows.
  const validOptionValues = useMemo(
    () => new Set(options.flatMap((option) => [option.key, option.value ?? option.key])),
    [options]
  );
  const activeCount = useMemo(() => {
    const selectedKeys = Object.keys(selection);
    if (options.length === 0) {
      return selectedKeys.length;
    }
    return selectedKeys.filter((value) => validOptionValues.has(value)).length;
  }, [selection, validOptionValues, options.length]);

  // For a single value, match-all and match-any are identical, so the green
  // plus only carries meaning once a field has 2+ required values. Below that,
  // (or when match-all is disabled) match-all clauses render as a plain include.
  const matchAllCount = useMemo(
    () => Object.values(selection).filter((type) => type === 'includeAll').length,
    [selection]
  );

  // Build selectable options with view rendering.
  const selectableOptions = useMemo((): Array<InternalSelectableOption<T>> => {
    const showMatchAllIcon = allowMatchAll && matchAllCount >= 2;
    return options.map((option) => {
      const queryValue = option.value ?? option.key;
      const selectedValue = selection[queryValue] ? queryValue : option.key;
      const rawState: FilterType | undefined = selection[queryValue] ?? selection[option.key];
      const state: FilterType | undefined =
        rawState === 'includeAll' && !showMatchAllIcon ? 'include' : rawState;
      const checked = getCheckedState(state);
      const isActive = checked !== undefined;
      const count = option.count ?? 0;

      return {
        key: option.key,
        label: option.label,
        value: isActive ? selectedValue : queryValue,
        checked,
        data: option.data,
        count,
        view: renderOption(option, { checked, isActive, state }),
      };
    });
  }, [options, selection, renderOption, allowMatchAll, matchAllCount]);

  // Build a lookup from key → checked state for stable comparison that
  // doesn't rely on index alignment (safe if `EuiSelectable` reorders options).
  const prevCheckedByKey = useMemo(() => {
    const map = new Map<string, 'on' | 'off' | undefined>();
    selectableOptions.forEach((opt) => map.set(opt.key, opt.checked));
    return map;
  }, [selectableOptions]);

  // Handle `EuiSelectable` change — reads modifier key state from
  // `lastModifierRef` to support Cmd/Ctrl+click for exclude.
  const handleSelectChange = useCallback(
    (updatedOptions: Array<InternalSelectableOption<T>>) => {
      const { exclude, matchAll } = lastModifierRef.current;
      let filterType: FilterType = 'include';
      if (!singleSelection) {
        if (exclude) {
          filterType = 'exclude';
        } else if (matchAll && allowMatchAll) {
          filterType = 'includeAll';
        }
      }

      if (singleSelection) {
        const newlyChecked = updatedOptions.find(
          (item) => item.checked === 'on' && prevCheckedByKey.get(item.key) !== 'on'
        );
        if (newlyChecked) {
          toggleValue(newlyChecked.value, filterType);
        } else {
          const unchecked = updatedOptions.find(
            (item) => item.checked !== 'on' && prevCheckedByKey.get(item.key) === 'on'
          );
          if (unchecked) {
            toggleValue(unchecked.value, filterType);
          }
        }
      } else {
        const changed = updatedOptions.find(
          (item) => item.checked !== prevCheckedByKey.get(item.key)
        );
        if (changed) {
          toggleValue(changed.value, filterType);
        }
      }
    },
    [prevCheckedByKey, toggleValue, singleSelection, allowMatchAll]
  );

  // Don't show count badge on button for single-select (only one value can be selected).
  const displayActiveCount = singleSelection ? 0 : activeCount;

  return (
    <FilterPopover
      title={title}
      totalCount={isLoading ? undefined : options.length}
      activeCount={displayActiveCount}
      isOpen={isOpen}
      onToggle={toggle}
      onClose={close}
      panelWidth={panelWidth}
      panelMinWidth={panelMinWidth}
      data-test-subj={dataTestSubj}
    >
      <div
        onMouseDownCapture={handleInteractionCapture}
        onKeyDownCapture={handleInteractionCapture}
      >
        <EuiSelectable<InternalSelectableOption<T>>
          singleSelection={singleSelection}
          options={selectableOptions}
          renderOption={(option) => option.view}
          isLoading={isLoading}
          emptyMessage={emptyMessage}
          noMatchesMessage={noMatchesMessage}
          onChange={handleSelectChange}
          searchable
          searchProps={{ compressed: true }}
          listProps={singleSelection ? undefined : { showIcons: false }}
          data-test-subj={`${dataTestSubj}-list`}
          aria-label={title}
        >
          {(list, search) => (
            <>
              {singleSelection ? (
                <EuiPanel hasShadow={false} paddingSize="s">
                  {search}
                </EuiPanel>
              ) : (
                <FilterPopoverHeader
                  search={search}
                  activeCount={activeCount}
                  onClear={clearAll}
                  data-test-subj={`${dataTestSubj}-clear`}
                />
              )}
              <EuiHorizontalRule margin="none" />
              {headerContent && (
                <EuiPanel hasShadow={false} paddingSize="s" style={{ paddingBottom: 0 }}>
                  {headerContent}
                </EuiPanel>
              )}
              {list}
            </>
          )}
        </EuiSelectable>
      </div>
      {/* Only show modifier key tip for multi-select (exclude not supported in single-select). */}
      {!singleSelection && (
        <ModifierKeyTip showMatchAll={allowMatchAll}>{footerContent}</ModifierKeyTip>
      )}
      {singleSelection && footerContent}
    </FilterPopover>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Standard option renderer with count badge.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Props for the {@link StandardFilterOption} component.
 */
export interface StandardOptionRenderProps {
  /** Primary content (e.g., name with icon/avatar). */
  children: React.ReactNode;
  /** Item count. When `undefined`, the count badge is hidden entirely. */
  count?: number;
  /** Whether the filter is active. */
  isActive: boolean;
  /**
   * The value's filter mode, used to draw the leading status icon (check for
   * match-any, green plus for match-all, cross for exclude). The popover hides
   * EUI's default icons in favor of this.
   */
  state?: FilterType;
}

/**
 * Standard option layout with a leading status icon, content, and optional
 * count badge.
 *
 * Include / match-all / exclude is handled by `SelectableFilterPopover`'s
 * modifier-key tracking — no click handler is needed on individual options.
 */
export const StandardFilterOption = ({
  children,
  count,
  isActive,
  state,
}: StandardOptionRenderProps) => {
  return (
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
      <EuiFlexItem grow={false}>
        <FilterStateIcon state={state} />
      </EuiFlexItem>
      <EuiFlexItem>{children}</EuiFlexItem>
      {count !== undefined && (
        <EuiFlexItem grow={false}>
          <FilterCountBadge count={count} isActive={isActive} />
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};
