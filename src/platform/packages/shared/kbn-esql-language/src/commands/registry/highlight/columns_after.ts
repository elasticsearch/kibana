/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import uniqBy from 'lodash/uniqBy';
import type { ESQLFieldWithMetadata } from '@kbn/esql-types';
import type { ESQLCommand } from '@elastic/esql/types';
import type { ESQLColumnData } from '../types';

export const HIGHLIGHT_CONTENT_COLUMN = 'highlight_content';

export const columnsAfter = (command: ESQLCommand, previousColumns: ESQLColumnData[]) => {
  return uniqBy(
    [
      ...previousColumns,
      {
        name: HIGHLIGHT_CONTENT_COLUMN,
        type: 'keyword' as const,
        userDefined: false,
      } as ESQLFieldWithMetadata,
    ],
    'name'
  );
};
