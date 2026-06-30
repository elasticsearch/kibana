/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Datatable, ExpressionFunctionDefinition } from '@kbn/expressions-plugin/common';
import type { SerializedFieldFormat } from '@kbn/field-formats-plugin/common';
import type { DataType } from '@kbn/lens-common';

export type OriginalColumn = {
  id: string;
  label: string;
  variable?: string;
  format?: SerializedFieldFormat;
  dataType?: DataType;
  customLabel?: boolean;
  dropPartials?: boolean;
} & (
  | { operationType: 'date_histogram'; sourceField: string; interval: number }
  | { operationType: string; sourceField?: string; interval: never }
);

export type MapToColumnsExpressionFunction = ExpressionFunctionDefinition<
  'lens_map_to_columns',
  Datatable,
  {
    idMap: string;
    isTextBased?: boolean;
  },
  Datatable | Promise<Datatable>
>;
