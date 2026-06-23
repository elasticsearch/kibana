/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/** Single workflow change-history entry. */
export interface WorkflowHistoryItem {
  timestamp: string;
  id: string;
  user: { id?: string; name: string } | null;
  action: string;
  version?: number;
  workflow: {
    yaml: string;
  };
}

export interface WorkflowChangesHistoryResponse {
  page: number;
  perPage: number;
  total: number;
  items: WorkflowHistoryItem[];
}
