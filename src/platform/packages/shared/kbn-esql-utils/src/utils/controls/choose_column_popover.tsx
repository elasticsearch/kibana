/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useState } from 'react';
import type { EuiSelectableOption } from '@elastic/eui';
import { EuiButtonEmpty, EuiPopover, EuiSelectable } from '@elastic/eui';
import type { ESQLColumn } from '@kbn/es-types';
import { i18n } from '@kbn/i18n';

const SELECT_COLUMN_LABEL = i18n.translate('esqlUtils.valuesPreview.selectAColumnText', {
  defaultMessage: 'Select a column',
});

export function ChooseColumnPopover({
  columns,
  updateQuery,
}: {
  columns: ESQLColumn[];
  updateQuery: (column: string) => void;
}) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [options, setOptions] = useState<EuiSelectableOption[]>(
    columns.map((column) => ({ label: column.name }))
  );

  const onColumnChange = useCallback(
    (newOptions: EuiSelectableOption[]) => {
      setOptions(newOptions);
      const selectedColumn = newOptions.find((option) => option.checked === 'on');
      if (selectedColumn) {
        updateQuery(selectedColumn.label);
      }
    },
    [updateQuery]
  );

  const button = (
    <EuiButtonEmpty
      style={{ verticalAlign: 'top' }}
      onClick={() => setIsPopoverOpen((status) => !status)}
      data-test-subj="chooseColumnBtn"
    >
      {SELECT_COLUMN_LABEL}
    </EuiButtonEmpty>
  );

  return (
    <EuiPopover
      aria-label={i18n.translate('esqlUtils.valuesPreview.columnsListLabel', {
        defaultMessage: 'Columns',
      })}
      button={button}
      isOpen={isPopoverOpen}
      closePopover={() => setIsPopoverOpen(false)}
    >
      <EuiSelectable
        aria-label={SELECT_COLUMN_LABEL}
        searchable
        searchProps={{ 'data-test-subj': 'selectableColumnSearch' }}
        listProps={{ 'data-test-subj': 'selectableColumnList' }}
        singleSelection="always"
        options={options}
        onChange={onColumnChange}
        data-test-subj="selectableColumnContainer"
      >
        {(list, search) => (
          <>
            {search}
            {list}
          </>
        )}
      </EuiSelectable>
    </EuiPopover>
  );
}
