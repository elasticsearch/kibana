/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock, httpServerMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { CaseSeverity, CaseStatuses } from '../../../common/types/domain';
import { createCasesClientMock, type CasesClientMock } from '../../client/mocks';
import { searchCasesTool } from './search_cases';
import type { ToolHandlerContext } from '@kbn/agent-builder-server/tools';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const buildCase = (overrides: Record<string, unknown> = {}) => ({
  id: 'case-1',
  incremental_id: 10,
  title: 'Test Case',
  description: 'A test case',
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
  ...overrides,
});

const buildMockAttachments = () => ({
  add: jest.fn().mockResolvedValue({ id: 'att-1' }),
  get: jest.fn(),
  delete: jest.fn(),
  update: jest.fn(),
  list: jest.fn(),
});

const buildToolContext = (overrides: Partial<ToolHandlerContext> = {}): ToolHandlerContext => {
  const request = httpServerMock.createKibanaRequest();
  return {
    request,
    spaceId: 'default',
    logger: loggingSystemMock.createLogger(),
    attachments: buildMockAttachments(),
    ...overrides,
  } as unknown as ToolHandlerContext;
};

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function buildTool(casesClientMock: CasesClientMock) {
  const coreSetup = coreMock.createSetup();
  const coreStart = coreMock.createStart();
  coreSetup.getStartServices.mockResolvedValue([coreStart, {}, {}]);

  const getCasesClientFn = jest.fn().mockResolvedValue(casesClientMock);
  const tool = searchCasesTool(coreSetup, getCasesClientFn);
  return { tool, getCasesClientFn };
}

// ---------------------------------------------------------------------------
// Tests: missing required fields return error responses
// ---------------------------------------------------------------------------

describe('searchCasesTool handler — missing required fields', () => {
  let casesClient: CasesClientMock;

  beforeEach(() => {
    casesClient = createCasesClientMock();
  });

  it('returns error when case_id is missing in get mode', async () => {
    const { tool } = buildTool(casesClient);
    const result = await tool.handler({ mode: 'get' } as never, buildToolContext());
    expect('results' in result).toBe(true);
    const { results } = result as { results: Array<{ type: string }> };
    expect(results[0].type).toBe('error');
  });

  it('returns error when case_ids is missing in bulk_get mode', async () => {
    const { tool } = buildTool(casesClient);
    const result = await tool.handler({ mode: 'bulk_get' } as never, buildToolContext());
    const { results } = result as { results: Array<{ type: string }> };
    expect(results[0].type).toBe('error');
  });

  it('returns error when similar_to_case_id is missing in similar mode', async () => {
    const { tool } = buildTool(casesClient);
    const result = await tool.handler({ mode: 'similar' } as never, buildToolContext());
    const { results } = result as { results: Array<{ type: string }> };
    expect(results[0].type).toBe('error');
  });

  it('returns error when alert_ids is missing in by_alert mode', async () => {
    const { tool } = buildTool(casesClient);
    const result = await tool.handler({ mode: 'by_alert' } as never, buildToolContext());
    const { results } = result as { results: Array<{ type: string }> };
    expect(results[0].type).toBe('error');
  });

  it('returns error when owner is missing in search mode', async () => {
    const { tool } = buildTool(casesClient);
    const result = await tool.handler({ mode: 'search' } as never, buildToolContext());
    const { results } = result as { results: Array<{ type: string }> };
    expect(results[0].type).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// Tests: get mode — happy path
// ---------------------------------------------------------------------------

describe('searchCasesTool handler — get mode', () => {
  it('calls cases.get and emits a single-case attachment', async () => {
    const casesClient = createCasesClientMock();
    const theCase = buildCase();
    casesClient.cases.get.mockResolvedValue(theCase as never);

    const { tool } = buildTool(casesClient);
    const attachments = buildMockAttachments();
    const result = await tool.handler(
      { mode: 'get', case_id: 'case-1' } as never,
      buildToolContext({ attachments: attachments as never })
    );

    expect(casesClient.cases.get).toHaveBeenCalledWith({ id: 'case-1', includeComments: false });
    expect(attachments.add).toHaveBeenCalledTimes(1);
    const { results } = result as unknown as { results: Array<{ data: Record<string, unknown> }> };
    expect(results[0].data.attachment_ids).toEqual(['att-1']);
  });
});

// ---------------------------------------------------------------------------
// Tests: bulk_get mode — happy path + truncation
// ---------------------------------------------------------------------------

describe('searchCasesTool handler — bulk_get mode', () => {
  it('calls cases.bulkGet and emits cases attachment', async () => {
    const casesClient = createCasesClientMock();
    const cases = [buildCase({ id: 'c1' }), buildCase({ id: 'c2' })];
    casesClient.cases.bulkGet.mockResolvedValue({ cases, errors: [] } as never);

    const { tool } = buildTool(casesClient);
    const attachments = buildMockAttachments();
    const result = await tool.handler(
      { mode: 'bulk_get', case_ids: ['c1', 'c2'] } as never,
      buildToolContext({ attachments: attachments as never })
    );

    expect(casesClient.cases.bulkGet).toHaveBeenCalledWith({ ids: ['c1', 'c2'] });
    expect(attachments.add).toHaveBeenCalledTimes(1);
    const { results } = result as unknown as { results: Array<{ data: Record<string, unknown> }> };
    expect(results[0].data.attachment_ids).toEqual(['att-1']);
  });

  it('slices case_ids to 10 when more than 10 are provided', async () => {
    const casesClient = createCasesClientMock();
    casesClient.cases.bulkGet.mockResolvedValue({ cases: [], errors: [] } as never);

    const { tool } = buildTool(casesClient);
    const ids = Array.from({ length: 15 }, (_, i) => `c${i}`);
    await tool.handler({ mode: 'bulk_get', case_ids: ids } as never, buildToolContext());

    const calledWith = (casesClient.cases.bulkGet as jest.Mock).mock.calls[0][0];
    expect(calledWith.ids).toHaveLength(10);
  });
});

// ---------------------------------------------------------------------------
// Tests: by_alert mode — uses bulkGet, not individual gets
// ---------------------------------------------------------------------------

describe('searchCasesTool handler — by_alert mode', () => {
  it('uses bulkGet (not individual get) to fetch related cases', async () => {
    const casesClient = createCasesClientMock();
    casesClient.cases.getCasesByAlertID.mockResolvedValue([
      { id: 'c1', title: 'Case 1', totalComment: 0, createdAt: '', totals: {} as never },
    ] as never);
    casesClient.cases.bulkGet.mockResolvedValue({
      cases: [buildCase({ id: 'c1' })],
      errors: [],
    } as never);

    const { tool } = buildTool(casesClient);
    await tool.handler({ mode: 'by_alert', alert_ids: ['alert-1'] } as never, buildToolContext());

    expect(casesClient.cases.get).not.toHaveBeenCalled();
    expect(casesClient.cases.bulkGet).toHaveBeenCalledWith({ ids: ['c1'] });
  });

  it('deduplicates cases when multiple alert IDs point to the same case', async () => {
    const casesClient = createCasesClientMock();
    const relatedCase = {
      id: 'c1',
      title: 'Case 1',
      totalComment: 0,
      createdAt: '',
      totals: {} as never,
    };
    casesClient.cases.getCasesByAlertID.mockResolvedValue([relatedCase] as never);
    casesClient.cases.bulkGet.mockResolvedValue({
      cases: [buildCase({ id: 'c1' })],
      errors: [],
    } as never);

    const { tool } = buildTool(casesClient);
    await tool.handler(
      { mode: 'by_alert', alert_ids: ['alert-1', 'alert-2'] } as never,
      buildToolContext()
    );

    const bulkGetCall = (casesClient.cases.bulkGet as jest.Mock).mock.calls[0][0];
    expect(bulkGetCall.ids).toHaveLength(1);
    expect(bulkGetCall.ids[0]).toBe('c1');
  });

  it('returns empty result when no cases found', async () => {
    const casesClient = createCasesClientMock();
    casesClient.cases.getCasesByAlertID.mockResolvedValue([] as never);

    const { tool } = buildTool(casesClient);
    const result = await tool.handler(
      { mode: 'by_alert', alert_ids: ['alert-1'] } as never,
      buildToolContext()
    );

    const { results } = result as unknown as { results: Array<{ data: Record<string, unknown> }> };
    expect(results[0].data.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: search mode — perPage cap
// ---------------------------------------------------------------------------

describe('searchCasesTool handler — search mode', () => {
  it('caps perPage at 50 regardless of input', async () => {
    const casesClient = createCasesClientMock();
    casesClient.cases.find.mockResolvedValue({
      cases: [],
      total: 0,
      page: 1,
      per_page: 50,
      count_open_cases: 0,
      count_closed_cases: 0,
      count_in_progress_cases: 0,
    } as never);

    const { tool } = buildTool(casesClient);
    await tool.handler(
      { mode: 'search', owner: 'securitySolution', perPage: 200 } as never,
      buildToolContext()
    );

    const findCall = (casesClient.cases.find as jest.Mock).mock.calls[0][0];
    expect(findCall.perPage).toBe(50);
  });

  it('uses default perPage of 10 when not specified', async () => {
    const casesClient = createCasesClientMock();
    casesClient.cases.find.mockResolvedValue({
      cases: [],
      total: 0,
      page: 1,
      per_page: 10,
      count_open_cases: 0,
      count_closed_cases: 0,
      count_in_progress_cases: 0,
    } as never);

    const { tool } = buildTool(casesClient);
    await tool.handler({ mode: 'search', owner: 'securitySolution' } as never, buildToolContext());

    const findCall = (casesClient.cases.find as jest.Mock).mock.calls[0][0];
    expect(findCall.perPage).toBe(10);
  });

  it('includes pagination message when total exceeds page size', async () => {
    const casesClient = createCasesClientMock();
    const cases = [buildCase()];
    casesClient.cases.find.mockResolvedValue({
      cases,
      total: 42,
      page: 1,
      per_page: 10,
      count_open_cases: 0,
      count_closed_cases: 0,
      count_in_progress_cases: 0,
    } as never);

    const { tool } = buildTool(casesClient);
    const result = await tool.handler(
      { mode: 'search', owner: 'securitySolution' } as never,
      buildToolContext()
    );
    const { results } = result as unknown as { results: Array<{ data: Record<string, unknown> }> };
    expect(results[0].data.message).toMatch(/page 1 of/i);
  });
});
