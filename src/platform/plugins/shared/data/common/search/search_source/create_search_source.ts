/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataViewsContract, DataViewLazy } from '@kbn/data-views-plugin/common';
import { DataView } from '@kbn/data-views-plugin/common';
import type { FieldFormatsStartCommon } from '@kbn/field-formats-plugin/common';
import { migrateLegacyQuery } from './migrate_legacy_query';
import type { SearchSourceDependencies } from './search_source';
import { SearchSource } from './search_source';
import type { SerializedSearchSourceFields } from '../..';
import type { SearchSourceFields } from './types';

type CreateSearchSourceDataViews = Pick<
  DataViewsContract,
  'get' | 'create' | 'getDataViewLazy' | 'createDataViewLazy'
>;

/**
 * Deserializes a json string and a set of referenced objects to a `SearchSource` instance.
 * Use this method to re-create the search source serialized using `searchSource.serialize`.
 *
 * This function is a factory function that returns the actual utility when calling it with the
 * required service dependency (index patterns contract). A pre-wired version is also exposed in
 * the start contract of the data plugin as part of the search service
 *
 * @param indexPatterns The index patterns contract of the data plugin
 * @param searchSourceDependencies
 *
 * @return Wired utility function taking two parameters `searchSourceJson`, the json string
 * returned by `serializeSearchSource` and `references`, a list of references including the ones
 * returned by `serializeSearchSource`.
 *
 *
 * @public */
export const createSearchSource = (
  indexPatterns: CreateSearchSourceDataViews,
  searchSourceDependencies: SearchSourceDependencies
) => {
  let dataViewLazy: DataViewLazy | undefined;
  const createFields = async (
    searchSourceFields: SerializedSearchSourceFields = {},
    useDataViewLazy = false
  ) => {
    const { index, parent, query, ...restOfFields } = searchSourceFields;
    const fields: SearchSourceFields = {
      ...restOfFields,
      ...(typeof query !== 'undefined' ? { query: migrateLegacyQuery(query) } : {}),
    };

    // hydrating index pattern
    if (searchSourceFields.index) {
      if (!useDataViewLazy) {
        fields.index =
          typeof searchSourceFields.index === 'string'
            ? await indexPatterns.get(searchSourceFields.index)
            : await indexPatterns.create(searchSourceFields.index);
      } else {
        dataViewLazy =
          typeof searchSourceFields.index === 'string'
            ? await indexPatterns.getDataViewLazy(searchSourceFields.index)
            : await indexPatterns.createDataViewLazy(searchSourceFields.index);

        const [spec, shortDotsEnable, metaFields] = await Promise.all([
          dataViewLazy.toSpec(),
          searchSourceDependencies.dataViews.getShortDotsEnable(),
          searchSourceDependencies.dataViews.getMetaFields(),
        ]);

        const dataView = new DataView({
          spec,
          // field format functionality is not used within search source
          fieldFormats: {} as FieldFormatsStartCommon,
          shortDotsEnable,
          metaFields,
        });
        fields.index = dataView;
      }
    }

    if (searchSourceFields.parent) {
      fields.parent = await createFields(searchSourceFields.parent);
    }

    return fields;
  };

  const createSearchSourceFn = async (
    searchSourceFields: SerializedSearchSourceFields = {},
    useDataViewLazy?: boolean
  ) => {
    const fields = await createFields(searchSourceFields, !!useDataViewLazy);
    const searchSource = new SearchSource(fields, searchSourceDependencies);

    // using the dataViewLazy check as a type guard
    if (useDataViewLazy && dataViewLazy) {
      const dataViewFields = await searchSource.loadDataViewFields(dataViewLazy);
      fields.index?.fields.replaceAll(Object.values(dataViewFields).map((fld) => fld.toSpec()));
    }

    return searchSource;
  };

  return createSearchSourceFn;
};
