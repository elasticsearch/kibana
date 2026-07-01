/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataView } from '@kbn/data-views-plugin/public';
import type { SavedSearch } from '@kbn/saved-search-plugin/public';

export interface GetUrlParamsArgs {
  dataView: DataView;
  savedSearch: SavedSearch | null;
  projectRouting?: string;
}

export const getUrlParams = ({
  dataView,
  savedSearch,
  projectRouting,
}: GetUrlParamsArgs): string => {
  const params = new URLSearchParams();
  if (!savedSearch && dataView.id) {
    params.set('index', dataView.id);
  } else if (savedSearch?.id) {
    params.set('savedSearchId', savedSearch.id);
  }
  if (projectRouting) {
    params.set('project_routing', projectRouting);
  }
  return `?${params.toString()}`;
};
