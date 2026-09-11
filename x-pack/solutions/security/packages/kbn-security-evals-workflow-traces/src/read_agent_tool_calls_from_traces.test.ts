/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { readAgentToolCallsFromTraces } from './read_agent_tool_calls_from_traces';

const silentLog = {
  warning: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
} as unknown as ToolingLog;

const mockClient = (
  responses: Array<{ columns: Array<{ name: string }>; values: unknown[][] }>
) => {
  const request = jest.fn();
  for (const response of responses) {
    request.mockResolvedValueOnce(response);
  }
  return { transport: { request } } as unknown as EsClient & {
    transport: { request: jest.Mock };
  };
};

describe('readAgentToolCallsFromTraces', () => {
  it('joins on gen_ai.conversation.id and filters to TOOL spans', async () => {
    const client = mockClient([
      {
        columns: [{ name: 'tool_id' }, { name: 'event.outcome' }],
        values: [['platform.core.search', 'success']],
      },
    ]);

    await readAgentToolCallsFromTraces({
      traceEsClient: client,
      conversationIds: 'conv-1',
      log: silentLog,
    });

    const queries = client.transport.request.mock.calls.map(
      (call) => (call[0] as { body: { query: string } }).body.query
    );
    expect(queries[0]).toContain('attributes.gen_ai.conversation.id == "conv-1"');
    expect(queries[0]).toContain('attributes.elastic.inference.span.kind == "TOOL"');
    expect(queries[0]).not.toContain('trace.id ==');
    expect(queries[0]).toContain('LIMIT 10000');
  });

  it('queries every conversation id for multi-agent workflows', async () => {
    const client = mockClient([
      {
        columns: [{ name: 'tool_id' }, { name: 'event.outcome' }],
        values: [
          ['platform.core.search', 'success'],
          ['platform.core.esql', 'success'],
        ],
      },
    ]);

    const result = await readAgentToolCallsFromTraces({
      traceEsClient: client,
      conversationIds: ['conv-draft', 'conv-review', 'conv-rewrite'],
      log: silentLog,
    });

    const query = (client.transport.request.mock.calls[0][0] as { body: { query: string } }).body
      .query;
    expect(query).toContain(
      'attributes.gen_ai.conversation.id IN ("conv-draft", "conv-review", "conv-rewrite")'
    );
    expect(result.toolCallIds).toEqual(['platform.core.search', 'platform.core.esql']);
    expect(result.unavailable).toBe(false);
  });

  it('returns ordered tool ids and optional failures', async () => {
    const client = mockClient([
      {
        columns: [{ name: 'tool_id' }, { name: 'event.outcome' }],
        values: [
          ['platform.core.search', 'success'],
          ['platform.core.esql', 'failure'],
        ],
      },
    ]);

    const withFailures = await readAgentToolCallsFromTraces({
      traceEsClient: client,
      conversationIds: 'conv-1',
      log: silentLog,
      includeFailures: true,
    });

    expect(withFailures.toolCallIds).toEqual(['platform.core.search', 'platform.core.esql']);
    expect(withFailures.failedToolCallIds).toEqual(['platform.core.esql']);
  });

  it('marks unavailable when client or conversation ids are missing', async () => {
    await expect(
      readAgentToolCallsFromTraces({
        traceEsClient: undefined,
        conversationIds: 'c',
        log: silentLog,
      })
    ).resolves.toEqual({ toolCallIds: [], unavailable: true });

    const client = mockClient([]);
    await expect(
      readAgentToolCallsFromTraces({
        traceEsClient: client,
        conversationIds: undefined,
        log: silentLog,
      })
    ).resolves.toEqual({ toolCallIds: [], unavailable: true });
  });

  it('bounds the tool query explicitly instead of inheriting the ES|QL row default', async () => {
    const client = mockClient([
      {
        columns: [{ name: 'tool_id' }],
        values: [['platform.core.search']],
      },
    ]);

    await readAgentToolCallsFromTraces({
      traceEsClient: client,
      conversationIds: 'conv-1',
      log: silentLog,
    });

    const query = (client.transport.request.mock.calls[0][0] as { body: { query: string } }).body
      .query;
    expect(query).toContain('| LIMIT 10000');
  });

  it('probes the same index pattern when no tool spans match, and accepts empty when spans exist', async () => {
    const request = jest.fn(async ({ body }: { body: { query: string } }) =>
      body.query.includes('STATS')
        ? { columns: [{ name: 'span_count' }], values: [[3]] }
        : { columns: [{ name: 'tool_id' }], values: [] }
    );
    const client = { transport: { request } } as unknown as EsClient;

    const result = await readAgentToolCallsFromTraces({
      traceEsClient: client,
      conversationIds: 'conv-1',
      log: silentLog,
      indexPattern: 'traces-apm.custom-*',
    });

    expect(result).toEqual({ toolCallIds: [], unavailable: false });
    expect(request).toHaveBeenCalledTimes(2); // no retry: spans exist, agent called no tools
    const probeQuery = request.mock.calls[1][0].body.query;
    expect(probeQuery).toContain('FROM traces-apm.custom-*');
    expect(probeQuery).toContain('STATS span_count = COUNT(*)');
  });

  it('retries while the probe finds no spans, then reports unavailable', async () => {
    const request = jest.fn(async ({ body }: { body: { query: string } }) =>
      body.query.includes('STATS')
        ? { columns: [{ name: 'span_count' }], values: [[0]] }
        : { columns: [{ name: 'tool_id' }], values: [] }
    );
    const client = { transport: { request } } as unknown as EsClient;

    const result = await readAgentToolCallsFromTraces({
      traceEsClient: client,
      conversationIds: 'conv-1',
      log: silentLog,
    });

    expect(result).toEqual({ toolCallIds: [], unavailable: true });
    // 1 initial attempt + 5 retries, each a tool query + a probe.
    expect(request).toHaveBeenCalledTimes(12);
  }, 20000); // backoff across 5 retries is ~15s of wall clock

  it('dedupes repeated conversation ids before building the join', async () => {
    const client = mockClient([
      {
        columns: [{ name: 'tool_id' }],
        values: [['platform.core.search']],
      },
    ]);

    await readAgentToolCallsFromTraces({
      traceEsClient: client,
      conversationIds: ['conv-1', 'conv-1', 'conv-2'],
      log: silentLog,
    });

    const query = (client.transport.request.mock.calls[0][0] as { body: { query: string } }).body
      .query;
    expect(query).toContain('attributes.gen_ai.conversation.id IN ("conv-1", "conv-2")');
  });
  it('keeps the failure column out of KEEP unless failures are requested', async () => {
    const client = mockClient([
      { columns: [{ name: 'tool_id' }], values: [['platform.core.search']] },
    ]);

    await readAgentToolCallsFromTraces({
      traceEsClient: client,
      conversationIds: 'conv-1',
      log: silentLog,
    });

    const query = (client.transport.request.mock.calls[0][0] as { body: { query: string } }).body
      .query;
    // Unmapped on real traces indices until a span sets it; naming it in KEEP
    // makes ES|QL reject the whole query.
    expect(query).not.toContain('attributes.gen_ai.tool.call.failed');
    expect(query).toContain('| KEEP @timestamp, tool_id');
  });

  it('reads failures from the ECS-baseline event.outcome column (#288266)', async () => {
    const client = mockClient([
      {
        columns: [{ name: 'tool_id' }, { name: 'event.outcome' }],
        values: [
          ['platform.core.esql', 'failure'],
          ['security.create_detection_rule', 'success'],
        ],
      },
    ]);

    const result = await readAgentToolCallsFromTraces({
      traceEsClient: client,
      conversationIds: 'conv-1',
      log: silentLog,
      includeFailures: true,
    });

    const query = (client.transport.request.mock.calls[0][0] as { body: { query: string } }).body
      .query;
    // The unmapped gen_ai column must never appear in the query: on Scout trace
    // mappings it is a hard verification_exception (#288266).
    expect(query).not.toContain('attributes.gen_ai.tool.call.failed');
    expect(query).toContain('event.outcome');
    expect(result.failedToolCallIds).toEqual(['platform.core.esql']);
    expect(result.toolCallIds).toEqual(['platform.core.esql', 'security.create_detection_rule']);
  });

  it('does not classify the ECS unknown outcome as a failed tool call', async () => {
    const client = mockClient([
      {
        columns: [{ name: 'tool_id' }, { name: 'event.outcome' }],
        values: [['platform.core.esql', 'unknown']],
      },
    ]);

    const result = await readAgentToolCallsFromTraces({
      traceEsClient: client,
      conversationIds: 'conv-1',
      log: silentLog,
      includeFailures: true,
    });

    expect(result.toolCallIds).toEqual(['platform.core.esql']);
    expect(result.failedToolCallIds).toEqual([]);
  });
});
