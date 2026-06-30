/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { i18n } from '@kbn/i18n';
import type { ICommandMethods } from '../registry';
import { autocomplete } from './autocomplete';
import type { ICommandContext } from '../types';
import { validate } from './validate';
import { columnsAfter } from './columns_after';
import { summary } from './summary';

const rowCommandMethods: ICommandMethods<ICommandContext> = {
  autocomplete,
  validate,
  columnsAfter,
  summary,
};

export const rowCommand = {
  name: 'row',
  methods: rowCommandMethods,
  metadata: {
    type: 'source' as const,
    subquerySource: true,
    description: i18n.translate('kbn-esql-language.esql.definitions.rowDoc', {
      defaultMessage:
        'Produces a row with one or more columns with values that you specify. This can be useful for testing.',
    }),
    declaration: 'ROW column1 = value1[, ..., columnN = valueN]',
    examples: ['ROW a=1', 'ROW a=1, b=2'],
  },
};
