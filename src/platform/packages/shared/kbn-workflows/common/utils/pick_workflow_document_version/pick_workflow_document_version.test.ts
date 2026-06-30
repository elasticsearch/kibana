/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  isValidWorkflowDocumentVersion,
  pickWorkflowDocumentVersion,
} from './pick_workflow_document_version';

describe('isValidWorkflowDocumentVersion', () => {
  it('accepts finite numbers', () => {
    expect(isValidWorkflowDocumentVersion(4)).toBe(true);
    expect(isValidWorkflowDocumentVersion(0)).toBe(true);
  });

  it('rejects non-numeric values', () => {
    expect(isValidWorkflowDocumentVersion(Number.NaN)).toBe(false);
    expect(isValidWorkflowDocumentVersion('4')).toBe(false);
    expect(isValidWorkflowDocumentVersion(undefined)).toBe(false);
  });
});

describe('pickWorkflowDocumentVersion', () => {
  it('returns version when present and numeric', () => {
    expect(pickWorkflowDocumentVersion({ version: 4 })).toEqual({ version: 4 });
  });

  it('omits version when absent or invalid', () => {
    expect(pickWorkflowDocumentVersion({})).toEqual({});
    expect(pickWorkflowDocumentVersion({ version: Number.NaN })).toEqual({});
    expect(pickWorkflowDocumentVersion({ version: '4' })).toEqual({});
  });
});
