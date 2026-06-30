/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UseEuiTheme } from '@elastic/eui';
import {
  EuiContextMenuPanel,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiText,
  EuiWrappingPopover,
  type IconType,
  EuiListGroup,
  EuiButtonIcon,
  EuiToolTip,
  EuiListGroupItem,
  EuiFlexItem,
  EuiContextMenuItem,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';

import type { SerializableRecord } from '@kbn/utility-types';
import type { NavExtensionPointBaseComponentProps, NavTemplateActionConfig } from '../types';

interface NormalizedRow {
  id: string;
  index: number;
  label: string;
  href: string;
  iconType?: IconType;
}

type MappedRow = Omit<NormalizedRow, 'index'>;

interface ListTemplateSearchConfig {
  enabled: boolean;
  placeholder?: string;
  /** Message shown when no search results are found. */
  noSearchResultsMessage?: string;
}

interface ListTemplateAddItemConfig {
  enabled: boolean;
  onClick: () => void;
}

export type ListTemplateConfig<Data = SerializableRecord> = {
  /** Message shown when the data source emits no rows. */
  emptyMessage?: string;
  /**
   * Optional function to map the data to a normalized row.
   * If provided, the function will be called for each data item and the result will be used to render the list.
   * If not provided, the expectation is that the data is already in the {@link NormalizedRow} row format.
   */
  mapData?: (data: Data) => MappedRow;
  /** Optional section-level actions. */
  actions?: NavTemplateActionConfig<Data>[];
  /** Cap the number of rows rendered to this value. */
  max?: number;
} & (
  | {
      supportAddItem?: never;
      search?: never;
      heading?: string;
    }
  | {
      /** Whether to support the add item button. */
      supportAddItem?: ListTemplateAddItemConfig;
      /** Optional client-side search box. */
      search: ListTemplateSearchConfig;
      /** The heading of the list template. This is required when either supportAddItem or search is provided. */
      heading: string;
    }
);

export type NavListTemplateProps<Data = SerializableRecord> = NavExtensionPointBaseComponentProps<
  Data,
  ListTemplateConfig<Data>
>;

function normalizeRows<Data extends NormalizedRow | SerializableRecord>(
  data: Data[] | undefined,
  config: ListTemplateConfig<Data>
): Map<string, NormalizedRow> {
  if (!Array.isArray(data)) {
    return new Map();
  }

  const { mapData, max } = config;

  return (mapData ? data.map(mapData) : data).reduce(
    (acc, { id, label, href, iconType }, index) => {
      if (!id || !label || !href || (typeof max === 'number' && acc.size >= max)) {
        return acc;
      }

      acc.set(String(id), {
        id: String(id),
        index,
        label: String(label),
        href: String(href),
        iconType: iconType ? (iconType as IconType) : undefined,
      });

      return acc;
    },
    new Map() as Map<string, NormalizedRow>
  );
}

const getListTemplateStyles = ({ euiTheme }: UseEuiTheme) => ({
  get topBarLeftContainer() {
    return css({
      lineHeight: euiTheme.size.xl,
    });
  },
  get headerContainer() {
    return css({
      padding: `0 ${euiTheme.size.s}`,
    });
  },
  get headerTextModifier() {
    return css`
      ${this.topBarLeftContainer}[data-search-text-field-open="true"] & {
        display: none;
      }
    `;
  },
});

/**
 * Renders a list of links from an array data source, with optional client-side
 * search and declarative section actions. Field names are read from config.
 */
export function ListTemplate<Data extends SerializableRecord = SerializableRecord>({
  data,
  config,
  context,
}: NavListTemplateProps<Data>): JSX.Element | null {
  const listConfig = config as ListTemplateConfig<Data>;
  const [query, setQuery] = useState<string>('');
  const [searchTextFieldOpen, setSearchTextFieldOpen] = useState(false);
  const popoverRef = useRef<HTMLButtonElement | null>(null);
  const [popoverRowData, setPopoverRowData] = useState<Data | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const rows = useMemo(() => normalizeRows(data, listConfig), [data, listConfig]);
  const listTemplateStyles = getListTemplateStyles(useEuiTheme());

  const filteredRows = useMemo(() => {
    if (!query) return Array.from(rows.values());
    const normalizedQuery = query.toLowerCase();
    return Array.from(rows.values()).filter((row) =>
      row.label.toLowerCase().includes(normalizedQuery)
    );
  }, [rows, query]);

  const setSearchInputRef = useCallback((node: HTMLInputElement | null) => {
    searchInputRef.current = node;
  }, []);

  useEffect(() => {
    if (!searchTextFieldOpen) {
      setQuery('');
    } else {
      searchInputRef.current?.focus();
    }
  }, [searchTextFieldOpen]);

  const renderRowActionPopover = useCallback(() => {
    return popoverRowData ? (
      <EuiWrappingPopover
        button={popoverRef.current!}
        isOpen={popoverRowData !== null}
        closePopover={() => setPopoverRowData(null)}
        panelPaddingSize="none"
        anchorPosition="upLeft"
        aria-label={i18n.translate(
          'sharedUXPackages.navigationExtensionTemplates.listTemplate.actionButtonAriaLabel',
          {
            defaultMessage: 'Open actions menu',
          }
        )}
      >
        <EuiContextMenuPanel
          items={listConfig?.actions?.map((action) => (
            <EuiContextMenuItem
              key={action.id}
              icon={action.icon}
              onClick={action.onClick.bind(null, context.slotId, popoverRowData)}
              data-test-subj={String(`nav-extension-${context.extensionId}-action-${action.id}`)}
            >
              {action.label}
            </EuiContextMenuItem>
          ))}
        />
      </EuiWrappingPopover>
    ) : null;
  }, [context.extensionId, context.slotId, listConfig?.actions, popoverRowData]);

  return (
    <EuiFlexGroup
      direction="column"
      gutterSize="xs"
      data-test-subj={`nav-extension-${context.slotId}-list-template`}
    >
      {renderRowActionPopover()}
      {listConfig.heading && (
        <EuiFlexItem>
          <EuiFlexGroup alignItems="center" css={listTemplateStyles.headerContainer}>
            <EuiFlexItem
              css={listTemplateStyles.topBarLeftContainer}
              data-search-text-field-open={searchTextFieldOpen}
            >
              <EuiFlexGroup alignItems="center">
                <EuiFlexItem
                  grow={!searchTextFieldOpen}
                  css={listTemplateStyles.headerTextModifier}
                >
                  <EuiText size="xs" color="subdued">
                    <h4>{listConfig.heading}</h4>
                  </EuiText>
                </EuiFlexItem>
                {listConfig.search?.enabled && (
                  <EuiFlexItem grow={searchTextFieldOpen}>
                    {searchTextFieldOpen ? (
                      <EuiFieldSearch
                        placeholder={listConfig.search.placeholder}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        data-test-subj={`nav-extension-${context.slotId}-search`}
                        compressed
                        fullWidth
                        isClearable
                        inputRef={setSearchInputRef}
                        append={
                          <EuiToolTip
                            content={i18n.translate(
                              'sharedUXPackages.navigationExtensionTemplates.listTemplate.clearSearchTooltip',
                              { defaultMessage: 'Close search bar' }
                            )}
                            id={`nav-extension-${context.slotId}-close-search-bar-tooltip`}
                          >
                            <EuiButtonIcon
                              color="text"
                              iconType="cross"
                              onClick={setSearchTextFieldOpen.bind(null, false)}
                              aria-labelledby={`nav-extension-${context.slotId}-close-search-bar-tooltip`}
                            />
                          </EuiToolTip>
                        }
                      />
                    ) : (
                      <EuiToolTip
                        content={i18n.translate(
                          'sharedUXPackages.navigationExtensionTemplates.listTemplate.toggleSearchFieldTooltip',
                          { defaultMessage: 'Toggle search field' }
                        )}
                        id={`nav-extension-${context.slotId}-toggle-search-field-tooltip`}
                      >
                        <EuiButtonIcon
                          color="text"
                          iconType="search"
                          data-test-subj={`nav-extension-${context.slotId}-toggle-search-field-button`}
                          aria-labelledby={`nav-extension-${context.slotId}-toggle-search-field-tooltip`}
                          onClick={setSearchTextFieldOpen.bind(null, true)}
                          disabled={data?.length === 0}
                        />
                      </EuiToolTip>
                    )}
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            </EuiFlexItem>
            {listConfig.supportAddItem?.enabled && (
              <EuiFlexItem grow={false}>
                <EuiToolTip
                  content={i18n.translate(
                    'sharedUXPackages.navigationExtensionTemplates.listTemplate.addItemButtonTooltip',
                    { defaultMessage: 'Add item' }
                  )}
                  id={`nav-extension-${context.slotId}-add-item-tooltip`}
                >
                  <EuiButtonIcon
                    color="text"
                    iconType="plus"
                    aria-labelledby={`nav-extension-${context.slotId}-add-item-tooltip`}
                    onClick={listConfig.supportAddItem.onClick}
                    data-test-subj={`nav-extension-${context.slotId}-add-item-button`}
                  />
                </EuiToolTip>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
      )}
      <EuiFlexItem>
        <EuiFlexGroup direction="column" gutterSize="s">
          <EuiListGroup maxWidth={false}>
            {rows.size ? (
              <>
                {filteredRows.length === 0 ? (
                  <EuiListGroupItem
                    data-test-subj={`nav-extension-${context.slotId}-no-results`}
                    label={
                      listConfig.search?.noSearchResultsMessage ??
                      i18n.translate(
                        'sharedUXPackages.navigationExtensionTemplates.listTemplate.noSearchResultsMessage',
                        { defaultMessage: 'No search results found' }
                      )
                    }
                  />
                ) : (
                  filteredRows.map((row) => (
                    <EuiListGroupItem
                      key={row.id}
                      label={row.label}
                      href={row.href}
                      iconType={row.iconType}
                      extraAction={
                        (listConfig?.actions?.length ?? 0) > 0
                          ? {
                              iconType: 'boxesVertical',
                              onClick: (evt) => {
                                evt.preventDefault();
                                popoverRef.current = evt.currentTarget;
                                setPopoverRowData(data[row.index]);
                              },
                              ['data-test-subj']: `nav-extension-${context.slotId}-action-menu-${row.id}`,
                              ['aria-label']: i18n.translate(
                                'sharedUXPackages.navigationExtensionTemplates.listTemplate.actionButtonAriaLabel',
                                {
                                  defaultMessage: 'Open actions menu',
                                }
                              ),
                            }
                          : undefined
                      }
                    />
                  ))
                )}
              </>
            ) : (
              <EuiListGroupItem
                data-test-subj={`nav-extension-${context.slotId}-empty`}
                label={
                  listConfig?.emptyMessage ??
                  i18n.translate(
                    'sharedUXPackages.navigationExtensionTemplates.listTemplate.emptyMessage',
                    { defaultMessage: 'No items found' }
                  )
                }
              />
            )}
          </EuiListGroup>
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}
