/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BulkOperationType, BulkResponse } from '@elastic/elasticsearch/lib/api/types';

export type { PaginatedResponse } from '../../../common/pagination';

export interface BulkCreateOptions {
  throwOnFail?: boolean;
}

export class BulkCreateOperationError extends Error {
  constructor(message: string, public response: BulkResponse) {
    super(message);
    this.name = 'BulkCreateOperationError';
  }
}

export function throwOnBulkCreateErrors(response: BulkResponse): void {
  const erroredItems = response.items.filter((item) => {
    const operation = Object.keys(item)[0] as BulkOperationType;
    return item[operation]?.error;
  });

  if (erroredItems.length > 0) {
    throw new BulkCreateOperationError(
      `Bulk create operation failed for ${erroredItems.length} out of ${
        response.items.length
      } items: ${JSON.stringify(erroredItems)}`,
      response
    );
  }
}

export interface CommonSearchOptions {
  /** ISO 8601 formatted datetime */
  from?: string;
  /** ISO 8601 formatted datetime */
  to?: string;
}

export interface PaginatedSearchOptions extends CommonSearchOptions {
  page?: number;
  perPage?: number;
}
