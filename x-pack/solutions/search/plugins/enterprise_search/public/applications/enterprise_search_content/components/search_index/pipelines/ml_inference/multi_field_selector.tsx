/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';

import { useValues, useActions } from 'kea';

import type { EuiBasicTableColumn } from '@elastic/eui';
import {
  EuiBasicTable,
  EuiButton,
  EuiComboBox,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiIcon,
} from '@elastic/eui';

import { i18n } from '@kbn/i18n';

import type { FieldMapping } from '../../../../../../../common/ml_inference_pipeline';

import { IndexViewLogic } from '../../index_view_logic';

import { MLInferenceLogic } from './ml_inference_logic';

type FieldNames = Array<{ label: string }>;

const TARGET_FIELD_PLACEHOLDER_TEXT_NO_FIELDS = i18n.translate(
  'xpack.enterpriseSearch.content.indices.pipelines.addInferencePipelineModal.steps.fields.targetField.placeholder.noFields',
  {
    defaultMessage: 'Select a source field',
  }
);

const TARGET_FIELD_PLACEHOLDER_TEXT_MULTIPLE_FIELDS = i18n.translate(
  'xpack.enterpriseSearch.content.indices.pipelines.addInferencePipelineModal.steps.fields.targetField.placeholder.multipleFields',
  {
    defaultMessage: 'Automatically created for multi-select',
  }
);

const TARGET_FIELD_PLACEHOLDER_TEXT_TEXT_EXPANSION_MODEL = i18n.translate(
  'xpack.enterpriseSearch.content.indices.pipelines.addInferencePipelineModal.steps.fields.targetField.placeholder.textExpansionModel',
  {
    defaultMessage: 'Automatically created',
  }
);

const TARGET_FIELD_HELP_TEXT_DEFAULT = i18n.translate(
  'xpack.enterpriseSearch.content.indices.pipelines.addInferencePipelineModal.steps.fields.targetField.helpText',
  {
    defaultMessage: 'Optional. Field name where inference results should be saved.',
  }
);

const TARGET_FIELD_HELP_TEXT_TEXT_EXPANSION_MODEL = i18n.translate(
  'xpack.enterpriseSearch.content.indices.pipelines.addInferencePipelineModal.steps.fields.targetField.helpTextTextExpansionModel',
  {
    defaultMessage: 'ELSER target fields are created automatically.',
  }
);

const getInitialTargetFieldPlaceholderText = (isTextExpansionModelSelected: boolean) =>
  isTextExpansionModelSelected
    ? TARGET_FIELD_PLACEHOLDER_TEXT_TEXT_EXPANSION_MODEL
    : TARGET_FIELD_PLACEHOLDER_TEXT_NO_FIELDS;

const getTargetFieldHelpText = (isTextExpansionModelSelected: boolean) =>
  isTextExpansionModelSelected
    ? TARGET_FIELD_HELP_TEXT_TEXT_EXPANSION_MODEL
    : TARGET_FIELD_HELP_TEXT_DEFAULT;

export const MultiFieldMapping: React.FC = () => {
  const {
    addInferencePipelineModal: { configuration, selectedSourceFields = [] },
    isTextExpansionModelSelected,
    sourceFields,
  } = useValues(MLInferenceLogic);
  const { ingestionMethod } = useValues(IndexViewLogic);
  const { addSelectedFieldsToMapping, selectFields, setTargetField } = useActions(MLInferenceLogic);
  const [placeholderText, setPlaceholderText] = useState<string>(
    getInitialTargetFieldPlaceholderText(isTextExpansionModelSelected)
  );

  const mappedSourceFields =
    configuration.fieldMappings?.map(({ sourceField }) => sourceField) ?? [];

  // Remove fields that have already been selected or mapped from selectable field options
  const fieldOptions = (sourceFields || [])
    .filter((fieldName) => ![...selectedSourceFields, ...mappedSourceFields].includes(fieldName))
    .map((fieldName) => ({ label: fieldName }));

  const selectedFields = selectedSourceFields.map((fieldName) => ({
    label: fieldName,
  }));
  const targetField = configuration.targetField;
  const isExactlyOneSourceFieldSelected = selectedSourceFields.length === 1;

  const onChangeSelectedFields = (selectedFieldNames: FieldNames) => {
    selectFields(selectedFieldNames.map(({ label }) => label));
    setTargetField(
      !isTextExpansionModelSelected && selectedFieldNames.length === 1
        ? selectedFieldNames[0].label
        : ''
    );
    setPlaceholderText(
      isTextExpansionModelSelected
        ? TARGET_FIELD_PLACEHOLDER_TEXT_TEXT_EXPANSION_MODEL
        : selectedFieldNames.length === 0
        ? TARGET_FIELD_PLACEHOLDER_TEXT_NO_FIELDS
        : selectedFieldNames.length === 1
        ? selectedFieldNames[0].label
        : TARGET_FIELD_PLACEHOLDER_TEXT_MULTIPLE_FIELDS
    );
  };

  const onCreateField = (fieldName: string) => {
    const normalizedFieldName = fieldName.trim();
    if (!normalizedFieldName) return;

    selectedFields.push({ label: normalizedFieldName });
    selectFields([...selectedSourceFields, fieldName]);
  };

  const onAddSelectedFields = () => {
    addSelectedFieldsToMapping(isTextExpansionModelSelected);
    setTargetField('');
    setPlaceholderText(getInitialTargetFieldPlaceholderText(isTextExpansionModelSelected));
  };

  return (
    <>
      <EuiFlexGroup>
        <EuiFlexItem grow={4}>
          <EuiFormRow
            fullWidth
            label={i18n.translate(
              'xpack.enterpriseSearch.content.indices.pipelines.addInferencePipelineModal.steps.fields.sourceFieldLabel',
              {
                defaultMessage: 'Source text field',
              }
            )}
            helpText={i18n.translate(
              'xpack.enterpriseSearch.content.indices.pipelines.addInferencePipelineModal.steps.fields.sourceField.helpText',
              {
                defaultMessage: 'Select an existing field or type in a field name.',
              }
            )}
          >
            <EuiComboBox
              fullWidth
              data-telemetry-id={`entSearchContent-${ingestionMethod}-pipelines-configureFields-selectSchemaField`}
              placeholder={i18n.translate(
                'xpack.enterpriseSearch.content.indices.pipelines.addInferencePipelineModal.steps.fields.selectedFields',
                {
                  defaultMessage: 'Selected fields',
                }
              )}
              options={fieldOptions}
              selectedOptions={selectedFields}
              onChange={onChangeSelectedFields}
              onCreateOption={onCreateField}
            />
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem grow={false} style={{ paddingTop: '32px' }}>
          <EuiIcon type="sortRight" aria-hidden />
        </EuiFlexItem>
        <EuiFlexItem grow={4}>
          <EuiFormRow
            label={i18n.translate(
              'xpack.enterpriseSearch.content.indices.pipelines.addInferencePipelineModal.steps.fields.targetFieldLabel',
              {
                defaultMessage: 'Target field',
              }
            )}
            helpText={getTargetFieldHelpText(isTextExpansionModelSelected)}
            fullWidth
          >
            <EuiFieldText
              prepend="ml.inference."
              onChange={(e) => setTargetField(e.target.value)}
              data-telemetry-id={`entSearchContent-${ingestionMethod}-pipelines-configureFields-targetField`}
              disabled={isTextExpansionModelSelected || !isExactlyOneSourceFieldSelected}
              value={targetField}
              placeholder={placeholderText}
              fullWidth
            />
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem style={{ paddingTop: '20px' }}>
          <EuiButton
            color="primary"
            data-telemetry-id={`entSearchContent-${ingestionMethod}-pipelines-configureFields-addSelectedFieldsToMapping`}
            disabled={selectedFields.length === 0}
            iconType="plusCircle"
            onClick={onAddSelectedFields}
            style={{ width: '60px' }}
          >
            {i18n.translate(
              'xpack.enterpriseSearch.content.indices.pipelines.addInferencePipelineModal.steps.fields.addMapping',
              {
                defaultMessage: 'Add',
              }
            )}
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
};

export interface SelectedFieldMappingsProps {
  isReadOnly?: boolean;
}

export const SelectedFieldMappings: React.FC<SelectedFieldMappingsProps> = ({ isReadOnly }) => {
  const { removeFieldFromMapping } = useActions(MLInferenceLogic);
  const {
    addInferencePipelineModal: { configuration },
  } = useValues(MLInferenceLogic);

  const columns: Array<EuiBasicTableColumn<FieldMapping>> = [
    {
      'data-test-subj': 'sourceFieldCell',
      field: 'sourceField',
      name: i18n.translate(
        'xpack.enterpriseSearch.content.indices.pipelines.addInferencePipelineModal.steps.fields.fieldMappings.sourceFieldHeader',
        {
          defaultMessage: 'Source text field',
        }
      ),
    },
    {
      align: 'left',
      name: '',
      render: () => <EuiIcon type="sortRight" aria-hidden />,
      width: '60px',
    },
    {
      align: 'right',
      field: 'targetField',
      name: i18n.translate(
        'xpack.enterpriseSearch.content.indices.pipelines.addInferencePipelineModal.steps.fields.fieldMappings.targetFieldHeader',
        {
          defaultMessage: 'Target field',
        }
      ),
    },
    // Do not add action column in read-only mode
    ...(isReadOnly
      ? []
      : [
          {
            actions: [
              {
                color: 'danger',
                description: i18n.translate(
                  'xpack.enterpriseSearch.content.indices.pipelines.addInferencePipelineModal.steps.fields.actions.deleteMapping',
                  {
                    defaultMessage: 'Delete this mapping',
                  }
                ),
                icon: 'trash',
                isPrimary: true,
                name: (fieldMapping) =>
                  i18n.translate(
                    'xpack.enterpriseSearch.content.indices.pipelines.addInferencePipelineModal.steps.fields.actions.deleteMapping.caption',
                    {
                      defaultMessage: `Delete mapping ''{sourceField}'' - ''{targetField}''`,
                      values: {
                        sourceField: fieldMapping.sourceField,
                        targetField: fieldMapping.targetField,
                      },
                    }
                  ),
                onClick: (fieldMapping) => removeFieldFromMapping(fieldMapping.sourceField),
                type: 'icon',
              },
            ],
            name: i18n.translate(
              'xpack.enterpriseSearch.content.indices.pipelines.addInferencePipelineModal.steps.fields.actions',
              {
                defaultMessage: 'Actions',
              }
            ),
            width: '10%',
          } as EuiBasicTableColumn<FieldMapping>,
        ]),
  ];

  return (
    <>
      <EuiBasicTable
        columns={columns}
        items={configuration.fieldMappings ?? []}
        rowHeader="sourceField"
        tableCaption={i18n.translate(
          'xpack.enterpriseSearch.content.indices.pipelines.addInferencePipelineModal.steps.fields.fieldMappings.tableCaption',
          {
            defaultMessage: 'Field mappings',
          }
        )}
        noItemsMessage={i18n.translate(
          'xpack.enterpriseSearch.content.indices.pipelines.addInferencePipelineModal.steps.fields.fieldMappings.noFieldMappings',
          {
            defaultMessage: 'No field mappings selected',
          }
        )}
      />
    </>
  );
};
