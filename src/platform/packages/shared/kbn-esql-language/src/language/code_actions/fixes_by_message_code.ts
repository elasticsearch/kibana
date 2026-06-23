/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import { EsqlQuery, mutate } from '@elastic/esql';
import { getColumnTypeConflictQuickFixes } from './column_type_conflict';
import type { QuickFix, QuickFixMessage } from './types';
import type { ErrorTypes } from '../../commands/definitions/types';
import { EsqlSettingNames } from '../../commands/definitions/generated/settings';
import { UnmappedFieldsStrategy } from '../../commands/registry/types';
import { hasWiredStreamsInQuery } from '../../commands/definitions/utils/sources';

type QuickFixProvider = (message: QuickFixMessage) => QuickFix[];

const loadUnmappedFieldsQuickFix: QuickFix = {
  title: i18n.translate('kbn-esql-language.esql.quickFix.loadUnmappedFields', {
    defaultMessage: 'Load unmapped fields',
  }),
  displayCondition: hasWiredStreamsInQuery,
  fixQuery: (query: string) => {
    const esqlQuery = EsqlQuery.fromSrc(query, { withFormatting: true });
    mutate.commands.set.upsert(
      esqlQuery.ast,
      EsqlSettingNames.UNMAPPED_FIELDS,
      `"${UnmappedFieldsStrategy.LOAD}"`
    );
    return esqlQuery.print({ multiline: true });
  },
};

const fixesByMessageCode: Partial<Record<ErrorTypes, QuickFixProvider>> = {
  unknownColumn: () => [loadUnmappedFieldsQuickFix],
  columnTypeConflict: getColumnTypeConflictQuickFixes,
};

export const getQuickFixesByMessageCode = (message: QuickFixMessage): QuickFix[] =>
  fixesByMessageCode[message.code as ErrorTypes]?.(message) ?? [];
