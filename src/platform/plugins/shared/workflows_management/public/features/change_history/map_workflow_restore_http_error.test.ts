/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { mapWorkflowRestoreHttpError } from './map_workflow_restore_http_error';

describe('mapWorkflowRestoreHttpError', () => {
  it('maps HISTORY_DISABLED from Kibana attributes.code', () => {
    const error = mapWorkflowRestoreHttpError({
      response: { status: 400 },
      body: {
        message: 'Change history is disabled.',
        attributes: { code: 'HISTORY_DISABLED' },
      },
    });

    expect(error.message).toBe('Change history is disabled.');
    expect((error as Error & { body: { code: string } }).body).toEqual({
      code: 'HISTORY_DISABLED',
      message: 'Change history is disabled.',
    });
  });

  it('maps a top-level structured code', () => {
    const error = mapWorkflowRestoreHttpError({
      response: { status: 409 },
      body: {
        code: 'RESTORE_CONFLICT',
        message: 'Object was updated by another user.',
      },
    });

    expect((error as Error & { body: { code: string } }).body.code).toBe('RESTORE_CONFLICT');
  });

  it('maps validation failures from validationErrors on 400 responses', () => {
    const error = mapWorkflowRestoreHttpError({
      response: { status: 400 },
      body: {
        message: 'YAML validation failed.',
        validationErrors: ['invalid step'],
      },
    });

    expect((error as Error & { body: { code: string } }).body.code).toBe('RESTORE_VALIDATION');
  });

  it('uses UNKNOWN for unlabeled 400 responses instead of RESTORE_VALIDATION', () => {
    const error = mapWorkflowRestoreHttpError({
      response: { status: 400 },
      body: {
        message: 'Change history is disabled.',
      },
    });

    expect((error as Error & { body: { code: string } }).body.code).toBe('UNKNOWN');
  });

  it('falls back to HTTP status when no structured code is present', () => {
    const error = mapWorkflowRestoreHttpError({
      response: { status: 403 },
      body: { message: 'Forbidden' },
    });

    expect((error as Error & { body: { code: string } }).body.code).toBe('FORBIDDEN');
  });

  it('returns non-http errors unchanged', () => {
    const original = new Error('local failure');
    expect(mapWorkflowRestoreHttpError(original)).toBe(original);
  });
});
