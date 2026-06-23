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
import { css } from '@emotion/react';
import type { ESQLColumn } from '@kbn/es-types';
import { DataControlEditorStrings } from '../data_control_constants';

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

  const onButtonClick = () => setIsPopoverOpen((status) => !status);
  const closePopover = () => setIsPopoverOpen(false);

  const button = (
    <EuiButtonEmpty
      css={css`
        vertical-align: top;
      `}
      onClick={onButtonClick}
      data-test-subj="chooseColumnBtn"
    >
      {DataControlEditorStrings.manageControl.dataSource.valuesPreview.getSelectAColumnText()}
    </EuiButtonEmpty>
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

  return (
    <EuiPopover
      aria-label={DataControlEditorStrings.manageControl.dataSource.valuesPreview.getColumnsListLabel()}
      button={button}
      isOpen={isPopoverOpen}
      closePopover={closePopover}
    >
      <EuiSelectable
        aria-label={DataControlEditorStrings.manageControl.dataSource.valuesPreview.getSelectAColumnText()}
        searchable
        searchProps={{
          'data-test-subj': 'selectableColumnSearch',
        }}
        listProps={{
          'data-test-subj': 'selectableColumnList',
        }}
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
