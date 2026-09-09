/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexItem } from '@elastic/eui';
import type { ColumnSelectorItem } from '../../../../../common/hooks/use_table_column_selector';
import {
  OVERVIEW_TABLE_COLUMNS_STORAGE_KEY,
  useColumnSelectorButton,
} from '../../../../../common/hooks/use_table_column_selector';
import {
  CREATED_COLUMN_LABEL,
  LAST_MODIFIED_COLUMN_LABEL,
} from '../../../../../common/components/monitor_timestamp';
import {
  LATEST_ERROR,
  LOCATIONS,
  MONITOR_HISTORY,
  OVERVIEW_DEFAULT_VISIBLE_COLUMN_IDS,
  OVERVIEW_TABLE_COLUMN_ID,
  TAGS,
} from '../labels';

const OVERVIEW_SELECTOR_COLUMNS: ColumnSelectorItem[] = [
  { id: OVERVIEW_TABLE_COLUMN_ID.locations, name: LOCATIONS },
  { id: OVERVIEW_TABLE_COLUMN_ID.latestError, name: LATEST_ERROR },
  { id: OVERVIEW_TABLE_COLUMN_ID.tags, name: TAGS },
  { id: OVERVIEW_TABLE_COLUMN_ID.history, name: MONITOR_HISTORY },
  { id: OVERVIEW_TABLE_COLUMN_ID.createdAt, name: CREATED_COLUMN_LABEL },
  { id: OVERVIEW_TABLE_COLUMN_ID.updatedAt, name: LAST_MODIFIED_COLUMN_LABEL },
];

export const OverviewTableColumnSelector = () => {
  const ColumnSelector = useColumnSelectorButton({
    columns: OVERVIEW_SELECTOR_COLUMNS,
    defaultVisibleColumnIds: OVERVIEW_DEFAULT_VISIBLE_COLUMN_IDS,
    storageKeyPrefix: OVERVIEW_TABLE_COLUMNS_STORAGE_KEY,
  });

  return (
    <EuiFlexItem grow={false} data-test-subj="syntheticsOverviewTableColumnSelector">
      {ColumnSelector}
    </EuiFlexItem>
  );
};
