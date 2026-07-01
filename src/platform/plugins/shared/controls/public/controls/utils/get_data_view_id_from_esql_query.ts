/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getESQLAdHocDataview, getIndexPatternFromESQLQuery } from '@kbn/esql-utils';
import type { DataView } from '@kbn/data-views-plugin/common';
import { coreServices, dataViewsService } from '../../services/kibana_services';

interface Options {
  preferredDataViews?: DataView[];
}

export const getDataViewIdFromESQLQuery = async (query: string, options: Options = {}) => {
  const indexPattern = getIndexPatternFromESQLQuery(query);
  const existingDataView = options.preferredDataViews?.find(
    (dataView) => dataView.getIndexPattern() === indexPattern
  );
  if (existingDataView?.id) {
    return existingDataView.id;
  }

  const [dataView] = await dataViewsService.find(indexPattern);
  if (dataView) {
    return dataView.id;
  }

  const adHocDataView = await getESQLAdHocDataview({
    dataViewsService,
    query,
    http: coreServices?.http,
  });
  return adHocDataView.id;
};
