/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { createColumn, type ContentListItem } from '@kbn/content-list';
import { getCustomColumn } from '@kbn/visualization-listing-components';
import type { VisualizationListItem } from '@kbn/visualization-listing-components';

const typeColumn = getCustomColumn();

/**
 * The visualize listing's **Type** column: a type icon plus `typeTitle`, with
 * the beta/experimental badge and error tooltip the legacy listing rendered.
 * The cell content comes from `getCustomColumn` (shared, framework-agnostic);
 * `createColumn` wraps it as a placeable Content List column.
 */
export const VisualizeTypeColumn = createColumn({
  id: 'typeTitle',
  field: 'typeTitle',
  name: typeColumn.name,
  sortable: true,
  width: '11em',
  truncateText: true,
  render: (item: ContentListItem) => (
    <>{typeColumn.render('typeTitle', item as VisualizationListItem)}</>
  ),
});
