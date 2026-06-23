/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import {
  ContentList,
  ContentListTable,
  ContentListToolbar,
  ContentListFooter,
} from '@kbn/content-list';
import type { GraphEmptyPromptProps } from './empty_prompt';
import { GraphEmptyPrompt } from './empty_prompt';

const { Column } = ContentListTable;

const tableTitle = i18n.translate('xpack.graph.listing.table.tableTitle', {
  defaultMessage: 'Graphs',
});

/**
 * Props for {@link GraphContentList}.
 *
 * Mirrors {@link GraphEmptyPromptProps} so the listing route forwards
 * `canSave`, `sampleDataUrl`, and `onCreateGraph` straight through.
 */
export type GraphContentListProps = GraphEmptyPromptProps;

/**
 * Visual composition for the graph workspaces list.
 *
 * Renders the toolbar, table, footer, and empty state inside the surrounding
 * `ContentListClientProvider` (configured by the listing route). All data
 * wiring — `findItems`, item actions, labels, and capability flags — lives at
 * the route level so this component stays focused on layout.
 */
export const GraphContentList = (props: GraphContentListProps) => (
  <ContentList emptyState={<GraphEmptyPrompt {...props} />}>
    <ContentListToolbar />
    <ContentListTable title={tableTitle}>
      <Column.Name showDescription />
      <Column.UpdatedAt />
      <Column.Actions />
    </ContentListTable>
    <ContentListFooter />
  </ContentList>
);
