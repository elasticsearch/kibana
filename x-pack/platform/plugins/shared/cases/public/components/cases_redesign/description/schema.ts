/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FormSchema } from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import { FIELD_TYPES } from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import { fieldValidators } from '@kbn/es-ui-shared-plugin/static/forms/helpers';
import { MAX_DESCRIPTION_LENGTH } from '../../../../common/constants';
import * as i18n from '../../../common/translations';

const { emptyField, maxLengthField } = fieldValidators;
export interface Content {
  content: string;
}
export const schema: FormSchema<Content> = {
  content: {
    type: FIELD_TYPES.TEXTAREA,
    validations: [
      {
        validator: emptyField(i18n.DESCRIPTION_REQUIRED),
      },
      {
        validator: maxLengthField({
          length: MAX_DESCRIPTION_LENGTH,
          message: i18n.MAX_LENGTH_ERROR('description', MAX_DESCRIPTION_LENGTH),
        }),
      },
    ],
  },
};
