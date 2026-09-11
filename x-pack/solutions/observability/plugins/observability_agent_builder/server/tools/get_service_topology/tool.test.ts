/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import { createGetServiceTopologyTool } from './tool';
import { getToolHandler } from './handler';

jest.mock('./handler');

const mockGetToolHandler = getToolHandler as jest.MockedFunction<typeof getToolHandler>;

const SERVICE_TO_SERVICE = {
  source: { 'service.name': 'checkout' },
  target: { 'service.name': 'payment' },
  metrics: undefined,
};

const SERVICE_TO_EXTERNAL = {
  source: { 'service.name': 'checkout' },
  target: {
    'span.destination.service.resource': 'postgresql',
    'span.type': 'db',
    'span.subtype': 'postgresql',
  },
  metrics: undefined,
};

function setup() {
  const getData = jest.fn().mockResolvedValue({ payment: { alertsCount: 2 } });
  const logger = { debug: jest.fn(), error: jest.fn() } as any;

  const tool = createGetServiceTopologyTool({
    core: {} as any,
    plugins: {} as any,
    dataRegistry: { getData } as any,
    logger,
  }) as BuiltinToolDefinition;

  // `ToolHandlerReturn` is a union; these tools always return the `results` shape.
  type ToolRun = Promise<{ results: Array<{ type: string; data: Record<string, unknown> }> }>;

  const run = (params: Record<string, unknown> = {}) =>
    tool.handler(
      {
        serviceName: 'checkout',
        direction: 'both',
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-01-01T01:00:00.000Z',
        ...params,
      } as any,
      { request: {} } as any
    ) as ToolRun;

  return { run, getData, logger };
}

describe('get_service_topology tool — nodeMetadata enrichment', () => {
  beforeEach(() => {
    mockGetToolHandler.mockReset();
    mockGetToolHandler.mockResolvedValue({ connections: [SERVICE_TO_SERVICE] } as any);
  });

  it('forwards environment and kuery so badge counts match the user’s view', async () => {
    const { run, getData } = setup();

    await run({ environment: 'production', kuery: 'service.name: "checkout"' });

    expect(getData).toHaveBeenCalledWith('servicesAlertsAndSlo', {
      request: {},
      serviceNames: ['checkout', 'payment'],
      environment: 'production',
      kuery: 'service.name: "checkout"',
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-01-01T01:00:00.000Z',
    });
  });

  it('leaves environment and kuery undefined when the caller omits them', async () => {
    const { run, getData } = setup();

    await run();

    expect(getData).toHaveBeenCalledWith(
      'servicesAlertsAndSlo',
      expect.objectContaining({ environment: undefined, kuery: undefined })
    );
  });

  it('returns the enrichment as nodeMetadata alongside the connections', async () => {
    const { run } = setup();

    const { results } = await run({ environment: 'production' });

    expect(results[0]).toMatchObject({
      type: ToolResultType.other,
      data: {
        connections: [SERVICE_TO_SERVICE],
        nodeMetadata: { payment: { alertsCount: 2 } },
      },
    });
  });

  it('collects service names only, ignoring external dependency nodes', async () => {
    mockGetToolHandler.mockResolvedValue({ connections: [SERVICE_TO_EXTERNAL] } as any);
    const { run, getData } = setup();

    await run();

    expect(getData).toHaveBeenCalledWith(
      'servicesAlertsAndSlo',
      expect.objectContaining({ serviceNames: ['checkout'] })
    );
  });

  it('skips enrichment when the topology has no connections', async () => {
    mockGetToolHandler.mockResolvedValue({ connections: [] } as any);
    const { run, getData } = setup();

    const { results } = await run();

    expect(getData).not.toHaveBeenCalled();
    expect(results[0].data).toEqual({ connections: [] });
  });

  it('still returns the topology when enrichment fails (best-effort)', async () => {
    const { run, getData, logger } = setup();
    getData.mockRejectedValue(new Error('slo client unavailable'));

    const { results } = await run({ environment: 'production' });

    expect(results[0]).toMatchObject({
      type: ToolResultType.other,
      data: { connections: [SERVICE_TO_SERVICE] },
    });
    expect(results[0].data).not.toHaveProperty('nodeMetadata');
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Failed to enrich topology with badge metadata')
    );
  });
});

describe('get_service_topology tool — schema', () => {
  it('accepts optional environment and kuery', () => {
    const tool = createGetServiceTopologyTool({
      core: {} as any,
      plugins: {} as any,
      dataRegistry: {} as any,
      logger: { debug: jest.fn(), error: jest.fn() } as any,
    }) as BuiltinToolDefinition;

    const parsed = tool.schema.parse({
      serviceName: 'checkout',
      environment: 'production',
      kuery: 'service.name: "checkout"',
    });

    expect(parsed).toMatchObject({
      environment: 'production',
      kuery: 'service.name: "checkout"',
    });

    // Both are optional — omitting them must still parse (zod drops the keys).
    const withoutScope = tool.schema.parse({ serviceName: 'checkout' });
    expect(withoutScope).not.toHaveProperty('environment');
    expect(withoutScope).not.toHaveProperty('kuery');
    expect(withoutScope).toMatchObject({ serviceName: 'checkout', start: 'now-1h', end: 'now' });
  });
});
