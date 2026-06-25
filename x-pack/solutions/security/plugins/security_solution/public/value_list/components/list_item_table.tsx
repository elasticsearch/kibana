/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { EuiBasicTable } from '@elastic/eui';
import React from 'react';
import {
  isValueListItemValueSortable,
  type ListItemSchema,
} from '@kbn/securitysolution-io-ts-list-types';
import { InlineEditListItemValue } from './inline_edit_list_item_value';
import { DeleteListItem } from './delete_list_item';
import { FormattedDate } from '../../common/components/formatted_date';
import { LIST_ITEM_FIELDS } from '../types';
import type { ListItemTableProps, ListItemTableColumns } from '../types';
import {
  COLUMN_VALUE,
  COLUMN_UPDATED_AT,
  COLUMN_UPDATED_BY,
  COLUMN_ACTIONS,
  FAILED_TO_FETCH_LIST_ITEM,
  DELETE_LIST_ITEM,
  DELETE_LIST_ITEM_DESCRIPTION,
  NOT_FOUND_ITEMS,
} from '../translations';

export const ListItemTable = ({
  canWriteIndex,
  items,
  pagination,
  sorting,
  loading,
  onChange,
  isError,
  list,
}: ListItemTableProps) => {
  const columns: ListItemTableColumns = [
    {
      field: LIST_ITEM_FIELDS.value,
      name: COLUMN_VALUE,
      render: (value, item) =>
        canWriteIndex ? <InlineEditListItemValue listItem={item} key={value} /> : value,
      sortable: isValueListItemValueSortable(list.type),
      truncateText: true,
    },
    {
      field: LIST_ITEM_FIELDS.updatedAt,
      name: COLUMN_UPDATED_AT,
      render: (value: ListItemSchema[LIST_ITEM_FIELDS.updatedAt]) => (
        <FormattedDate value={value} fieldName={LIST_ITEM_FIELDS.updatedAt} />
      ),
      width: '25%',
      sortable: true,
    },
    {
      field: LIST_ITEM_FIELDS.updatedBy,
      name: COLUMN_UPDATED_BY,
      width: '15%',
    },
  ];
  if (canWriteIndex) {
    columns.push({
      name: COLUMN_ACTIONS,
      actions: [
        {
          name: DELETE_LIST_ITEM,
          description: DELETE_LIST_ITEM_DESCRIPTION,
          isPrimary: true,
          render: (item: ListItemSchema) => <DeleteListItem id={item.id} value={item.value} />,
        },
      ],
      width: '10%',
    });
  }

  return (
    <EuiBasicTable
      data-test-subj="value-list-items-modal-table"
      items={items}
      columns={columns}
      pagination={pagination}
      sorting={sorting}
      error={isError ? FAILED_TO_FETCH_LIST_ITEM : undefined}
      loading={loading}
      onChange={onChange}
      noItemsMessage={NOT_FOUND_ITEMS}
    />
  );
};
