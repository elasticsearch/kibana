/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiCode } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';

import type { FormSchema } from '../../../shared_imports';
import { FIELD_TYPES, fieldValidators, fieldFormatters } from '../../../shared_imports';

const { emptyField, containsCharsField, isJsonField } = fieldValidators;
const { toInt } = fieldFormatters;

const stringifyJson = (json: { [key: string]: any }): string =>
  Object.keys(json).length ? JSON.stringify(json, null, 2) : '{\n\n}';

const parseJson = (jsonString: string): object => {
  let parsedJSON: any;

  try {
    parsedJSON = JSON.parse(jsonString);
  } catch {
    parsedJSON = {};
  }

  return parsedJSON;
};

export const logisticsFormSchema: FormSchema = {
  name: {
    defaultValue: undefined,
    label: i18n.translate('xpack.idxMgmt.componentTemplateForm.stepLogistics.nameFieldLabel', {
      defaultMessage: 'Name',
    }),
    type: FIELD_TYPES.TEXT,
    validations: [
      {
        validator: emptyField(
          i18n.translate('xpack.idxMgmt.componentTemplateForm.validation.nameRequiredError', {
            defaultMessage: 'A component template name is required.',
          })
        ),
      },
      {
        validator: containsCharsField({
          chars: ' ',
          message: i18n.translate(
            'xpack.idxMgmt.componentTemplateForm.stepLogistics.validation.nameSpacesError',
            {
              defaultMessage: 'Spaces are not allowed in a component template name.',
            }
          ),
        }),
      },
    ],
  },
  version: {
    type: FIELD_TYPES.NUMBER,
    label: i18n.translate('xpack.idxMgmt.componentTemplateForm.stepLogistics.versionFieldLabel', {
      defaultMessage: 'Version (optional)',
    }),
    formatters: [toInt],
  },
  _meta: {
    label: i18n.translate('xpack.idxMgmt.componentTemplateForm.stepLogistics.metaFieldLabel', {
      defaultMessage: '_meta field data (optional)',
    }),
    helpText: (
      <FormattedMessage
        id="xpack.idxMgmt.componentTemplateForm.stepLogistics.metaHelpText"
        defaultMessage="Use JSON format: {code}"
        values={{
          code: <EuiCode>{JSON.stringify({ arbitrary_data: 'anything_goes' })}</EuiCode>,
        }}
      />
    ),
    serializer: (value) => {
      const result = parseJson(value);
      // If an empty object was passed, strip out this value entirely.
      if (!Object.keys(result).length) {
        return undefined;
      }
      return result;
    },
    deserializer: stringifyJson,
    validations: [
      {
        validator: isJsonField(
          i18n.translate(
            'xpack.idxMgmt.componentTemplateForm.stepLogistics.validation.metaJsonError',
            {
              defaultMessage: 'The input is not valid.',
            }
          ),
          { allowEmptyString: true }
        ),
      },
    ],
  },
};
