/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType, SupportedChartType } from '@kbn/agent-builder-common/tools/tool_result';
import type { ToolHandlerStandardReturn } from '@kbn/agent-builder-server/tools';
import type { AttachmentStateManager } from '@kbn/agent-builder-server/attachments';
import { detectChangePointsTool } from './detect_change_points';

// Ensure the tool never imports from the browser-only change-point-chart-viewer package
jest.mock('@kbn/change-point-chart-viewer', () => {
  throw new Error('@kbn/change-point-chart-viewer must not be imported in server code');
});

const SIMPLE_CHANGE_POINT_QUERY =
  'FROM logs-* | STATS avg_bytes = AVG(bytes) BY bucket = BUCKET(@timestamp, 1 day) | SORT bucket | CHANGE_POINT avg_bytes ON bucket';

const BY_ENTITY_QUERY =
  'FROM logs-* | STATS avg_bytes = AVG(bytes) BY host, bucket = BUCKET(@timestamp, 1 day) | SORT bucket | CHANGE_POINT avg_bytes ON bucket BY host';

const mockEsClient = {
  asCurrentUser: {} as any,
};

const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const createMockAttachments = (addImpl?: jest.Mock): AttachmentStateManager =>
  ({
    getActive: () => [],
    add: addImpl ?? jest.fn(),
  } as unknown as AttachmentStateManager);

jest.mock('@kbn/agent-builder-genai-utils/tools/utils/esql', () => ({
  executeEsql: jest.fn(),
  buildTimeRangeParams: jest.fn().mockReturnValue([]),
  interpolateEsqlQuery: jest.fn((q: string) => q),
}));

import {
  executeEsql,
  buildTimeRangeParams,
  interpolateEsqlQuery,
} from '@kbn/agent-builder-genai-utils/tools/utils/esql';

const mockExecuteEsql = executeEsql as jest.MockedFunction<typeof executeEsql>;

/** Helper that narrows the union return type to the results-bearing branch. */
const callTool = async (
  params: Parameters<ReturnType<typeof detectChangePointsTool>['handler']>[0],
  attachments?: AttachmentStateManager
): Promise<ToolHandlerStandardReturn> => {
  const tool = detectChangePointsTool();
  const result = await tool.handler(params, {
    esClient: mockEsClient,
    logger: mockLogger,
    attachments: attachments ?? createMockAttachments(),
  } as any);
  return result as ToolHandlerStandardReturn;
};

/** Column stubs for ES|QL result mocks — include the required `type` field. */
const col = (name: string) => ({ name, type: 'keyword' as const });

describe('detectChangePointsTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (buildTimeRangeParams as jest.Mock).mockReturnValue([]);
    (interpolateEsqlQuery as jest.Mock).mockImplementation((q: string) => q);
  });

  describe('max_charts schema validation', () => {
    const tool = detectChangePointsTool();

    it('rejects zero', () => {
      expect(() => tool.schema.parse({ query: 'FROM x', max_charts: 0 })).toThrow();
    });

    it('rejects negative values', () => {
      expect(() => tool.schema.parse({ query: 'FROM x', max_charts: -1 })).toThrow();
    });

    it('rejects values above 10', () => {
      expect(() => tool.schema.parse({ query: 'FROM x', max_charts: 11 })).toThrow();
    });

    it('rejects non-integer values', () => {
      expect(() => tool.schema.parse({ query: 'FROM x', max_charts: 1.5 })).toThrow();
    });

    it('accepts valid values 1–10', () => {
      expect(() => tool.schema.parse({ query: 'FROM x', max_charts: 1 })).not.toThrow();
      expect(() => tool.schema.parse({ query: 'FROM x', max_charts: 10 })).not.toThrow();
    });

    it('defaults to 6 when omitted', () => {
      const parsed = tool.schema.parse({ query: 'FROM x' });
      expect(parsed.max_charts).toBe(6);
    });
  });

  it('rejects a query without a CHANGE_POINT command', async () => {
    const result = await callTool({
      query: 'FROM logs-* | STATS count = COUNT(*)',
      max_charts: 6,
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe(ToolResultType.error);
  });

  it('returns ToolResultType.other when no change points are detected', async () => {
    // Real CHANGE_POINT result: full time series, all rows have null type/pvalue
    const columns = [col('bucket'), col('avg_bytes'), col('type'), col('pvalue')];
    const values = [
      ['2024-01-01T00:00:00Z', 500, null, null],
      ['2024-01-02T00:00:00Z', 510, null, null],
      ['2024-01-03T00:00:00Z', 490, null, null],
    ];
    mockExecuteEsql.mockResolvedValue({ columns, values });

    const result = await callTool({ query: SIMPLE_CHANGE_POINT_QUERY, max_charts: 6 });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe(ToolResultType.other);
    expect((result.results[0].data as any).message).toMatch(/no change points/i);
  });

  it('returns a single visualization for a query with no BY clause', async () => {
    // Real shape: full time series; only the one row with a non-null type is a change point
    const columns = [col('bucket'), col('avg_bytes'), col('type'), col('pvalue')];
    const values = [
      ['2024-01-13T00:00:00Z', 900, null, null],
      ['2024-01-14T00:00:00Z', 950, null, null],
      ['2024-01-15T00:00:00Z', 1000, 'step_change', 0.001],
      ['2024-01-16T00:00:00Z', 1050, null, null],
    ];
    mockExecuteEsql.mockResolvedValue({ columns, values });

    const result = await callTool({ query: SIMPLE_CHANGE_POINT_QUERY, max_charts: 6 });
    expect(result.results).toHaveLength(1);

    const vizResult = result.results[0];
    expect(vizResult.type).toBe(ToolResultType.visualization);
    expect((vizResult.data as any).chart_type).toBe(SupportedChartType.XY);

    const layers = (vizResult.data as any).visualization.layers;
    expect(layers).toHaveLength(2);

    const dataLayer = layers[0];
    expect(dataLayer.type).toBe('area');
    expect(dataLayer.x.column).toBe('bucket');
    expect(dataLayer.y[0].column).toBe('avg_bytes');

    const annotationLayer = layers[1];
    expect(annotationLayer.type).toBe('annotations');
    expect(annotationLayer.events).toHaveLength(1);
    expect(annotationLayer.events[0].label).toContain('step_change');
  });

  it('returns per-entity visualizations for a query with BY columns', async () => {
    const columns = [col('host'), col('bucket'), col('avg_bytes'), col('type'), col('pvalue')];
    const values = [
      ['host-a', '2024-01-15T00:00:00Z', 1000, 'step_change', 0.001],
      ['host-b', '2024-01-20T00:00:00Z', 2000, 'distribution_change', 0.01],
    ];
    mockExecuteEsql.mockResolvedValue({ columns, values });

    const result = await callTool({ query: BY_ENTITY_QUERY, max_charts: 6 });
    expect(result.results).toHaveLength(2);
    result.results.forEach((r) => {
      expect(r.type).toBe(ToolResultType.visualization);
    });

    const titles = result.results.map((r) => (r.data as any).visualization.title);
    expect(titles.some((t: string) => t.includes('host-a'))).toBe(true);
    expect(titles.some((t: string) => t.includes('host-b'))).toBe(true);
  });

  it('respects max_charts cap', async () => {
    const columns = [col('host'), col('bucket'), col('avg_bytes'), col('type'), col('pvalue')];
    const values = Array.from({ length: 10 }, (_, i) => [
      `host-${i}`,
      `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      1000 + i,
      'step_change',
      0.001,
    ]);
    mockExecuteEsql.mockResolvedValue({ columns, values });

    const result = await callTool({ query: BY_ENTITY_QUERY, max_charts: 3 });
    // 3 visualization results + 1 truncation notice
    const vizResults = result.results.filter((r) => r.type === ToolResultType.visualization);
    expect(vizResults.length).toBeLessThanOrEqual(3);
  });

  it('scopes annotations to each entity — no cross-entity bleed', async () => {
    // Real shape: full time series rows; only rows with non-null type are change points.
    // host-a has two change points; host-b has one. Null-type rows must be discarded.
    const columns = [col('host'), col('bucket'), col('avg_bytes'), col('type'), col('pvalue')];
    const values = [
      ['host-a', '2024-01-09T00:00:00Z', 900, null, null],
      ['host-a', '2024-01-10T00:00:00Z', 1000, 'step_change', 0.001],
      ['host-a', '2024-01-11T00:00:00Z', 1010, null, null],
      ['host-a', '2024-01-20T00:00:00Z', 1200, 'distribution_change', 0.005],
      ['host-b', '2024-01-14T00:00:00Z', 1900, null, null],
      ['host-b', '2024-01-15T00:00:00Z', 2000, 'step_change', 0.002],
      ['host-b', '2024-01-16T00:00:00Z', 2100, null, null],
    ];
    mockExecuteEsql.mockResolvedValue({ columns, values });

    const result = await callTool({ query: BY_ENTITY_QUERY, max_charts: 6 });
    expect(result.results).toHaveLength(2);

    const chartA = result.results.find((r) =>
      (r.data as any).visualization.title.includes('host-a')
    );
    const chartB = result.results.find((r) =>
      (r.data as any).visualization.title.includes('host-b')
    );

    expect(chartA).toBeDefined();
    expect(chartB).toBeDefined();

    // host-a's chart must have exactly its two change points and no others
    const annotationsA = (chartA!.data as any).visualization.layers[1].events;
    expect(annotationsA).toHaveLength(2);
    const timestampsA = annotationsA.map((e: { timestamp: string }) => e.timestamp);
    expect(timestampsA).toContain('2024-01-10T00:00:00Z');
    expect(timestampsA).toContain('2024-01-20T00:00:00Z');
    expect(timestampsA).not.toContain('2024-01-15T00:00:00Z'); // host-b's

    // host-b's chart must have exactly its one change point and no others
    const annotationsB = (chartB!.data as any).visualization.layers[1].events;
    expect(annotationsB).toHaveLength(1);
    expect(annotationsB[0].timestamp).toBe('2024-01-15T00:00:00Z');
  });

  it('appends entity filters and sets the correct x column for BY-column queries', async () => {
    const columns = [col('host'), col('bucket'), col('avg_bytes'), col('type'), col('pvalue')];
    const values = [['web-01', '2024-01-15T00:00:00Z', 1000, 'step_change', 0.001]];
    mockExecuteEsql.mockResolvedValue({ columns, values });

    const result = await callTool({ query: BY_ENTITY_QUERY, max_charts: 6 });
    expect(result.results).toHaveLength(1);

    const dataLayer = (result.results[0].data as any).visualization.layers[0];
    expect(dataLayer.data_source.query).toContain('WHERE');
    expect(dataLayer.data_source.query).toContain('web-01');
    expect(dataLayer.x.column).toBe('bucket');
  });

  it('handles aliased output column names (CHANGE_POINT … AS change_type, p_value)', async () => {
    const aliasQuery =
      'FROM logs-* | STATS avg_bytes = AVG(bytes) BY bucket = BUCKET(@timestamp, 1 day) | CHANGE_POINT avg_bytes ON bucket AS change_type, p_value';
    const columns = [col('bucket'), col('avg_bytes'), col('change_type'), col('p_value')];
    const values = [['2024-01-15T00:00:00Z', 1000, 'step_change', 0.001]];
    mockExecuteEsql.mockResolvedValue({ columns, values });

    const result = await callTool({ query: aliasQuery, max_charts: 6 });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe(ToolResultType.visualization);

    const annotations = (result.results[0].data as any).visualization.layers[1].events;
    expect(annotations[0].label).toContain('step_change');
  });

  it('returns ToolResultType.error when ES|QL execution fails', async () => {
    mockExecuteEsql.mockRejectedValue(new Error('ES|QL execution failed'));

    const result = await callTool({ query: SIMPLE_CHANGE_POINT_QUERY, max_charts: 6 });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe(ToolResultType.error);
    expect((result.results[0].data as any).message).toContain('ES|QL execution failed');
  });

  it('save_charts: false is the default and no attachment is created', async () => {
    const columns = [col('bucket'), col('avg_bytes'), col('type'), col('pvalue')];
    const values = [['2024-01-15T00:00:00Z', 1000, 'step_change', 0.001]];
    mockExecuteEsql.mockResolvedValue({ columns, values });

    const mockAdd = jest.fn();
    const result = await callTool(
      { query: SIMPLE_CHANGE_POINT_QUERY, max_charts: 6 },
      createMockAttachments(mockAdd)
    );

    expect(mockAdd).not.toHaveBeenCalled();
    expect((result.results[0].data as any).attachment_id).toBeUndefined();
  });

  it('save_charts: true persists an attachment and returns attachment_id', async () => {
    const columns = [col('bucket'), col('avg_bytes'), col('type'), col('pvalue')];
    const values = [['2024-01-15T00:00:00Z', 1000, 'step_change', 0.001]];
    mockExecuteEsql.mockResolvedValue({ columns, values });

    const mockAdd = jest.fn().mockResolvedValue({ id: 'att-123' });
    const result = await callTool(
      { query: SIMPLE_CHANGE_POINT_QUERY, max_charts: 6, save_charts: true },
      createMockAttachments(mockAdd)
    );

    expect(mockAdd).toHaveBeenCalledTimes(1);
    const addCall = mockAdd.mock.calls[0][0];
    expect(addCall.type).toBe('visualization');
    expect(addCall.data.query).toMatch(/change point analysis/i);
    expect((result.results[0].data as any).attachment_id).toBe('att-123');
  });

  it('appends a truncation notice when entity count exceeds max_charts', async () => {
    const columns = [col('host'), col('bucket'), col('avg_bytes'), col('type'), col('pvalue')];
    const values = Array.from({ length: 5 }, (_, i) => [
      `host-${i}`,
      `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      1000 + i,
      'step_change',
      0.001,
    ]);
    mockExecuteEsql.mockResolvedValue({ columns, values });

    const result = await callTool({ query: BY_ENTITY_QUERY, max_charts: 3 });
    // 3 visualization results + 1 truncation notice
    expect(result.results).toHaveLength(4);
    const notice = result.results[result.results.length - 1];
    expect(notice.type).toBe(ToolResultType.other);
    expect((notice.data as any).message).toMatch(/capped at 3/i);
    expect((notice.data as any).message).toMatch(/2 additional/i);
  });

  it('coerces epoch-number timestamps to ISO strings in annotation events', async () => {
    const epochMs = new Date('2024-01-15T00:00:00Z').getTime();
    const columns = [col('bucket'), col('avg_bytes'), col('type'), col('pvalue')];
    const values = [[epochMs, 1000, 'step_change', 0.001]];
    mockExecuteEsql.mockResolvedValue({ columns, values });

    const result = await callTool({ query: SIMPLE_CHANGE_POINT_QUERY, max_charts: 6 });
    const event = (result.results[0].data as any).visualization.layers[1].events[0];
    expect(event.timestamp).toBe('2024-01-15T00:00:00.000Z');
  });
});
