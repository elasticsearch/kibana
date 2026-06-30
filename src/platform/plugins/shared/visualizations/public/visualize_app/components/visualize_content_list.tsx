/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useEffect, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import type { TableListTabParentProps } from '@kbn/content-management-tabbed-table-list-view';
import {
  ContentList,
  ContentListFooter,
  ContentListTable,
  ContentListToolbar,
} from '@kbn/content-list';
import { useContentListConfig } from '@kbn/content-list-provider';
import { getNoItemsMessage } from '@kbn/visualization-listing-components';
import { DashboardFlowCallout } from './dashboard_flow_callout';
import { VisualizeTypeFilter } from './visualize_type_filter';
import { VisualizeTypeColumn } from './visualize_type_column';

const { Column, Action } = ContentListTable;
const { Filters } = ContentListToolbar;

const visualizeLibraryPageTitle = i18n.translate('visualizations.listingPageTitle', {
  defaultMessage: 'Visualize library',
});

export interface VisualizeContentListProps {
  /** Invoked from the empty-state CTA. */
  onCreateNewVis: () => void;
  /**
   * Tags the {@link TabbedTableListView} page wrapper with the landing-page
   * `data-test-subj`. Cross-app FTR/Scout suites navigate this listing via
   * shared page objects keyed on `visualizationLandingPage`, so it must stay
   * stable across the `TableListView` -> Content List migration.
   */
  setPageDataTestSubject: TableListTabParentProps['setPageDataTestSubject'];
}

/**
 * Pure composition layer for the visualize listing tab. Renders the dashboard
 * flow callout, the `<ContentList>` tree, and the seeded sort / filter
 * affordances.
 */
export const VisualizeContentList = ({
  onCreateNewVis,
  setPageDataTestSubject,
}: VisualizeContentListProps) => {
  const { item: itemConfig } = useContentListConfig();
  const onEditItem = itemConfig?.actions?.edit?.onItemAction;

  useEffect(() => {
    setPageDataTestSubject('visualizationLandingPage');
  }, [setPageDataTestSubject]);

  // The page header already renders the canonical `newItemButton`; give the
  // empty-state CTA a distinct subject so both can coexist when the list is empty.
  const emptyState = useMemo(
    () => getNoItemsMessage(onCreateNewVis, 'createVisualizationEmptyPromptButton'),
    [onCreateNewVis]
  );

  return (
    <>
      <DashboardFlowCallout />
      <ContentList emptyState={emptyState}>
        <ContentListToolbar>
          <Filters>
            <Filters.Tags />
            <VisualizeTypeFilter />
            <Filters.Sort />
          </Filters>
        </ContentListToolbar>
        <ContentListTable title={visualizeLibraryPageTitle}>
          <Column.Name showDescription showTags onClick={onEditItem} />
          <VisualizeTypeColumn />
          <Column.UpdatedAt />
          <Column.Actions>
            <Action.ContentEditor />
            <Action.Edit />
            <Action.Delete />
          </Column.Actions>
        </ContentListTable>
        <ContentListFooter />
      </ContentList>
    </>
  );
};
