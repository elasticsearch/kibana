/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DatatableColumn } from '@kbn/expressions-plugin/common';
import type { EsqlSource } from '../sources/esql_source';
import type { Column } from '../types';

type LooseColumn = Omit<Column, 'type'> & { type: string };

export const createMockEsqlSource = (
  columns: LooseColumn[] = [],
  resultColumns: DatatableColumn[] = [],
  timeFieldName?: string
): EsqlSource => {
  const mock: EsqlSource = {
    kind: 'esql',
    id: 'mock-esql-source',
    title: 'mock',
    name: 'mock',
    timeFieldName,
    references: [],
    fields: [],
    resultColumns,
    getColumns: () => columns as Column[],
    getColumn: (name: string) => columns.find((c) => c.name === name) as Column | undefined,
    isTimeBased: () => !!timeFieldName,
    isPersisted: () => false,
    serialize: () => ({
      kind: 'esql',
      id: 'mock-esql-source',
      title: 'mock',
      timeFieldName,
      references: [],
    }),
  } as unknown as EsqlSource;
  return mock;
};
