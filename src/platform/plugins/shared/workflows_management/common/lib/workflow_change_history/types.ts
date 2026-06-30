/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { UpdatedWorkflowResponseDto } from '@kbn/workflows';

import type { WorkflowChangeHistoryActionType } from './constants';

export interface WorkflowRestoreMetadata {
  eventId: string;
  sequence?: number;
}

export interface RestoreWorkflowVersionResponseDto extends UpdatedWorkflowResponseDto {
  version: number;
}

export interface WorkflowHistoryItem {
  timestamp: string;
  id: string;
  user: { profileId?: string; name: string };
  action: WorkflowChangeHistoryActionType;
  version?: number;
  comment?: string;
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
