/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { emitFromStepResult, injectAttachmentIds, toCaseAttachmentData } from './emit_attachments';
import {
  CASE_ATTACHMENT_TYPE,
  CASES_ATTACHMENT_TYPE,
} from '../../../common/types/agent_builder/attachment_schemas';
import { CaseSeverity, CaseStatuses } from '../../../common/types/domain';
import type { Case } from '../../../common/types/domain';

const buildCase = (id = 'case-1'): Case =>
  ({
    id,
    incremental_id: 1,
    title: `Case ${id}`,
    description: 'desc',
    status: CaseStatuses.open,
    severity: CaseSeverity.LOW,
    owner: 'securitySolution',
    tags: [],
    assignees: [],
    totalAlerts: 0,
    totalComment: 0,
    total_observables: 0,
    connector: { id: 'none', name: 'none', type: '.none', fields: null },
    settings: { syncAlerts: false },
    created_at: '2026-01-01T00:00:00.000Z',
    created_by: { username: 'test', full_name: null, email: null },
    updated_at: null,
    updated_by: null,
    closed_at: null,
    closed_by: null,
    external_service: null,
    customFields: [],
    observables: [],
    category: null,
    duration: null,
    version: 'abc',
  } as unknown as Case);

const buildAttachments = () => ({
  add: jest.fn().mockResolvedValue({ id: 'att-1' }),
});

// ---------------------------------------------------------------------------
// emitFromStepResult
// ---------------------------------------------------------------------------

describe('emitFromStepResult', () => {
  it('emits a single-case attachment when result contains { case: Case }', async () => {
    const attachments = buildAttachments();
    const ids = await emitFromStepResult(attachments as never, {
      results: [{ data: { case: buildCase('c1') } }],
    });

    expect(attachments.add).toHaveBeenCalledTimes(1);
    const callArg = attachments.add.mock.calls[0][0];
    expect(callArg.type).toBe(CASE_ATTACHMENT_TYPE);
    expect(ids).toEqual(['att-1']);
  });

  it('emits a single-case attachment when { cases } contains exactly one case', async () => {
    const attachments = buildAttachments();
    const ids = await emitFromStepResult(attachments as never, {
      results: [{ data: { cases: [buildCase('c1')] } }],
    });

    expect(attachments.add).toHaveBeenCalledTimes(1);
    const callArg = attachments.add.mock.calls[0][0];
    expect(callArg.type).toBe(CASE_ATTACHMENT_TYPE);
    expect(ids).toEqual(['att-1']);
  });

  it('emits a cases-list attachment when { cases } contains multiple cases', async () => {
    const attachments = buildAttachments();
    const ids = await emitFromStepResult(attachments as never, {
      results: [{ data: { cases: [buildCase('c1'), buildCase('c2')] } }],
    });

    expect(attachments.add).toHaveBeenCalledTimes(1);
    const callArg = attachments.add.mock.calls[0][0];
    expect(callArg.type).toBe(CASES_ATTACHMENT_TYPE);
    expect(ids).toEqual(['att-1']);
  });

  it('returns empty array when result data has no case or cases field', async () => {
    const attachments = buildAttachments();
    const ids = await emitFromStepResult(attachments as never, {
      results: [{ data: { something_else: true } }],
    });

    expect(attachments.add).not.toHaveBeenCalled();
    expect(ids).toEqual([]);
  });

  it('returns empty array when results is empty', async () => {
    const attachments = buildAttachments();
    const ids = await emitFromStepResult(attachments as never, { results: [] });

    expect(attachments.add).not.toHaveBeenCalled();
    expect(ids).toEqual([]);
  });

  it('returns empty array when cases array is empty', async () => {
    const attachments = buildAttachments();
    const ids = await emitFromStepResult(attachments as never, {
      results: [{ data: { cases: [] } }],
    });

    expect(attachments.add).not.toHaveBeenCalled();
    expect(ids).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// injectAttachmentIds
// ---------------------------------------------------------------------------

describe('injectAttachmentIds', () => {
  const baseResult = () => ({
    results: [{ type: 'other' as const, data: { total: 1 } }],
  });

  it('adds attachment_ids to the first result data', () => {
    const result = injectAttachmentIds(baseResult(), ['att-1', 'att-2']);
    expect(result.results[0].data).toMatchObject({ attachment_ids: ['att-1', 'att-2'] });
  });

  it('preserves existing data fields', () => {
    const result = injectAttachmentIds(baseResult(), ['att-1']);
    expect(result.results[0].data).toMatchObject({ total: 1 });
  });

  it('returns the original result unchanged when attachment_ids is empty', () => {
    const original = baseResult();
    const result = injectAttachmentIds(original, []);
    expect(result).toBe(original);
  });

  it('does not mutate additional results beyond the first', () => {
    const twoResults = {
      results: [
        { type: 'other' as const, data: { first: true } },
        { type: 'other' as const, data: { second: true } },
      ],
    };
    const result = injectAttachmentIds(twoResults, ['att-1']);
    expect(result.results[1].data).toEqual({ second: true });
  });
});

// ---------------------------------------------------------------------------
// toCaseAttachmentData
// ---------------------------------------------------------------------------

describe('toCaseAttachmentData', () => {
  it('maps Case fields to CaseAttachmentData', () => {
    const c = buildCase('abc');
    const data = toCaseAttachmentData(c, 'https://example.com/case/abc');

    expect(data.id).toBe('abc');
    expect(data.title).toBe('Case abc');
    expect(data.status).toBe(CaseStatuses.open);
    expect(data.url).toBe('https://example.com/case/abc');
  });

  it('sets url to null when not provided', () => {
    const data = toCaseAttachmentData(buildCase(), null);
    expect(data.url).toBeNull();
  });

  it('maps connector name from connector object', () => {
    const c = {
      ...buildCase(),
      connector: { id: 'c1', name: 'Jira', type: '.jira', fields: null },
    } as unknown as Case;
    const data = toCaseAttachmentData(c);
    expect(data.connector_name).toBe('Jira');
  });

  it('sets connector_name to null when connector name is absent', () => {
    const data = toCaseAttachmentData(buildCase());
    expect(data.connector_name).toBe('none');
  });
});
