/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DashboardOperation } from './operations';
import { type DashboardOperationFailureType } from './failure_types';

/**
 * Failure record for tracking panel operation errors.
 */
export interface PanelFailure {
  type: DashboardOperationFailureType;
  identifier: string;
  error: string;
}

/**
 * Type-safe extraction of error message from unknown error.
 */
export const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

const hasNonEmptyValue = (value: string | undefined): value is string =>
  value !== undefined && value.trim().length > 0;

const hasRequiredCreateTitleOperation = (operations: DashboardOperation[]): boolean =>
  operations.some(
    (operation) => operation.operation === 'set_metadata' && hasNonEmptyValue(operation.title)
  );

const hasBlankTitleUpdate = (operations: DashboardOperation[]): boolean =>
  operations.some((operation) => {
    if (operation.operation !== 'set_metadata') {
      return false;
    }

    return operation.title !== undefined && !hasNonEmptyValue(operation.title);
  });

export const hasValidCreateMetadataOperations = (operations: DashboardOperation[]): boolean =>
  hasRequiredCreateTitleOperation(operations) && !hasBlankTitleUpdate(operations);
