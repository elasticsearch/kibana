/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import {
  EuiBasicTable,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiConfirmModal,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSkeletonText,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { EuiBasicTableColumn } from '@elastic/eui';
import type { Owner } from '../../../../common/bundled-types.gen';
import type { FieldDefinition } from '../../../../common/types/domain/field_definition/v1';
import { useCasesContext } from '../../cases_context/use_cases_context';
import { useCasesTemplatesNavigation } from '../../../common/navigation';
import { useGetFieldDefinitions } from '../hooks/use_get_field_definitions';
import { useCreateFieldDefinition } from '../hooks/use_create_field_definition';
import { useUpdateFieldDefinition } from '../hooks/use_update_field_definition';
import { useDeleteFieldDefinition } from '../hooks/use_delete_field_definition';
import { FieldDefinitionFlyout } from '../components/field_definition_flyout';
import * as i18n from '../translations';

export type AllFieldDefinitionsPageProps = Record<string, never>;

export const AllFieldDefinitionsPage: React.FC<AllFieldDefinitionsPageProps> = () => {
  const { euiTheme } = useEuiTheme();
  const { owner } = useCasesContext();
  const { navigateToCasesTemplates } = useCasesTemplatesNavigation();

  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [editingFieldDef, setEditingFieldDef] = useState<FieldDefinition | undefined>(undefined);
  const [deletingFieldDef, setDeletingFieldDef] = useState<FieldDefinition | undefined>(undefined);

  const { data, isLoading } = useGetFieldDefinitions({ owner });
  const { mutate: createFieldDef, isLoading: isCreating } = useCreateFieldDefinition({
    onSuccess: () => setFlyoutOpen(false),
  });
  const { mutate: updateFieldDef, isLoading: isUpdating } = useUpdateFieldDefinition({
    onSuccess: () => {
      setFlyoutOpen(false);
      setEditingFieldDef(undefined);
    },
  });
  const { mutate: deleteFieldDef } = useDeleteFieldDefinition({
    onSuccess: () => setDeletingFieldDef(undefined),
  });

  const handleCreate = useCallback(() => {
    setEditingFieldDef(undefined);
    setFlyoutOpen(true);
  }, []);

  const handleEdit = useCallback((fd: FieldDefinition) => {
    setEditingFieldDef(fd);
    setFlyoutOpen(true);
  }, []);

  const handleSave = useCallback(
    ({
      name,
      description,
      definition,
      isGlobal,
    }: {
      name: string;
      description: string;
      definition: string;
      isGlobal: boolean;
    }) => {
      const ownerValue = (Array.isArray(owner) ? owner[0] : owner) as Owner;

      if (editingFieldDef) {
        updateFieldDef({
          id: editingFieldDef.fieldDefinitionId,
          fieldDefinition: { name, description, definition, owner: ownerValue, isGlobal },
        });
      } else {
        createFieldDef({
          fieldDefinition: { name, description, definition, owner: ownerValue, isGlobal },
        });
      }
    },
    [editingFieldDef, createFieldDef, updateFieldDef, owner]
  );

  const handleDelete = useCallback((fd: FieldDefinition) => {
    setDeletingFieldDef(fd);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (deletingFieldDef) {
      deleteFieldDef({ id: deletingFieldDef.fieldDefinitionId });
    }
  }, [deletingFieldDef, deleteFieldDef]);

  const columns: Array<EuiBasicTableColumn<FieldDefinition>> = [
    {
      field: 'name',
      name: i18n.NAME_COLUMN,
      sortable: true,
      truncateText: true,
      'data-test-subj': 'fieldDefinitionNameCell',
    },
    {
      field: 'description',
      name: i18n.DESCRIPTION_COLUMN,
      truncateText: true,
      render: (description: string | undefined) => (
        <EuiText size="s" color="subdued">
          {description ?? '—'}
        </EuiText>
      ),
    },
    {
      field: 'isGlobal',
      name: i18n.APPLY_TO_ALL_CASES_COLUMN,
      render: (value: boolean | undefined) =>
        value ? i18n.GLOBAL_FIELD_YES : i18n.GLOBAL_FIELD_NO,
      'data-test-subj': 'fieldDefinitionApplyToAllCasesCell',
    },
    {
      name: i18n.ACTIONS_COLUMN,
      actions: [
        {
          render: (fd: FieldDefinition) => (
            <EuiFlexGroup gutterSize="xs" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiToolTip content={i18n.EDIT_FIELD_DEFINITION} disableScreenReaderOutput>
                  <EuiButtonIcon
                    iconType="pencil"
                    aria-label={i18n.EDIT_FIELD_DEFINITION}
                    onClick={() => handleEdit(fd)}
                    data-test-subj="fieldDefinitionEditButton"
                  />
                </EuiToolTip>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiToolTip content={i18n.DELETE_FIELD_DEFINITION} disableScreenReaderOutput>
                  <EuiButtonIcon
                    iconType="trash"
                    aria-label={i18n.DELETE_FIELD_DEFINITION}
                    color="danger"
                    onClick={() => handleDelete(fd)}
                    data-test-subj="fieldDefinitionDeleteButton"
                  />
                </EuiToolTip>
              </EuiFlexItem>
            </EuiFlexGroup>
          ),
        },
      ],
    },
  ];

  const fieldDefinitions = data?.fieldDefinitions ?? [];

  return (
    <>
      <header>
        <EuiButtonEmpty
          iconType="sortLeft"
          size="xs"
          flush="left"
          onClick={navigateToCasesTemplates}
          aria-label={i18n.BACK_TO_TEMPLATES}
          data-test-subj="fieldLibraryBackToTemplatesButton"
        >
          {i18n.BACK_TO_TEMPLATES}
        </EuiButtonEmpty>
        <EuiFlexGroup
          alignItems="center"
          gutterSize="s"
          css={css`
            margin-bottom: ${euiTheme.size.l};
          `}
        >
          <EuiFlexItem>
            <EuiTitle size="l">
              <h1>{i18n.FIELD_LIBRARY_TITLE}</h1>
            </EuiTitle>
            <EuiText size="s" color="subdued">
              <p>{i18n.FIELD_LIBRARY_DESCRIPTION}</p>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              fill
              iconType="plusInCircle"
              onClick={handleCreate}
              data-test-subj="createFieldDefinitionButton"
            >
              {i18n.CREATE_FIELD_DEFINITION}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </header>
      <EuiSpacer size="l" />
      {isLoading ? (
        <EuiSkeletonText lines={5} />
      ) : (
        <EuiBasicTable
          items={fieldDefinitions}
          rowHeader="name"
          columns={columns}
          data-test-subj="fieldDefinitionsTable"
        />
      )}

      {flyoutOpen && (
        <FieldDefinitionFlyout
          owner={Array.isArray(owner) ? owner[0] : owner}
          fieldDefinition={editingFieldDef}
          onSave={handleSave}
          onClose={() => {
            setFlyoutOpen(false);
            setEditingFieldDef(undefined);
          }}
          isSaving={isCreating || isUpdating}
        />
      )}

      {deletingFieldDef && (
        <EuiConfirmModal
          title={i18n.DELETE_CONFIRM_TITLE}
          onCancel={() => setDeletingFieldDef(undefined)}
          onConfirm={handleConfirmDelete}
          cancelButtonText={i18n.CANCEL}
          confirmButtonText={i18n.DELETE_FIELD_DEFINITION}
          buttonColor="danger"
          data-test-subj="fieldDefinitionDeleteConfirmModal"
        >
          <p>{i18n.DELETE_CONFIRM_BODY(deletingFieldDef.name)}</p>
        </EuiConfirmModal>
      )}
    </>
  );
};

AllFieldDefinitionsPage.displayName = 'AllFieldDefinitionsPage';

// eslint-disable-next-line import/no-default-export
export default AllFieldDefinitionsPage;
