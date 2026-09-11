/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';

import type { ValidationFunc, FieldConfig } from '../../shared_imports';
import type { Field } from '../../types';
import type { Context } from '../field_editor_context';
import { schema } from './form_schema';
import type { Props } from './field_editor';
import { RUNTIME_FIELD_OPTIONS_PRIMITIVE } from './constants';

const createNameNotAllowedValidator =
  (dataView: Context['dataView'], fieldName?: string): ValidationFunc<{}, string, string> =>
  async ({ value }) => {
    const runtimeComposites = Object.entries(dataView.getAllRuntimeFields())
      .filter(([, _runtimeField]) => _runtimeField.type === 'composite')
      .map(([_runtimeFieldName]) => _runtimeFieldName);

    if (value !== fieldName && (await dataView.getFieldByName(value, true))) {
      return {
        message: i18n.translate(
          'indexPatternFieldEditor.editor.runtimeFieldsEditor.existRuntimeFieldNamesValidationErrorMessage',
          {
            defaultMessage: 'A field with this name already exists.',
          }
        ),
      };
    } else if (value !== fieldName && runtimeComposites.includes(value)) {
      return {
        message: i18n.translate(
          'indexPatternFieldEditor.editor.runtimeFieldsEditor.existCompositeNamesValidationErrorMessage',
          {
            defaultMessage: 'A runtime composite with this name already exists.',
          }
        ),
      };
    }
  };

/**
 * Dynamically retrieve the config for the "name" field, adding
 * a validator to avoid duplicated runtime fields to be created.
 *
 * @param field Initial value of the form
 */
export const getNameFieldConfig = (
  dataView: Context['dataView'],
  field?: Props['field']
): FieldConfig<string, Field> => {
  const nameFieldConfig = schema.name as FieldConfig<string, Field>;

  // Add validation to not allow duplicates
  return {
    ...nameFieldConfig!,
    validations: [
      ...(nameFieldConfig.validations ?? []),
      {
        validator: createNameNotAllowedValidator(dataView, field?.name),
      },
    ],
  };
};

export const valueToComboBoxOption = (value: string) =>
  RUNTIME_FIELD_OPTIONS_PRIMITIVE.find(({ value: optionValue }) => optionValue === value);
