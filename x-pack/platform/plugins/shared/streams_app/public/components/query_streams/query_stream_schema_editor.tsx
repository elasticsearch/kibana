/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCallOut,
  EuiContextMenu,
  EuiDataGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiPopover,
  EuiPortal,
  EuiProgress,
  EuiScreenReaderOnly,
  EuiSpacer,
  EuiTextArea,
  EuiTitle,
  EuiToolTip,
  useGeneratedHtmlId,
} from '@elastic/eui';
import type {
  EuiDataGridCellProps,
  EuiDataGridColumnSortingConfig,
  EuiDataGridControlColumn,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { Streams } from '@kbn/streams-schema';
import React, { useCallback, useMemo, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { useAbortableAsync, useBoolean } from '@kbn/react-hooks';
import { getESQLQueryColumns } from '@kbn/esql-utils';
import { useStreamDetail } from '../../hooks/use_stream_detail';
import { useKibana } from '../../hooks/use_kibana';
import type {
  SchemaEditorField,
  SchemaField,
} from '../stream_management/data_management/schema_editor/types';
import { getFormattedError } from '../../util/errors';
import {
  EMPTY_CONTENT,
  FIELD_TYPE_MAP,
  TABLE_COLUMNS,
} from '../stream_management/data_management/schema_editor/constants';
import { FieldType } from '../stream_management/data_management/schema_editor/field_type';
import type { TableColumnName } from '../stream_management/data_management/schema_editor/constants';

interface QueryStreamSchemaEditorProps {
  definition: Streams.QueryStream.GetResponse;
  refreshDefinition: () => void;
}

export const QueryStreamSchemaEditor = ({
  definition,
  refreshDefinition,
}: QueryStreamSchemaEditorProps) => {
  const { loading } = useStreamDetail();
  const { core, dependencies } = useKibana();
  const { notifications } = core;
  const {
    streams: { streamsRepositoryClient },
  } = dependencies.start;

  const [selectedField, setSelectedField] = useState<SchemaEditorField | null>(null);
  const [isFlyoutOpen, { on: openFlyout, off: closeFlyout }] = useBoolean(false);
  const [isSaving, setIsSaving] = useState(false);

  const { fields, isLoadingFields, staleFieldNames } = useQueryStreamSchemaFields({
    definition,
    refreshDefinition,
  });

  const handleFieldUpdate = useCallback(
    async (updatedField: SchemaField) => {
      setIsSaving(true);
      try {
        const currentDescriptions = definition.stream.field_descriptions ?? {};
        const newDescriptions = { ...currentDescriptions };

        const trimmedDescription = updatedField.description?.trim();
        if (trimmedDescription && trimmedDescription.length > 0) {
          newDescriptions[updatedField.name] = trimmedDescription;
        } else {
          delete newDescriptions[updatedField.name];
        }

        await streamsRepositoryClient.fetch('PUT /api/streams/{name}/_query 2023-10-31', {
          signal: null,
          params: {
            path: { name: definition.stream.name },
            body: {
              query: { esql: definition.stream.query.esql },
              field_descriptions: newDescriptions,
            },
          },
        });

        refreshDefinition();
        closeFlyout();
        setSelectedField(null);
        notifications.toasts.addSuccess({
          title: i18n.translate('xpack.streams.queryStreamSchemaEditor.updateSuccess', {
            defaultMessage: 'Field description updated',
          }),
          toastLifeTimeMs: 3000,
        });
      } catch (error) {
        const formattedError = getFormattedError(error);
        notifications.toasts.addDanger({
          title: i18n.translate('xpack.streams.queryStreamSchemaEditor.updateError', {
            defaultMessage: 'Failed to update field description',
          }),
          text: formattedError.message,
          toastLifeTimeMs: 3000,
        });
      } finally {
        setIsSaving(false);
      }
    },
    [
      closeFlyout,
      definition.stream.field_descriptions,
      definition.stream.name,
      definition.stream.query.esql,
      notifications.toasts,
      refreshDefinition,
      streamsRepositoryClient,
    ]
  );

  const handleOpenFlyout = useCallback(
    (field: SchemaEditorField) => {
      setSelectedField(field);
      openFlyout();
    },
    [openFlyout]
  );

  const handleCloseFlyout = useCallback(() => {
    closeFlyout();
    setSelectedField(null);
  }, [closeFlyout]);

  const handleClearDescription = useCallback(
    (field: SchemaEditorField) => {
      handleFieldUpdate({ ...field, description: undefined });
    },
    [handleFieldUpdate]
  );

  return (
    <EuiFlexGroup direction="column" gutterSize="none" css={{ height: '100%' }}>
      <EuiCallOut
        iconType="info"
        title={i18n.translate('xpack.streams.queryStreamSchemaEditor.readonlyMode', {
          defaultMessage:
            'Query stream schema is derived from the ES|QL query output. Field descriptions can be edited.',
        })}
        announceOnMount={false}
        size="s"
      />
      <EuiSpacer size="m" />
      {staleFieldNames.length > 0 && (
        <>
          <EuiCallOut
            iconType="warning"
            color="warning"
            title={i18n.translate('xpack.streams.queryStreamSchemaEditor.staleFieldsWarning', {
              defaultMessage:
                'Some field descriptions reference fields no longer in the query output. Use "Clear description" to remove them.',
            })}
            announceOnMount={false}
            size="s"
          />
          <EuiSpacer size="m" />
        </>
      )}
      <EuiFlexItem grow={1} css={{ minHeight: 0 }}>
        <QueryStreamSchemaTable
          fields={fields}
          isLoading={loading || isLoadingFields}
          onFieldClick={handleOpenFlyout}
          onClearDescription={handleClearDescription}
        />
      </EuiFlexItem>
      {isFlyoutOpen && selectedField && (
        <QueryStreamFieldDescriptionFlyout
          field={selectedField}
          onClose={handleCloseFlyout}
          onSave={handleFieldUpdate}
          isSaving={isSaving}
        />
      )}
    </EuiFlexGroup>
  );
};

interface QueryStreamFieldDescriptionFlyoutProps {
  field: SchemaEditorField;
  onClose: () => void;
  onSave: (field: SchemaField) => void;
  isSaving: boolean;
}

export const QueryStreamFieldDescriptionFlyout = ({
  field,
  onClose,
  onSave,
  isSaving,
}: QueryStreamFieldDescriptionFlyoutProps) => {
  const flyoutId = useGeneratedHtmlId({ prefix: 'query-stream-field-description' });
  const [description, setDescription] = useState(field.description ?? '');

  const hasChanges = description !== (field.description ?? '');

  const handleSave = useCallback(() => {
    onSave({
      ...field,
      description: description.trim() || undefined,
    });
  }, [description, field, onSave]);

  return (
    <EuiFlyout ownFocus onClose={onClose} aria-labelledby={flyoutId} maxWidth={500}>
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2 id={flyoutId}>{field.name}</h2>
        </EuiTitle>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <EuiFlexGroup direction="column" gutterSize="m">
          <EuiFlexGroup>
            <EuiFlexItem grow={1}>
              <EuiTitle size="xxs">
                <span>
                  {i18n.translate('xpack.streams.queryStreamSchemaEditor.fieldType', {
                    defaultMessage: 'Type',
                  })}
                </span>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem grow={2}>
              <FieldType type={field.type ?? 'unmapped'} />
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiFlexGroup alignItems="flexStart">
            <EuiFlexItem grow={1}>
              <EuiTitle size="xxs">
                <span>
                  {i18n.translate('xpack.streams.queryStreamSchemaEditor.fieldDescription', {
                    defaultMessage: 'Description',
                  })}
                </span>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem grow={2}>
              <EuiTextArea
                aria-label={i18n.translate(
                  'xpack.streams.queryStreamSchemaEditor.descriptionAriaLabel',
                  { defaultMessage: 'Field description' }
                )}
                data-test-subj="streamsAppQueryStreamFieldDescriptionTextArea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={i18n.translate(
                  'xpack.streams.queryStreamSchemaEditor.descriptionPlaceholder',
                  { defaultMessage: 'Add a description for this field...' }
                )}
                rows={3}
                fullWidth
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexGroup>
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiButtonEmpty
            data-test-subj="streamsAppQueryStreamFieldCancelButton"
            iconType="cross"
            onClick={onClose}
            flush="left"
          >
            {i18n.translate('xpack.streams.queryStreamSchemaEditor.cancel', {
              defaultMessage: 'Cancel',
            })}
          </EuiButtonEmpty>
          <EuiButton
            data-test-subj="streamsAppQueryStreamFieldSaveButton"
            onClick={handleSave}
            isLoading={isSaving}
            disabled={!hasChanges}
            fill
          >
            {i18n.translate('xpack.streams.queryStreamSchemaEditor.save', {
              defaultMessage: 'Save',
            })}
          </EuiButton>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};

const QUERY_STREAM_COLUMNS: TableColumnName[] = ['name', 'type', 'description'];

interface QueryStreamSchemaTableProps {
  fields: SchemaEditorField[];
  isLoading: boolean;
  onFieldClick: (field: SchemaEditorField) => void;
  onClearDescription: (field: SchemaEditorField) => void;
}

const QueryStreamSchemaTable = ({
  fields,
  isLoading,
  onFieldClick,
  onClearDescription,
}: QueryStreamSchemaTableProps) => {
  const [visibleColumns, setVisibleColumns] = useState<string[]>(QUERY_STREAM_COLUMNS);
  const [sortingColumns, setSortingColumns] = useState<EuiDataGridColumnSortingConfig[]>([]);

  const trailingColumns = useMemo(
    () => [createQueryStreamFieldActionsCellRenderer(fields, onFieldClick, onClearDescription)],
    [fields, onFieldClick, onClearDescription]
  );

  const RenderCellValue = useMemo(() => createQueryStreamCellRenderer(fields), [fields]);

  return (
    <>
      {isLoading && (
        <EuiPortal>
          <EuiProgress size="xs" color="accent" position="fixed" />
        </EuiPortal>
      )}
      <EuiDataGrid
        data-test-subj={
          isLoading
            ? 'streamsAppQueryStreamSchemaTableLoading'
            : 'streamsAppQueryStreamSchemaTableLoaded'
        }
        aria-label={i18n.translate('xpack.streams.queryStreamSchemaEditor.tableAriaLabel', {
          defaultMessage: 'Query stream schema',
        })}
        columns={Object.entries(TABLE_COLUMNS)
          .filter(([columnId]) => QUERY_STREAM_COLUMNS.includes(columnId as TableColumnName))
          .map(([columnId, value]) => ({
            id: columnId,
            ...value,
          }))}
        columnVisibility={{
          visibleColumns,
          setVisibleColumns,
          canDragAndDropColumns: false,
        }}
        sorting={{ columns: sortingColumns, onSort: setSortingColumns }}
        toolbarVisibility={true}
        rowCount={fields.length}
        renderCellValue={RenderCellValue}
        trailingControlColumns={trailingColumns}
        gridStyle={{
          border: 'all',
          rowHover: 'highlight',
          header: 'shade',
        }}
        inMemory={{ level: 'sorting' }}
      />
    </>
  );
};

const createQueryStreamCellRenderer =
  (fields: SchemaEditorField[]): EuiDataGridCellProps['renderCellValue'] =>
  ({ rowIndex, columnId }) => {
    const field = fields[rowIndex];
    if (!field) return null;

    if (columnId === 'name') {
      return <>{field.name}</>;
    }

    if (columnId === 'type') {
      const typeInfo = field.type && FIELD_TYPE_MAP[field.type as keyof typeof FIELD_TYPE_MAP];
      if (typeInfo) {
        return <>{typeInfo.label}</>;
      }
      return <>{field.type ?? EMPTY_CONTENT}</>;
    }

    if (columnId === 'description') {
      if (!field.description) {
        return EMPTY_CONTENT;
      }
      return (
        <div
          css={css`
            width: 100%;
          `}
        >
          <EuiToolTip content={field.description}>
            <div
              tabIndex={0}
              css={css`
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              `}
            >
              {field.description}
            </div>
          </EuiToolTip>
        </div>
      );
    }

    return EMPTY_CONTENT;
  };

const createQueryStreamFieldActionsCellRenderer = (
  fields: SchemaEditorField[],
  onFieldClick: (field: SchemaEditorField) => void,
  onClearDescription: (field: SchemaEditorField) => void
): EuiDataGridControlColumn => ({
  id: 'field-actions',
  width: 40,
  headerCellRender: () => (
    <EuiScreenReaderOnly>
      <span>
        {i18n.translate('xpack.streams.queryStreamSchemaEditor.actionsTitle', {
          defaultMessage: 'Field actions',
        })}
      </span>
    </EuiScreenReaderOnly>
  ),
  rowCellRender: ({ rowIndex }) => {
    const field = fields[rowIndex];
    if (!field) return null;

    return (
      <QueryStreamFieldActionsCell
        field={field}
        onFieldClick={onFieldClick}
        onClearDescription={onClearDescription}
      />
    );
  },
});

interface QueryStreamFieldActionsCellProps {
  field: SchemaEditorField;
  onFieldClick: (field: SchemaEditorField) => void;
  onClearDescription: (field: SchemaEditorField) => void;
}

const QueryStreamFieldActionsCell = ({
  field,
  onFieldClick,
  onClearDescription,
}: QueryStreamFieldActionsCellProps) => {
  const contextMenuPopoverId = useGeneratedHtmlId({
    prefix: 'queryStreamFieldActionsPopover',
  });
  const [popoverIsOpen, { off: closePopover, toggle }] = useBoolean(false);

  const panels = useMemo(() => {
    const actions = [
      {
        name: i18n.translate('xpack.streams.queryStreamSchemaEditor.editFieldAction', {
          defaultMessage: 'Edit field',
        }),
        onClick: () => {
          onFieldClick(field);
          closePopover();
        },
      },
      ...(field.description
        ? [
            {
              name: i18n.translate('xpack.streams.queryStreamSchemaEditor.clearDescriptionAction', {
                defaultMessage: 'Clear description',
              }),
              onClick: () => {
                onClearDescription(field);
                closePopover();
              },
            },
          ]
        : []),
    ];

    return [
      {
        id: 0,
        title: i18n.translate('xpack.streams.queryStreamSchemaEditor.fieldActionsTitle', {
          defaultMessage: 'Field actions',
        }),
        items: actions.map((action) => ({
          name: action.name,
          onClick: action.onClick,
        })),
      },
    ];
  }, [closePopover, field, onClearDescription, onFieldClick]);

  const openActionsMenuLabel = i18n.translate(
    'xpack.streams.queryStreamSchemaEditor.openActionsMenuAriaLabel',
    { defaultMessage: 'Open actions menu' }
  );

  return (
    <EuiPopover
      id={contextMenuPopoverId}
      button={
        <EuiToolTip content={openActionsMenuLabel} disableScreenReaderOutput>
          <EuiButtonIcon
            aria-label={openActionsMenuLabel}
            data-test-subj="streamsAppQueryStreamFieldActionsButton"
            iconType="boxesVertical"
            onClick={toggle}
          />
        </EuiToolTip>
      }
      isOpen={popoverIsOpen}
      closePopover={closePopover}
      panelPaddingSize="none"
    >
      <EuiContextMenu initialPanelId={0} panels={panels} />
    </EuiPopover>
  );
};

interface UseQueryStreamSchemaFieldsResult {
  fields: SchemaEditorField[];
  isLoadingFields: boolean;
  refreshFields: () => void;
  staleFieldNames: string[];
}

const EMPTY_FIELD_DESCRIPTIONS: Record<string, string> = {};

const useQueryStreamSchemaFields = ({
  definition,
}: QueryStreamSchemaEditorProps): UseQueryStreamSchemaFieldsResult => {
  const { data } = useKibana().dependencies.start;
  const esqlQuery = definition.stream.query.esql;
  const fieldDescriptions = definition.stream.field_descriptions ?? EMPTY_FIELD_DESCRIPTIONS;

  const {
    value: columnsFromQuery = [],
    loading,
    refresh,
  } = useAbortableAsync(
    async ({ signal }) => {
      if (!esqlQuery) {
        return [];
      }
      const columns = await getESQLQueryColumns({
        esqlQuery,
        search: data.search.search,
        signal,
      });
      return columns;
    },
    [data.search, esqlQuery]
  );

  const { fields, staleFieldNames } = useMemo(() => {
    const queryFieldNames = new Set(columnsFromQuery.map((col) => col.name));

    const activeFields: SchemaEditorField[] = columnsFromQuery.map((column) => {
      const esqlType = column.meta.type;
      return {
        name: column.name,
        type: esqlType as NonNullable<SchemaEditorField['type']>,
        parent: definition.stream.name,
        status: 'mapped' as const,
        description: fieldDescriptions[column.name],
      };
    });

    const staleFields = Object.keys(fieldDescriptions).filter(
      (fieldName) => !queryFieldNames.has(fieldName)
    );

    const staleFieldEntries: SchemaEditorField[] = staleFields.map((fieldName) => ({
      name: fieldName,
      type: undefined,
      parent: definition.stream.name,
      status: 'unmapped' as const,
      description: fieldDescriptions[fieldName],
    }));

    return {
      fields: [...activeFields, ...staleFieldEntries],
      staleFieldNames: staleFields,
    };
  }, [columnsFromQuery, definition.stream.name, fieldDescriptions]);

  return {
    fields,
    isLoadingFields: loading,
    refreshFields: refresh,
    staleFieldNames,
  };
};
