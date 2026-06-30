/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { DatatableUtilitiesService } from './datatable_utilities_service';

export function createDatatableUtilitiesMock(): jest.Mocked<DatatableUtilitiesService> {
  return {
    clearField: jest.fn(),
    clearFieldFormat: jest.fn(),
    getAggConfig: jest.fn(),
    getColumnTimeRange: jest.fn(DatatableUtilitiesService.prototype.getColumnTimeRange),
    getDataView: jest.fn(),
    getDateHistogramMeta: jest.fn(DatatableUtilitiesService.prototype.getDateHistogramMeta),
    getField: jest.fn(),
    getFieldFormat: jest.fn(),
    getNumberHistogramInterval: jest.fn(
      DatatableUtilitiesService.prototype.getNumberHistogramInterval
    ),
    hasPrecisionError: jest.fn(DatatableUtilitiesService.prototype.hasPrecisionError),
    isFilterable: jest.fn(),
    setFieldFormat: jest.fn(),
  } as unknown as jest.Mocked<DatatableUtilitiesService>;
}
