/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import type { ICommand, ICommandMethods } from '../registry';
import { autocomplete } from './autocomplete';
import { validate } from './validate';
import { columnsAfter } from './columns_after';
import { summary } from './summary';
import type { ICommandContext } from '../types';
import { Commands } from '../../definitions/keywords';

const highlightCommandMethods: ICommandMethods<ICommandContext> = {
  autocomplete,
  validate,
  columnsAfter,
  summary,
};

export const highlightCommand: ICommand = {
  name: Commands.HIGHLIGHT,
  methods: highlightCommandMethods,
  metadata: {
    description: i18n.translate('kbn-esql-language.esql.definitions.highlightDoc', {
      defaultMessage:
        'Highlights matching terms in text fields and returns the highlighted content as a new column.',
    }),
    declaration: 'HIGHLIGHT query_text ON field1 [, field2, ...]',
    examples: [
      'FROM books | HIGHLIGHT "star wars" ON title',
      'FROM books | HIGHLIGHT "hobbit" ON title, description',
      'FROM books | HIGHLIGHT "hobbit" ON title, description WITH { "pre_tags": "<mark>", "post_tags": "</mark>", "number_of_fragments": 3, "fragment_size": 150 }',
    ],
    preview: true,
    hidden: false,
  },
};
