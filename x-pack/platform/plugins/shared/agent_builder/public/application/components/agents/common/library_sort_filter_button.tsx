/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiButtonIcon,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiNotificationBadge,
  EuiPopover,
  EuiPopoverTitle,
  EuiText,
  EuiToolTip,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { css } from '@emotion/react';
import { AGENT_BUILDER_UI_EBT } from '@kbn/agent-builder-common';
import { getEbtProps } from '@kbn/ebt-click';
import type { FilterCounts, FilterMode, SortOrder } from './use_library_sort_filter';

const POPOVER_WIDTH = 250;

const labels = {
  buttonAriaLabel: i18n.translate('xpack.agentBuilder.libraryPanel.sortFilterButton.ariaLabel', {
    defaultMessage: 'Sort and filter',
  }),
  sortSectionTitle: i18n.translate('xpack.agentBuilder.libraryPanel.sortFilterButton.sortTitle', {
    defaultMessage: 'Sort',
  }),
  sortAscLabel: i18n.translate('xpack.agentBuilder.libraryPanel.sortFilterButton.sortAsc', {
    defaultMessage: 'Name: A → Z',
  }),
  sortDescLabel: i18n.translate('xpack.agentBuilder.libraryPanel.sortFilterButton.sortDesc', {
    defaultMessage: 'Name: Z → A',
  }),
  filterSectionTitle: i18n.translate(
    'xpack.agentBuilder.libraryPanel.sortFilterButton.filterTitle',
    { defaultMessage: 'Filter' }
  ),
  filterAllLabel: i18n.translate('xpack.agentBuilder.libraryPanel.sortFilterButton.filterAll', {
    defaultMessage: 'All',
  }),
  filterActiveLabel: i18n.translate(
    'xpack.agentBuilder.libraryPanel.sortFilterButton.filterActive',
    { defaultMessage: 'Assigned to this agent' }
  ),
  filterElasticLabel: i18n.translate(
    'xpack.agentBuilder.libraryPanel.sortFilterButton.filterElastic',
    { defaultMessage: 'By Elastic' }
  ),
  filterCustomLabel: i18n.translate(
    'xpack.agentBuilder.libraryPanel.sortFilterButton.filterCustom',
    { defaultMessage: 'Custom' }
  ),
};

interface LibrarySortFilterButtonProps {
  sortOrder: SortOrder;
  onSortChange: (order: SortOrder) => void;
  filterMode: FilterMode;
  onFilterChange: (mode: FilterMode) => void;
  filterCounts: FilterCounts;
  ebtEntityType?: string;
}

export const LibrarySortFilterButton: React.FC<LibrarySortFilterButtonProps> = ({
  sortOrder,
  onSortChange,
  filterMode,
  onFilterChange,
  filterCounts,
  ebtEntityType,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const sortTitleId = useGeneratedHtmlId();
  const { euiTheme } = useEuiTheme();

  const SectionTitle = ({ id, title }: { id?: string; title: string }) => (
    <EuiText
      id={id}
      size="xs"
      css={css`
        padding: ${euiTheme.size.m};
        font-weight: ${euiTheme.font.weight.semiBold};
      `}
    >
      {title}
    </EuiText>
  );

  return (
    <EuiPopover
      panelPaddingSize="none"
      panelStyle={{ width: POPOVER_WIDTH }}
      anchorPosition="downRight"
      aria-labelledby={sortTitleId}
      button={
        <EuiToolTip content={labels.buttonAriaLabel} disableScreenReaderOutput>
          <EuiButtonIcon
            display="base"
            iconType="filter"
            aria-label={labels.buttonAriaLabel}
            color="text"
            size="m"
            onClick={() => setIsOpen((o) => !o)}
            {...getEbtProps({
              element: AGENT_BUILDER_UI_EBT.element.flyout,
              action: AGENT_BUILDER_UI_EBT.action.libraryPanel.SORT_FILTER_OPEN,
              detail: ebtEntityType ?? '',
            })}
          />
        </EuiToolTip>
      }
      isOpen={isOpen}
      closePopover={() => setIsOpen(false)}
    >
      <EuiPopoverTitle paddingSize="none">
        <SectionTitle id={sortTitleId} title={labels.sortSectionTitle} />
      </EuiPopoverTitle>
      <EuiContextMenuPanel
        items={[
          <EuiContextMenuItem
            key="sort-asc"
            icon={sortOrder === 'asc' ? 'check' : 'empty'}
            onClick={() => onSortChange('asc')}
            {...getEbtProps({
              element: AGENT_BUILDER_UI_EBT.element.flyout,
              action: AGENT_BUILDER_UI_EBT.action.libraryPanel.SORT_ASC,
              detail: ebtEntityType ?? '',
            })}
          >
            {labels.sortAscLabel}
          </EuiContextMenuItem>,
          <EuiContextMenuItem
            key="sort-desc"
            icon={sortOrder === 'desc' ? 'check' : 'empty'}
            onClick={() => onSortChange('desc')}
            {...getEbtProps({
              element: AGENT_BUILDER_UI_EBT.element.flyout,
              action: AGENT_BUILDER_UI_EBT.action.libraryPanel.SORT_DESC,
              detail: ebtEntityType ?? '',
            })}
          >
            {labels.sortDescLabel}
          </EuiContextMenuItem>,
        ]}
      />
      <EuiHorizontalRule margin="none" />
      <SectionTitle title={labels.filterSectionTitle} />
      <EuiHorizontalRule margin="none" />
      <EuiContextMenuPanel
        items={[
          <EuiContextMenuItem
            key="filter-all"
            icon={filterMode === 'all' ? 'check' : 'empty'}
            onClick={() => onFilterChange('all')}
            {...getEbtProps({
              element: AGENT_BUILDER_UI_EBT.element.flyout,
              action: AGENT_BUILDER_UI_EBT.action.libraryPanel.FILTER_ALL,
              detail: ebtEntityType ?? '',
            })}
          >
            <EuiFlexGroup justifyContent="spaceBetween" gutterSize="s" responsive={false}>
              <EuiFlexItem grow={false}>{labels.filterAllLabel}</EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiNotificationBadge color="subdued">{filterCounts.all}</EuiNotificationBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiContextMenuItem>,
          <EuiContextMenuItem
            key="filter-active"
            icon={filterMode === 'active' ? 'check' : 'empty'}
            onClick={() => onFilterChange('active')}
            {...getEbtProps({
              element: AGENT_BUILDER_UI_EBT.element.flyout,
              action: AGENT_BUILDER_UI_EBT.action.libraryPanel.FILTER_ACTIVE,
              detail: ebtEntityType ?? '',
            })}
          >
            <EuiFlexGroup justifyContent="spaceBetween" gutterSize="s" responsive={false}>
              <EuiFlexItem grow={false}>{labels.filterActiveLabel}</EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiNotificationBadge color="subdued">{filterCounts.active}</EuiNotificationBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiContextMenuItem>,
          <EuiContextMenuItem
            key="filter-elastic"
            icon={filterMode === 'elastic' ? 'check' : 'empty'}
            onClick={() => onFilterChange('elastic')}
            {...getEbtProps({
              element: AGENT_BUILDER_UI_EBT.element.flyout,
              action: AGENT_BUILDER_UI_EBT.action.libraryPanel.FILTER_ELASTIC,
              detail: ebtEntityType ?? '',
            })}
          >
            <EuiFlexGroup justifyContent="spaceBetween" gutterSize="s" responsive={false}>
              <EuiFlexItem grow={false}>{labels.filterElasticLabel}</EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiNotificationBadge color="subdued">{filterCounts.elastic}</EuiNotificationBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiContextMenuItem>,
          <EuiContextMenuItem
            key="filter-custom"
            icon={filterMode === 'custom' ? 'check' : 'empty'}
            onClick={() => onFilterChange('custom')}
            {...getEbtProps({
              element: AGENT_BUILDER_UI_EBT.element.flyout,
              action: AGENT_BUILDER_UI_EBT.action.libraryPanel.FILTER_CUSTOM,
              detail: ebtEntityType ?? '',
            })}
          >
            <EuiFlexGroup justifyContent="spaceBetween" gutterSize="s" responsive={false}>
              <EuiFlexItem grow={false}>{labels.filterCustomLabel}</EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiNotificationBadge color="subdued">{filterCounts.custom}</EuiNotificationBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiContextMenuItem>,
        ]}
      />
    </EuiPopover>
  );
};
