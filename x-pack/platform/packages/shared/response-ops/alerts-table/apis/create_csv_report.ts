/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpStart } from '@kbn/core-http-browser';
import { encode as risonEncode } from '@kbn/rison';
import { INTERNAL_ROUTES } from '@kbn/reporting-common';

export interface CreateCsvReportParams {
  http: HttpStart;
  title: string;
  objectType: string;
  browserTimezone: string;
  version: string;
  columns: string[];
  searchSource: {
    index: {
      title: string;
      timeFieldName: string;
    };
    query: { query: string; language: string };
    filter: Array<{ query: object; meta: { disabled: boolean } }>;
    sort: unknown;
  };
}

export const createCsvReport = (params: CreateCsvReportParams): Promise<void> => {
  const { http, ...jobParamsInput } = params;
  const jobParamsRison = risonEncode(jobParamsInput);
  return http.post(`${INTERNAL_ROUTES.GENERATE_PREFIX}/csv_searchsource`, {
    body: JSON.stringify({ jobParams: jobParamsRison }),
  });
};
