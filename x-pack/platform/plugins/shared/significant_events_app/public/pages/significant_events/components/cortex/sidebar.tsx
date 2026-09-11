/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiAccordion,
  EuiButtonGroup,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiListGroup,
  EuiListGroupItem,
  EuiText,
} from '@elastic/eui';
import { css } from '@emotion/css';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { getCortexEntityTypeLabel, getCortexStatusFilterLabel } from './entity_type_labels';
import {
  CORTEX_ENTITY_TYPES,
  CORTEX_PAGE_STATUSES,
  type CortexEntityType,
  type CortexPageSummary,
  type CortexStatusFilter,
} from './types';

export type CortexSidebarSelection =
  | { kind: 'home' }
  | { kind: 'activity' }
  | { kind: 'page'; id: string };

interface CortexSidebarProps {
  pages: CortexPageSummary[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: CortexStatusFilter;
  onStatusFilterChange: (value: CortexStatusFilter) => void;
  selection: CortexSidebarSelection;
  onSelect: (selection: CortexSidebarSelection) => void;
}

const matchesSearch = (page: CortexPageSummary, query: string): boolean => {
  if (query.length === 0) {
    return true;
  }
  const haystack = `${page.title} ${page.description ?? ''}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
};

export function CortexSidebar({
  pages,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  selection,
  onSelect,
}: CortexSidebarProps) {
  const visiblePages = useMemo(
    () =>
      pages.filter((page) => {
        if (statusFilter !== 'all' && page.status !== statusFilter) {
          return false;
        }
        return matchesSearch(page, searchQuery);
      }),
    [pages, searchQuery, statusFilter]
  );

  const pagesByType = useMemo(() => {
    const grouped = new Map<CortexEntityType, CortexPageSummary[]>();
    for (const entityType of CORTEX_ENTITY_TYPES) {
      const typePages = visiblePages.filter((page) => page.entity_type === entityType);
      if (typePages.length > 0) {
        grouped.set(entityType, typePages);
      }
    }
    return grouped;
  }, [visiblePages]);

  const statusFilters: CortexStatusFilter[] = pages.some((page) => page.status === 'archived')
    ? ['all', ...CORTEX_PAGE_STATUSES]
    : ['all', 'established', 'tentative'];

  return (
    <EuiFlexGroup
      direction="column"
      gutterSize="m"
      className={css`
        height: 100%;
        min-height: 0;
      `}
    >
      <EuiFlexItem grow={false}>
        <EuiFieldSearch
          compressed
          incremental
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={i18n.translate('xpack.significantEventsApp.cortex.searchPlaceholder', {
            defaultMessage: 'Search pages',
          })}
          aria-label={i18n.translate('xpack.significantEventsApp.cortex.searchAriaLabel', {
            defaultMessage: 'Search Cortex pages',
          })}
          data-test-subj="nightshiftCortexSearch"
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiButtonGroup
          legend={i18n.translate('xpack.significantEventsApp.cortex.statusFilterLegend', {
            defaultMessage: 'Page status',
          })}
          type="single"
          buttonSize="compressed"
          isFullWidth
          options={statusFilters.map((filter) => ({
            id: filter,
            label: getCortexStatusFilterLabel(filter),
            'data-test-subj': `nightshiftCortexStatusFilter-${filter}`,
          }))}
          idSelected={statusFilter}
          onChange={(id) => onStatusFilterChange(id as CortexStatusFilter)}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiListGroup maxWidth={false}>
          <EuiListGroupItem
            iconType="home"
            label={
              <FormattedMessage
                id="xpack.significantEventsApp.cortex.homeNavLabel"
                defaultMessage="Home"
              />
            }
            isActive={selection.kind === 'home'}
            onClick={() => onSelect({ kind: 'home' })}
            data-test-subj="nightshiftCortexHomeNav"
          />
          <EuiListGroupItem
            iconType="clock"
            label={
              <FormattedMessage
                id="xpack.significantEventsApp.cortex.activityNavLabel"
                defaultMessage="Activity"
              />
            }
            isActive={selection.kind === 'activity'}
            onClick={() => onSelect({ kind: 'activity' })}
            data-test-subj="nightshiftCortexActivityNav"
          />
        </EuiListGroup>
      </EuiFlexItem>
      <EuiFlexItem
        className={css`
          overflow-y: auto;
          min-height: 0;
        `}
      >
        {pagesByType.size === 0 ? (
          <EuiText size="xs" color="subdued">
            <FormattedMessage
              id="xpack.significantEventsApp.cortex.emptyTypeDescription"
              defaultMessage="No pages yet."
            />
          </EuiText>
        ) : (
          [...pagesByType.entries()].map(([entityType, typePages]) => (
            <EuiAccordion
              key={entityType}
              id={`nightshift-cortex-${entityType}`}
              initialIsOpen={true}
              buttonContent={
                <EuiFlexGroup gutterSize="s" alignItems="center" justifyContent="spaceBetween">
                  <EuiFlexItem>
                    <EuiText size="xs">
                      <strong>{getCortexEntityTypeLabel(entityType)}</strong>
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs" color="subdued">
                      {typePages.length}
                    </EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              }
              paddingSize="s"
            >
              <EuiListGroup
                maxWidth={false}
                className={css`
                  .euiListGroupItem__label {
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                  }
                `}
              >
                {typePages.map((page) => (
                  <EuiListGroupItem
                    key={page.id}
                    label={page.title}
                    isActive={selection.kind === 'page' && selection.id === page.id}
                    onClick={() => onSelect({ kind: 'page', id: page.id })}
                    data-test-subj={`nightshiftCortexPageLink-${page.id}`}
                  />
                ))}
              </EuiListGroup>
            </EuiAccordion>
          ))
        )}
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}
