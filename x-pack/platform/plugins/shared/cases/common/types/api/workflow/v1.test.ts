/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  CASES_WORKFLOW_EXECUTION_METADATA_SCHEMA_VERSION,
  CASES_WORKFLOW_EXECUTION_SOURCE,
  MAX_ATTACHMENT_ID_LENGTH,
  MAX_ATTACHMENT_TYPE_LENGTH,
  MAX_CASES_PER_WORKFLOW_RUN,
  MAX_WORKFLOW_INPUTS_BYTES,
} from '../../../constants';
import { CasesWorkflowExecutionMetadataSchema, RunCaseWorkflowRequestSchema } from './v1';

const validMetadata = {
  schemaVersion: CASES_WORKFLOW_EXECUTION_METADATA_SCHEMA_VERSION,
  source: CASES_WORKFLOW_EXECUTION_SOURCE,
  caseIds: ['case-1'],
  origin: {
    type: 'cases.case' as const,
    caseId: 'case-1',
  },
};

describe('CasesWorkflowExecutionMetadataSchema', () => {
  it('accepts valid Cases workflow execution metadata for a single case', () => {
    expect(CasesWorkflowExecutionMetadataSchema.parse(validMetadata)).toEqual(validMetadata);
  });

  it('accepts metadata with no origin (list-surface / bulk run)', () => {
    const { origin: _omitted, ...withoutOrigin } = validMetadata;
    expect(CasesWorkflowExecutionMetadataSchema.parse(withoutOrigin)).toEqual(withoutOrigin);
  });

  it(`accepts metadata with up to ${MAX_CASES_PER_WORKFLOW_RUN} case ids (the cap)`, () => {
    const ids = Array.from({ length: MAX_CASES_PER_WORKFLOW_RUN }, (_, i) => `case-${i}`);
    const result = CasesWorkflowExecutionMetadataSchema.safeParse({
      ...validMetadata,
      caseIds: ids,
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ['schema version', { ...validMetadata, schemaVersion: 2 }],
    ['source namespace', { ...validMetadata, source: 'securitySolution' }],
    ['empty caseIds array', { ...validMetadata, caseIds: [] }],
    [
      'origin type',
      {
        ...validMetadata,
        origin: { type: 'cases.comment', caseId: 'comment-1' },
      },
    ],
    [
      'legacy origin id field',
      {
        ...validMetadata,
        origin: { type: 'cases.case', id: 'case-1' },
      },
    ],
  ])('rejects an invalid %s', (_, metadata) => {
    expect(CasesWorkflowExecutionMetadataSchema.safeParse(metadata).success).toBe(false);
  });

  it(`rejects more than ${MAX_CASES_PER_WORKFLOW_RUN} case ids`, () => {
    const ids = Array.from({ length: MAX_CASES_PER_WORKFLOW_RUN + 1 }, (_, i) => `case-${i}`);
    expect(
      CasesWorkflowExecutionMetadataSchema.safeParse({ ...validMetadata, caseIds: ids }).success
    ).toBe(false);
  });

  it('rejects an invalid (empty) case id within the array', () => {
    expect(
      CasesWorkflowExecutionMetadataSchema.safeParse({
        ...validMetadata,
        caseIds: [''],
      }).success
    ).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(
      CasesWorkflowExecutionMetadataSchema.safeParse({ ...validMetadata, product: 'cases' }).success
    ).toBe(false);
  });
});

describe('RunCaseWorkflowRequestSchema', () => {
  const validBody = {
    caseIds: ['case-1'],
    inputs: {},
    origin: { type: 'cases.case' as const, caseId: 'case-1' },
  };

  it('accepts a valid single-case body', () => {
    expect(RunCaseWorkflowRequestSchema.safeParse(validBody).success).toBe(true);
  });

  it('accepts a body with no origin (list-surface / bulk run)', () => {
    const { origin: _omitted, ...bodyWithoutOrigin } = validBody;
    expect(RunCaseWorkflowRequestSchema.safeParse(bodyWithoutOrigin).success).toBe(true);
  });

  it('accepts a body with no origin and multiple caseIds', () => {
    const { origin: _omitted, ...bodyWithoutOrigin } = validBody;
    expect(
      RunCaseWorkflowRequestSchema.safeParse({
        ...bodyWithoutOrigin,
        caseIds: ['case-1', 'case-2', 'case-3'],
      }).success
    ).toBe(true);
  });

  it('accepts a cases.observable origin', () => {
    expect(
      RunCaseWorkflowRequestSchema.safeParse({
        ...validBody,
        origin: { type: 'cases.observable', caseId: 'case-1', observableId: 'obs-1' },
      }).success
    ).toBe(true);
  });

  it('accepts a cases.attachment origin', () => {
    expect(
      RunCaseWorkflowRequestSchema.safeParse({
        ...validBody,
        origin: {
          type: 'cases.attachment',
          caseId: 'case-1',
          attachmentType: 'security.alert',
          attachmentId: 'alert-1',
        },
      }).success
    ).toBe(true);
  });

  it('accepts a cases.attachments origin', () => {
    expect(
      RunCaseWorkflowRequestSchema.safeParse({
        ...validBody,
        origin: {
          type: 'cases.attachments',
          caseId: 'case-1',
          attachmentType: 'security.alert',
          attachmentIds: ['alert-1'],
        },
      }).success
    ).toBe(true);
  });

  it.each(['cases.alert', 'cases.alerts', 'cases.event'])(
    'rejects legacy request origin %s',
    (type) => {
      expect(
        RunCaseWorkflowRequestSchema.safeParse({
          ...validBody,
          origin: { type, caseId: 'case-1' },
        }).success
      ).toBe(false);
    }
  );

  it.each([
    [
      'attachment type',
      {
        type: 'cases.attachment',
        caseId: 'case-1',
        attachmentType: 'a'.repeat(MAX_ATTACHMENT_TYPE_LENGTH + 1),
        attachmentId: 'attachment-1',
      },
    ],
    [
      'attachment id',
      {
        type: 'cases.attachment',
        caseId: 'case-1',
        attachmentType: 'custom.reference',
        attachmentId: 'a'.repeat(MAX_ATTACHMENT_ID_LENGTH + 1),
      },
    ],
  ])('rejects an oversized %s', (_label, origin) => {
    expect(
      RunCaseWorkflowRequestSchema.safeParse({
        ...validBody,
        origin,
      }).success
    ).toBe(false);
  });

  it('rejects unknown keys on cases.case (strict per-variant)', () => {
    expect(
      RunCaseWorkflowRequestSchema.safeParse({
        ...validBody,
        origin: { type: 'cases.case', caseId: 'case-1', extraField: 'x' },
      }).success
    ).toBe(false);
  });

  it(`accepts exactly ${MAX_CASES_PER_WORKFLOW_RUN} case ids (the cap)`, () => {
    const ids = Array.from({ length: MAX_CASES_PER_WORKFLOW_RUN }, (_, i) => `case-${i}`);
    expect(RunCaseWorkflowRequestSchema.safeParse({ ...validBody, caseIds: ids }).success).toBe(
      true
    );
  });

  it('rejects an empty caseIds array', () => {
    expect(RunCaseWorkflowRequestSchema.safeParse({ ...validBody, caseIds: [] }).success).toBe(
      false
    );
  });

  it(`rejects more than ${MAX_CASES_PER_WORKFLOW_RUN} case ids`, () => {
    const ids = Array.from({ length: MAX_CASES_PER_WORKFLOW_RUN + 1 }, (_, i) => `case-${i}`);
    expect(RunCaseWorkflowRequestSchema.safeParse({ ...validBody, caseIds: ids }).success).toBe(
      false
    );
  });

  it('rejects duplicate case ids', () => {
    const result = RunCaseWorkflowRequestSchema.safeParse({
      ...validBody,
      caseIds: ['case-1', 'case-1'],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('caseIds must not contain duplicates.');
    }
  });

  it('rejects a case id that exceeds the maximum length', () => {
    expect(
      RunCaseWorkflowRequestSchema.safeParse({ ...validBody, caseIds: ['a'.repeat(1025)] }).success
    ).toBe(false);
  });

  it('rejects oversized workflow inputs', () => {
    const result = RunCaseWorkflowRequestSchema.safeParse({
      ...validBody,
      inputs: { value: 'a'.repeat(MAX_WORKFLOW_INPUTS_BYTES + 1) },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        `Workflow inputs cannot exceed ${MAX_WORKFLOW_INPUTS_BYTES} bytes.`
      );
    }
  });

  it('rejects unknown origin types', () => {
    expect(
      RunCaseWorkflowRequestSchema.safeParse({
        ...validBody,
        origin: { type: 'cases.bogus', id: 'x' },
      }).success
    ).toBe(false);
  });

  it('rejects unknown top-level body keys', () => {
    expect(
      RunCaseWorkflowRequestSchema.safeParse({
        ...validBody,
        unexpectedKey: true,
      }).success
    ).toBe(false);
  });
});
