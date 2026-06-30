/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { EuiSpacer } from '@elastic/eui';
import type { SeverityLevel, ThreatCategory } from '../../../../common/threat_intelligence/hub';
import { ReportFeedFilterRow } from './report_feed_filter_row';
import { ReportFeedGrid } from './report_feed_grid';
import type { ReportFeedSort } from './constants';
import type { ThreatReportFeedItem } from './types';
import { countCategoriesFromItems, countSeverities, filterAndSortFeedItems } from './utils';

export interface ThreatReportFeedProps {
  items: ThreatReportFeedItem[];
  /** When set (e.g. dashboard `by_category` buckets), chip counts match global scope. */
  categoryCounts?: Map<ThreatCategory, number>;
  highlightReportId?: string;
  showFilterRow?: boolean;
  emptyMessage?: string;
  selectedSeverities: SeverityLevel[];
  selectedCategories: ThreatCategory[];
  onToggleSeverity: (severity: SeverityLevel) => void;
  onToggleCategory: (category: ThreatCategory) => void;
  onClearFilters: () => void;
  sortBy: ReportFeedSort;
  onSortChange: (next: ReportFeedSort) => void;
}

/**
 * Shared severity/category filter row + responsive card grid used by the
 * Intelligence Hub dashboard and Agent Builder digest attachments.
 */
export const ThreatReportFeed: React.FC<ThreatReportFeedProps> = ({
  items,
  categoryCounts: categoryCountsProp,
  highlightReportId,
  showFilterRow = true,
  emptyMessage,
  selectedSeverities,
  selectedCategories,
  onToggleSeverity,
  onToggleCategory,
  onClearFilters,
  sortBy,
  onSortChange,
}) => {
  const severityCounts = useMemo(() => countSeverities(items), [items]);
  const categoryCounts = useMemo(
    () => categoryCountsProp ?? countCategoriesFromItems(items),
    [categoryCountsProp, items]
  );

  const filteredItems = useMemo(
    () =>
      filterAndSortFeedItems({
        items,
        selectedSeverities,
        selectedCategories,
        sortBy,
      }),
    [items, selectedSeverities, selectedCategories, sortBy]
  );

  return (
    <>
      {showFilterRow ? (
        <>
          <ReportFeedFilterRow
            severityCounts={severityCounts}
            categoryCounts={categoryCounts}
            selectedSeverities={selectedSeverities}
            selectedCategories={selectedCategories}
            onToggleSeverity={onToggleSeverity}
            onToggleCategory={onToggleCategory}
            onClear={onClearFilters}
            sortBy={sortBy}
            onSortChange={onSortChange}
            totalShown={filteredItems.length}
            totalAvailable={items.length}
          />
          <EuiSpacer size="m" />
        </>
      ) : null}
      <ReportFeedGrid
        items={filteredItems}
        highlightReportId={highlightReportId}
        emptyMessage={emptyMessage}
      />
    </>
  );
};
