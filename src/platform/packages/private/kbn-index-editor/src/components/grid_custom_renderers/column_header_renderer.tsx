/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiIcon,
  EuiIconTip,
  useEuiTheme,
  type EuiDataGridColumn,
} from '@elastic/eui';
import type { CustomGridColumnProps } from '@kbn/unified-data-table';
import type { HTMLAttributes } from 'react';
import React, { useState } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import type { IndexUpdateService } from '../../services/index_update_service';
import type { IndexEditorTelemetryService } from '../../telemetry/telemetry_service';
import { AddColumnPopover, COLUMN_INDEX_PROP } from './add_column_popover';
import { isPlaceholderColumn } from '../../utils';

export const getColumnHeaderRenderer = (
  columnName: string,
  columnType: string | undefined,
  columnIndex: number,
  isSavedColumn: boolean,
  isUnsupportedESQLType: boolean,
  isColumnInEditMode: boolean,
  setEditingColumnIndex: (columnIndex: number | null) => void,
  indexUpdateService: IndexUpdateService,
  telemetryService: IndexEditorTelemetryService
): ((props: CustomGridColumnProps) => EuiDataGridColumn) => {
  return ({ column }) => ({
    ...column,
    display: (
      <ColumnHeader
        isColumnInEditMode={isColumnInEditMode}
        setEditingColumnIndex={setEditingColumnIndex}
        isSavedColumn={isSavedColumn}
        initialColumnName={columnName}
        initialColumnType={columnType}
        isUnsupportedESQLType={isUnsupportedESQLType}
        columnIndex={columnIndex}
        telemetryService={telemetryService}
        originalColumnDisplay={column.display}
      />
    ),
    displayHeaderCellProps: { [COLUMN_INDEX_PROP]: columnIndex } as HTMLAttributes<HTMLDivElement>,
    actions: {
      showHide: false,
      showSortAsc: isSavedColumn && !isUnsupportedESQLType,
      showSortDesc: isSavedColumn && !isUnsupportedESQLType,
      showMoveLeft: false,
      showMoveRight: false,
      additional: !isSavedColumn
        ? [
            {
              'data-test-subj': 'indexEditorEditColumnButton',
              label: (
                <FormattedMessage
                  id="indexEditor.flyout.grid.columnHeader.editAction"
                  defaultMessage="Edit field"
                />
              ),
              size: 'xs',
              iconType: 'pencil',
              onClick: () => {
                setEditingColumnIndex(columnIndex);
              },
            },
            {
              'data-test-subj': 'indexEditorDeleteColumnButton',
              label: (
                <FormattedMessage
                  id="indexEditor.flyout.grid.columnHeader.deleteAction"
                  defaultMessage="Delete field and values"
                />
              ),
              size: 'xs',
              iconType: 'trash',
              onClick: () => {
                indexUpdateService.deleteColumn(columnName);
              },
            },
          ]
        : [],
    },
  });
};

interface ColumnHeaderProps {
  isColumnInEditMode: boolean;
  setEditingColumnIndex: (columnIndex: number | null) => void;
  isSavedColumn: boolean;
  isUnsupportedESQLType: boolean;
  initialColumnName: string;
  initialColumnType: string | undefined;
  columnIndex: number;
  telemetryService: IndexEditorTelemetryService;
  originalColumnDisplay: React.ReactNode;
}

const ColumnHeader = ({
  isColumnInEditMode,
  setEditingColumnIndex,
  isSavedColumn,
  isUnsupportedESQLType,
  initialColumnName,
  initialColumnType,
  columnIndex,
  telemetryService,
  originalColumnDisplay,
}: ColumnHeaderProps) => {
  const { euiTheme } = useEuiTheme();
  const [renderKey, setRenderKey] = useState(0);

  const handleClosePopover = () => {
    setEditingColumnIndex(null);
    setRenderKey((prev) => prev + 1);
  };

  const columnLabel = isPlaceholderColumn(initialColumnName) ? (
    <EuiFlexGroup alignItems="center" gutterSize="xs" wrap={false}>
      <EuiIcon type="plus" aria-hidden={true} />
      <FormattedMessage
        id="indexEditor.flyout.grid.columnHeader.add"
        defaultMessage="Add a field…"
      />
    </EuiFlexGroup>
  ) : (
    // The default column header display comming from UnifiedDataTable, the type icon + column name
    <EuiFlexGroup alignItems="center" gutterSize="s" wrap={false} css={{ cursor: 'pointer' }}>
      {isUnsupportedESQLType && (
        <EuiIconTip
          type="warning"
          color="warning"
          size="m"
          content={i18n.translate('indexEditor.columnHeader.unsupportedWarning', {
            defaultMessage: `ES|QL doesn't support the {unsupportedType} data type yet. You can still set fields of this index to this type and save them, but Discover won't display them and they will be hidden from this view if you open it again later.`,
            values: { unsupportedType: initialColumnType },
          })}
          className="fieldWarningTip"
          anchorProps={{
            css: { display: 'flex', marginLeft: euiTheme.size.xxs },
          }}
        />
      )}
      {originalColumnDisplay}
    </EuiFlexGroup>
  );

  if (isSavedColumn) {
    return columnLabel;
  }

  const triggerButton = (
    // This button is keyboard accesible via the column actions menu.
    // eslint-disable-next-line @elastic/eui/accessible-interactive-element
    <EuiButtonEmpty
      data-test-subj="indexEditorColumnNameButton"
      aria-label={i18n.translate('indexEditor.columnHeaderEdit.ariaLabel', {
        defaultMessage: 'Edit field',
      })}
      css={{
        color: euiTheme.colors.textSubdued,
        width: '100%',
        height: euiTheme.size.xl,
      }}
      tabIndex={-1}
      flush="left"
      contentProps={{
        css: {
          justifyContent: 'left',
        },
      }}
      onClick={() => setEditingColumnIndex(columnIndex)}
    >
      {columnLabel}
    </EuiButtonEmpty>
  );

  return (
    <AddColumnPopover
      key={`${renderKey}`}
      isPopoverOpen={isColumnInEditMode}
      closePopover={handleClosePopover}
      initialColumnName={initialColumnName}
      initialColumnType={initialColumnType}
      columnIndex={columnIndex}
      telemetryService={telemetryService}
      triggerButton={triggerButton}
    />
  );
};
