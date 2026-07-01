/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { caseAttachmentDataSchema, casesAttachmentDataSchema } from './attachment_schemas';

const validCase = {
  id: 'abc',
  incremental_id: 125,
  title: 'Threat Intel Filebeat',
  description: 'low-severity alert fired',
  status: 'in-progress',
  severity: 'critical',
  totalAlerts: 3,
  totalComment: 5,
  tags: ['Phishing', 'User Alert'],
  owner: 'securitySolution',
  assignees: [{ uid: 'u1' }],
  created_at: '2020-02-19T23:06:33.798Z',
  updated_at: '2020-02-19T23:06:33.798Z',
  total_observables: 1,
};

describe('caseAttachmentDataSchema', () => {
  it('parses a valid case payload', () => {
    const result = caseAttachmentDataSchema.safeParse(validCase);
    expect(result.success).toBe(true);
  });

  it('accepts optional url and totalAttachments', () => {
    const result = caseAttachmentDataSchema.safeParse({
      ...validCase,
      url: 'https://example/case/abc',
      totalAttachments: 8,
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown severity', () => {
    const result = caseAttachmentDataSchema.safeParse({ ...validCase, severity: 'extreme' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown owner', () => {
    const result = caseAttachmentDataSchema.safeParse({ ...validCase, owner: 'something' });
    expect(result.success).toBe(false);
  });

  it('rejects missing required field', () => {
    const { title, ...partial } = validCase;
    const result = caseAttachmentDataSchema.safeParse(partial);
    expect(result.success).toBe(false);
  });
});

describe('casesAttachmentDataSchema', () => {
  it('parses a valid cases list payload', () => {
    const result = casesAttachmentDataSchema.safeParse({
      cases: [validCase, { ...validCase, id: 'def', incremental_id: 126 }],
      total: 2,
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty list', () => {
    const result = casesAttachmentDataSchema.safeParse({ cases: [], total: 0 });
    expect(result.success).toBe(true);
  });

  it('rejects more than 20 cases', () => {
    const result = casesAttachmentDataSchema.safeParse({
      cases: Array.from({ length: 21 }, (_, i) => ({ ...validCase, id: `c${i}` })),
      total: 21,
    });
    expect(result.success).toBe(false);
  });
});
