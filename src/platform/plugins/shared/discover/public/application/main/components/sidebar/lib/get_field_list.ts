/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { difference } from 'lodash';
import { type DataView, DataViewField } from '@kbn/data-views-plugin/public';
import { convertDatatableColumnToDataViewFieldSpec } from '@kbn/data-view-utils';
import type { DatatableColumn } from '@kbn/expressions-plugin/common';
import { fieldWildcardFilter } from '@kbn/kibana-utils-plugin/public';
import { isNestedFieldParent } from '@kbn/discover-utils';

export function getDataViewFieldList(
  dataView: DataView | undefined | null,
  fieldCounts: Record<string, number> | undefined | null
): DataViewField[] | null {
  if (!fieldCounts) {
    // still loading data
    return null;
  }

  const currentFieldCounts = fieldCounts || {};
  const sourceFiltersValues = dataView?.getSourceFiltering?.()?.excludes;
  let dataViewFields: DataViewField[] = dataView?.fields.getAll() || [];

  if (sourceFiltersValues) {
    const filter = fieldWildcardFilter(sourceFiltersValues, dataView.metaFields);
    dataViewFields = dataViewFields.filter((field) => {
      return filter(field.name) || currentFieldCounts[field.name]; // don't filter out a field which was present in hits (ex. for selected fields)
    });
  }

  const fieldNamesInDocs = Object.keys(currentFieldCounts);
  const fieldNamesInDataView = dataViewFields.map((fld) => fld.name);
  const unknownFields: DataViewField[] = [];

  difference(fieldNamesInDocs, fieldNamesInDataView).forEach((unknownFieldName) => {
    if (dataView && isNestedFieldParent(unknownFieldName, dataView)) {
      unknownFields.push(
        new DataViewField({
          name: String(unknownFieldName),
          type: 'nested',
          searchable: false,
          aggregatable: false,
        })
      );
    } else {
      unknownFields.push(
        new DataViewField({
          name: String(unknownFieldName),
          type: 'unknown',
          searchable: false,
          aggregatable: false,
        })
      );
    }
  });

  return [...dataViewFields, ...unknownFields];
}

export function getEsqlQueryFieldList(
  esqlQueryColumns?: readonly DatatableColumn[]
): DataViewField[] {
  if (!esqlQueryColumns) {
    return [];
  }
  return esqlQueryColumns.map(
    (column) => new DataViewField(convertDatatableColumnToDataViewFieldSpec(column))
  );
}
