/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { OptionsListDSLControlState } from '@kbn/controls-schemas';
import type { DataView } from '@kbn/data-views-plugin/common';
import {
  type Filter,
  buildExistsFilter,
  buildPhraseFilter,
  buildPhrasesFilter,
} from '@kbn/es-query';

export const buildFilter = (
  dataView: DataView,
  controlId: string,
  filterState: Pick<
    OptionsListDSLControlState,
    'field_name' | 'exists_selected' | 'exclude' | 'selected_options'
  > & { sectionId?: string }
): Filter | undefined => {
  const fieldName = filterState.field_name;
  if (!fieldName) {
    return undefined;
  }
  let newFilter: Filter | undefined;
  const field = dataView.getFieldByName(fieldName);
  if (field) {
    if (filterState.exists_selected) {
      newFilter = buildExistsFilter(field, dataView);
    } else if (filterState.selected_options && filterState.selected_options.length > 0) {
      newFilter =
        filterState.selected_options.length === 1
          ? buildPhraseFilter(field, filterState.selected_options[0], dataView)
          : buildPhrasesFilter(field, filterState.selected_options, dataView);
    }
  }
  if (newFilter) {
    newFilter.meta.key = field?.name;
    if (filterState.exclude) newFilter.meta.negate = true;
    newFilter.meta.controlledBy = controlId;
    if (filterState.sectionId) newFilter.meta.group = filterState.sectionId;
  }
  return newFilter;
};
