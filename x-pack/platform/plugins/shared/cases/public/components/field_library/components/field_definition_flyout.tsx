/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCheckbox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiForm,
  EuiFormRow,
  EuiSpacer,
  EuiTextArea,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { parse as parseYaml } from 'yaml';
import type { FieldDefinition } from '../../../../common/types/domain/field_definition/v1';
import {
  FieldType,
  UserPickerDefaultSchema,
} from '../../../../common/types/domain/template/fields';
import {
  type FieldDefaultValue,
  updateFieldDefinitionDefault,
  removeFieldDefinitionDefault,
} from '../../templates_v2/utils/update_yaml_field_default';
import { FieldDefinitionYamlEditor } from './field_definition_yaml_editor';
import { FieldDefinitionPreview } from './field_definition_preview';
import * as i18n from '../translations';

const EXAMPLE_FIELD_YAML = `name: my_field
label: "My Field"
control: INPUT_TEXT
type: keyword
`;

interface FieldDefinitionFlyoutProps {
  owner: string;
  fieldDefinition?: FieldDefinition;
  onSave: (params: {
    name: string;
    description: string;
    definition: string;
    isGlobal: boolean;
  }) => void;
  onClose: () => void;
  isSaving?: boolean;
}

export const FieldDefinitionFlyout: React.FC<FieldDefinitionFlyoutProps> = ({
  owner,
  fieldDefinition,
  onSave,
  onClose,
  isSaving = false,
}) => {
  const isEditing = !!fieldDefinition;

  const [description, setDescription] = useState(fieldDefinition?.description ?? '');
  const [definition, setDefinition] = useState(fieldDefinition?.definition ?? EXAMPLE_FIELD_YAML);
  const [isGlobal, setApplyToAllCases] = useState(fieldDefinition?.isGlobal ?? false);
  const [definitionError, setDefinitionError] = useState<string | undefined>();

  const definitionRef = useRef(definition);
  definitionRef.current = definition;

  const parseName = useCallback((yaml: string): string | undefined => {
    try {
      const parsed = parseYaml(yaml) as { name?: unknown } | null;
      const n = parsed?.name;
      return typeof n === 'string' && n.trim() ? n.trim() : undefined;
    } catch {
      return undefined;
    }
  }, []);

  const validate = useCallback((): boolean => {
    const name = parseName(definition);
    if (!name) {
      setDefinitionError(i18n.FIELD_DEFINITION_YAML_MISSING_NAME);
      return false;
    }
    setDefinitionError(undefined);
    return true;
  }, [definition, parseName]);

  const handleSave = useCallback(() => {
    if (!validate()) return;
    const name = parseName(definition) as string;
    onSave({ name, description: description.trim(), definition, isGlobal });
  }, [validate, parseName, onSave, description, definition, isGlobal]);

  const handleDefaultChange = useCallback((fieldName: string, value: string, control: string) => {
    const trimmedValue = value.trim();
    const isEmptyNumeric = control === FieldType.INPUT_NUMBER && trimmedValue === '';
    const isEmptyUserPicker = control === FieldType.USER_PICKER && (value === '' || value === '[]');

    let newDefinition: string;
    if (isEmptyNumeric || isEmptyUserPicker) {
      newDefinition = removeFieldDefinitionDefault(definitionRef.current);
    } else {
      let parsedValue: FieldDefaultValue;
      if (control === FieldType.INPUT_NUMBER) {
        parsedValue = Number(trimmedValue);
      } else if (control === FieldType.CHECKBOX_GROUP) {
        try {
          parsedValue = JSON.parse(value) as string[];
        } catch {
          parsedValue = [];
        }
      } else if (control === FieldType.USER_PICKER) {
        try {
          const result = UserPickerDefaultSchema.safeParse(JSON.parse(value));
          parsedValue = result.success ? result.data : [];
        } catch {
          parsedValue = [];
        }
      } else {
        parsedValue = trimmedValue;
      }
      newDefinition = updateFieldDefinitionDefault(definitionRef.current, parsedValue);
    }

    if (newDefinition !== definitionRef.current) {
      setDefinition(newDefinition);
    }
  }, []);

  return (
    <EuiFlyout onClose={onClose} size="m" data-test-subj="fieldDefinitionFlyout">
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2>
            {isEditing
              ? i18n.FIELD_DEFINITION_FORM_TITLE_EDIT
              : i18n.FIELD_DEFINITION_FORM_TITLE_CREATE}
          </h2>
        </EuiTitle>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <EuiForm component="form" data-test-subj="fieldDefinitionForm">
          <EuiFormRow label={i18n.FIELD_DEFINITION_DESCRIPTION_LABEL} fullWidth>
            <EuiTextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              fullWidth
              data-test-subj="fieldDefinitionDescriptionInput"
            />
          </EuiFormRow>
          <EuiSpacer size="m" />
          <EuiToolTip content={i18n.APPLY_TO_ALL_CASES_HELP_TEXT}>
            <EuiCheckbox
              id="fieldDefinitionApplyToAllCases"
              label={i18n.APPLY_TO_ALL_CASES_LABEL}
              checked={isGlobal}
              onChange={(e) => setApplyToAllCases(e.target.checked)}
              data-test-subj="fieldDefinitionApplyToAllCasesCheckbox"
            />
          </EuiToolTip>
          <EuiSpacer size="l" />
          <EuiFormRow
            label={i18n.FIELD_DEFINITION_YAML_LABEL}
            isInvalid={!!definitionError}
            error={definitionError}
            fullWidth
          >
            <FieldDefinitionYamlEditor
              value={definition}
              onChange={setDefinition}
              data-test-subj="fieldDefinitionYamlInput"
            />
          </EuiFormRow>
          <EuiSpacer size="m" />
          <EuiTitle size="xs">
            <h3>{i18n.FIELD_DEFINITION_PREVIEW_LABEL}</h3>
          </EuiTitle>
          <EuiSpacer size="s" />
          <FieldDefinitionPreview definition={definition} onDefaultChange={handleDefaultChange} />
        </EuiForm>
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onClose} data-test-subj="fieldDefinitionCancelButton">
              {i18n.CANCEL}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              fill
              onClick={handleSave}
              isLoading={isSaving}
              data-test-subj="fieldDefinitionSaveButton"
            >
              {i18n.SAVE_FIELD_DEFINITION}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};

FieldDefinitionFlyout.displayName = 'FieldDefinitionFlyout';
