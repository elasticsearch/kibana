/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { EuiCode } from '@elastic/eui';
import React from 'react';
import { parseJson, stringifyJson } from '../../lib/utils';
import type { FormSchema } from '../../../shared_imports';
import { FIELD_TYPES, fieldValidators, fieldFormatters } from '../../../shared_imports';

const { emptyField, isJsonField, containsCharsField } = fieldValidators;
const { toInt } = fieldFormatters;
const DISALLOWED_CHARS = [',', '*'];

export const pipelineFormSchema: FormSchema = {
  name: {
    type: FIELD_TYPES.TEXT,
    label: i18n.translate('xpack.ingestPipelines.form.nameFieldLabel', {
      defaultMessage: 'Name',
    }),
    validations: [
      {
        validator: emptyField(
          i18n.translate('xpack.ingestPipelines.form.pipelineNameRequiredError', {
            defaultMessage: 'Name is required.',
          })
        ),
      },
      {
        validator: containsCharsField({
          message: i18n.translate(
            'xpack.ingestPipelines.form.pipelineInvalidCharactersInNameError',
            {
              defaultMessage: `Should not contain any of the following characters: {notAllowedChars}`,
              values: {
                notAllowedChars: DISALLOWED_CHARS.join(', '),
              },
            }
          ),
          chars: DISALLOWED_CHARS,
        }),
      },
    ],
  },
  description: {
    type: FIELD_TYPES.TEXTAREA,
    label: i18n.translate('xpack.ingestPipelines.form.descriptionFieldLabel', {
      defaultMessage: 'Description (optional)',
    }),
  },
  version: {
    type: FIELD_TYPES.NUMBER,
    label: i18n.translate('xpack.ingestPipelines.form.versionFieldLabel', {
      defaultMessage: 'Version (optional)',
    }),
    formatters: [toInt],
  },
  field_access_pattern: {
    type: FIELD_TYPES.TOGGLE,
    label: i18n.translate('xpack.ingestPipelines.form.fieldAccessPatternFieldLabel', {
      defaultMessage: 'Use the flexible field access pattern',
    }),
    defaultValue: false,
    serializer: (value) => (value ? 'flexible' : 'classic'),
    deserializer: (value) => value === 'flexible',
  },
  _meta: {
    label: i18n.translate('xpack.ingestPipelines.form.metaFieldLabel', {
      defaultMessage: '_meta field data (optional)',
    }),
    helpText: (
      <FormattedMessage
        id="xpack.ingestPipelines.form.metaHelpText"
        defaultMessage="Use JSON format: {code}"
        values={{
          code: <EuiCode>{JSON.stringify({ arbitrary_data: 'anything_goes' })}</EuiCode>,
        }}
      />
    ),
    serializer: (value) => {
      const result = parseJson(value, false);
      // If an empty object was passed, strip out this value entirely.
      if (!Object.keys(result).length) {
        return undefined;
      }
      return result;
    },
    deserializer: (value) => stringifyJson(value, false),
    validations: [
      {
        validator: isJsonField(
          i18n.translate('xpack.ingestPipelines.form.validation.metaJsonError', {
            defaultMessage: 'The input is not valid.',
          }),
          { allowEmptyString: true }
        ),
      },
    ],
  },
};
