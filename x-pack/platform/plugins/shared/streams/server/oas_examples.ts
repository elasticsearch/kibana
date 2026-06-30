/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * OAS example constants for the Streams API.
 *
 * These typed constants are imported directly by the Streams route definitions
 * via oasOperationObject, keeping examples co-located with routes and type-checked
 * against the @kbn/streams-schema types. If a schema change breaks an example
 * (e.g. a field is renamed or a required property is added), TypeScript catches
 * it immediately without any additional tooling or CI step.
 */

import type { SignificantEventsGetResponse, StreamQuery, Streams } from '@kbn/streams-schema';

// ---------------------------------------------------------------------------
// PUT /api/streams/{name}  –  wired stream
// ---------------------------------------------------------------------------

export const createWiredStreamRequest: Streams.WiredStream.UpsertRequest = {
  stream: {
    description: 'Web server access logs, routed by severity',
    type: 'wired',
    ingest: {
      lifecycle: { inherit: {} },
      processing: { steps: [] },
      settings: {},
      failure_store: { inherit: {} },
      wired: {
        fields: {
          'host.name': { type: 'keyword' },
          'http.response.status_code': { type: 'long' },
          message: { type: 'match_only_text' },
        },
        routing: [
          {
            destination: 'logs.nginx.errors',
            where: { field: 'http.response.status_code', gte: 500 },
            status: 'enabled',
          },
        ],
      },
    },
  },
  dashboards: [],
  rules: [],
};

// ---------------------------------------------------------------------------
// PUT /api/streams/{name}  –  classic stream
// ---------------------------------------------------------------------------

export const updateClassicStreamRequest: Streams.ClassicStream.UpsertRequest = {
  stream: {
    description: 'Legacy application logs managed as a classic data stream',
    type: 'classic',
    ingest: {
      lifecycle: { dsl: { data_retention: '30d' } },
      processing: {
        steps: [
          {
            action: 'grok',
            from: 'message',
            patterns: [
              '%{TIMESTAMP_ISO8601:timestamp} %{LOGLEVEL:log.level} %{GREEDYDATA:message}',
            ],
            ignore_missing: true,
          },
        ],
      },
      settings: {},
      failure_store: { disabled: {} },
      classic: {},
    },
  },
  dashboards: [],
  rules: [],
};

// ---------------------------------------------------------------------------
// PUT /api/streams/{name}  –  query stream
// ---------------------------------------------------------------------------

export const createQueryStreamRequest: Streams.QueryStream.UpsertRequest = {
  stream: {
    description: 'All error-level logs across every stream',
    type: 'query',
    query: {
      view: 'logs.errors-view',
      esql: 'FROM logs* | WHERE log.level == "error"',
    },
  },
  dashboards: [],
  rules: [],
};

// ---------------------------------------------------------------------------
// POST /api/streams/{name}/_fork
// ---------------------------------------------------------------------------

export interface ForkStreamRequest {
  stream: { name: string };
  where: { field: string; eq: string };
  status?: 'enabled' | 'disabled';
}

export const forkStreamRequest: ForkStreamRequest = {
  stream: { name: 'logs.nginx.errors' },
  where: { field: 'http.response.status_code', eq: '500' },
  status: 'enabled',
};

// ---------------------------------------------------------------------------
// PUT /api/streams/{name}/_ingest  –  wired ingest update with processing
// ---------------------------------------------------------------------------

export interface WiredIngestUpsertRequestBody {
  ingest: {
    lifecycle: { inherit: {} };
    processing: {
      steps: Array<{
        action: 'grok';
        from: string;
        patterns: string[];
        ignore_missing?: boolean;
      }>;
    };
    settings: Record<string, never>;
    failure_store: { inherit: {} };
    wired: {
      fields: Record<string, { type: string }>;
      routing: Array<{
        destination: string;
        where: { field: string; eq: string };
        status: string;
      }>;
    };
  };
}

export const upsertWiredIngestRequest: WiredIngestUpsertRequestBody = {
  ingest: {
    lifecycle: { inherit: {} },
    processing: {
      steps: [
        {
          action: 'grok',
          from: 'message',
          patterns: [
            '%{IPORHOST:client.ip} %{USER:ident} %{USER:auth} \\[%{HTTPDATE:@timestamp}\\] "%{WORD:http.method} %{DATA:url.original} HTTP/%{NUMBER:http.version}" %{NUMBER:http.response.status_code:int} (?:%{NUMBER:http.response.body.bytes:int}|-)',
          ],
          ignore_missing: false,
        },
      ],
    },
    settings: {},
    failure_store: { inherit: {} },
    wired: {
      fields: {
        'client.ip': { type: 'ip' },
        'http.method': { type: 'keyword' },
        'http.response.status_code': { type: 'long' },
        'http.response.body.bytes': { type: 'long' },
        'url.original': { type: 'wildcard' },
      },
      routing: [
        {
          destination: 'logs.nginx.errors',
          where: { field: 'http.response.status_code', eq: '500' },
          status: 'enabled',
        },
      ],
    },
  },
};

// ---------------------------------------------------------------------------
// PUT /api/streams/{name}/_query  –  query stream upsert
// ---------------------------------------------------------------------------

export interface QueryStreamUpsertRequestBody {
  query: {
    esql: string;
  };
}

export const upsertQueryStreamRequest: QueryStreamUpsertRequestBody = {
  query: {
    esql: 'FROM logs* | WHERE log.level == "error" | KEEP @timestamp, message, host.name, log.level',
  },
};

// ---------------------------------------------------------------------------
// GET /api/streams/{name}  –  wired stream response
// ---------------------------------------------------------------------------

export const getWiredStreamResponse: Streams.WiredStream.GetResponse = {
  stream: {
    name: 'logs.nginx',
    description: 'Web server access logs, routed by severity',
    type: 'wired',
    updated_at: '2025-01-15T10:30:00.000Z',
    ingest: {
      lifecycle: { inherit: {} },
      processing: { steps: [], updated_at: '2025-01-15T10:30:00.000Z' },
      settings: {},
      failure_store: { inherit: {} },
      wired: {
        fields: {
          'host.name': { type: 'keyword' },
          'http.response.status_code': { type: 'long' },
          message: { type: 'match_only_text' },
        },
        routing: [
          {
            destination: 'logs.nginx.errors',
            where: { field: 'http.response.status_code', gte: 500 },
            status: 'enabled',
          },
        ],
      },
    },
  },
  dashboards: [],
  rules: [],
  data_stream_exists: true,
  inherited_fields: {
    '@timestamp': { type: 'date', from: 'logs' },
    'log.level': { type: 'keyword', from: 'logs' },
  },
  effective_lifecycle: { dsl: { data_retention: '7d' }, from: 'logs' },
  effective_settings: {},
  effective_failure_store: { disabled: {}, from: 'logs' },
  privileges: {
    manage: true,
    monitor: true,
    view_index_metadata: true,
    lifecycle: true,
    simulate: true,
    text_structure: true,
    read_failure_store: true,
    manage_failure_store: true,
    create_snapshot_repository: false,
  },
};

// ---------------------------------------------------------------------------
// GET /api/streams/{name}/_ingest  –  wired ingest settings response
// ---------------------------------------------------------------------------

export const getWiredIngestResponse: { ingest: Streams.WiredStream.Definition['ingest'] } = {
  ingest: {
    lifecycle: { inherit: {} },
    processing: {
      steps: [
        {
          action: 'grok',
          from: 'message',
          patterns: [
            '%{IPORHOST:client.ip} %{USER:ident} %{USER:auth} \\[%{HTTPDATE:@timestamp}\\] "%{WORD:http.method} %{DATA:url.original} HTTP/%{NUMBER:http.version}" %{NUMBER:http.response.status_code:int} (?:%{NUMBER:http.response.body.bytes:int}|-)',
          ],
          ignore_missing: false,
        },
      ],
      updated_at: '2025-01-15T10:30:00.000Z',
    },
    settings: {},
    failure_store: { inherit: {} },
    wired: {
      fields: {
        'client.ip': { type: 'ip' },
        'http.method': { type: 'keyword' },
        'http.response.status_code': { type: 'long' },
        'http.response.body.bytes': { type: 'long' },
        'url.original': { type: 'wildcard' },
      },
      routing: [
        {
          destination: 'logs.nginx.errors',
          where: { field: 'http.response.status_code', gte: 500 },
          status: 'enabled',
        },
      ],
    },
  },
};

// ---------------------------------------------------------------------------
// PUT /api/streams/{name}/queries/{queryId}
// ---------------------------------------------------------------------------

export const upsertStreamQueryRequest = {
  title: 'Error count by host',
  description: 'Count error-level log events grouped by host name',
  esql: {
    query: 'FROM logs* | WHERE log.level == "error" | STATS count = COUNT(*) BY host.name',
  },
};

// ---------------------------------------------------------------------------
// POST /api/streams/{name}/queries/_bulk
// ---------------------------------------------------------------------------

export const bulkStreamQueriesRequest = {
  operations: [
    {
      index: {
        id: 'error-count-by-host',
        title: 'Error count by host',
        description: 'Count error-level log events grouped by host name',
        esql: {
          query: 'FROM logs* | WHERE log.level == "error" | STATS count = COUNT(*) BY host.name',
        },
      },
    },
    {
      delete: { id: 'old-query-id' },
    },
  ],
};

// ---------------------------------------------------------------------------
// POST /api/streams/{name}/content/export
// ---------------------------------------------------------------------------

export const exportContentRequest = {
  name: 'nginx-pack',
  description: 'Nginx stream content pack',
  version: '1.0.0',
  include: { objects: { all: {} } },
};

// ---------------------------------------------------------------------------
// GET /api/streams/{name}/queries  –  list queries response
// ---------------------------------------------------------------------------

export const listStreamQueriesResponse: { queries: StreamQuery[] } = {
  queries: [
    {
      id: 'error-count-by-host',
      title: 'Error count by host',
      description: 'Count error-level log events grouped by host name',
      type: 'match',
      esql: {
        query: 'FROM logs.nginx | WHERE log.level == "error" | STATS count = COUNT(*) BY host.name',
      },
      severity_score: 75,
    },
    {
      id: 'high-latency-requests',
      title: 'High latency requests',
      description: 'Requests with response time above 2 seconds',
      type: 'match',
      esql: {
        query: 'FROM logs.nginx | WHERE http.response_time > 2000',
      },
      severity_score: 50,
    },
  ],
};

// ---------------------------------------------------------------------------
// GET /api/streams/{name}/significant_events  –  significant events response
// ---------------------------------------------------------------------------

export const getSignificantEventsResponse: SignificantEventsGetResponse = {
  significant_events: [
    {
      id: 'error-count-by-host',
      title: 'Error count by host',
      description: 'Count error-level log events grouped by host name',
      type: 'match',
      esql: {
        query: 'FROM logs.nginx | WHERE log.level == "error" | STATS count = COUNT(*) BY host.name',
      },
      severity_score: 75,
      stream_name: 'logs.nginx',
      occurrences: [
        { date: '2025-01-15T10:00:00.000Z', count: 42 },
        { date: '2025-01-15T11:00:00.000Z', count: 18 },
        { date: '2025-01-15T12:00:00.000Z', count: 7 },
      ],
      change_points: {
        type: {
          spike: { p_value: 0.002, change_point: 1 },
        },
      },
      rule_backed: false,
    },
  ],
  aggregated_occurrences: [
    { date: '2025-01-15T10:00:00.000Z', count: 42 },
    { date: '2025-01-15T11:00:00.000Z', count: 18 },
    { date: '2025-01-15T12:00:00.000Z', count: 7 },
  ],
};

// ---------------------------------------------------------------------------
// GET /api/streams  –  stream list response
// ---------------------------------------------------------------------------

export const listStreamsResponse: { streams: Streams.all.Definition[] } = {
  streams: [
    {
      name: 'logs',
      description: 'Root logs stream',
      type: 'wired',
      updated_at: '2025-01-10T08:00:00.000Z',
      ingest: {
        lifecycle: { inherit: {} },
        processing: { steps: [], updated_at: '2025-01-10T08:00:00.000Z' },
        settings: {},
        failure_store: { inherit: {} },
        wired: {
          fields: {
            '@timestamp': { type: 'date' },
            'log.level': { type: 'keyword' },
            message: { type: 'match_only_text' },
          },
          routing: [
            {
              destination: 'logs.nginx',
              where: { field: 'host.name', eq: 'nginx' },
              status: 'enabled',
            },
          ],
        },
      },
    },
    {
      name: 'logs.nginx',
      description: 'Web server access logs, routed by severity',
      type: 'wired',
      updated_at: '2025-01-15T10:30:00.000Z',
      ingest: {
        lifecycle: { inherit: {} },
        processing: { steps: [], updated_at: '2025-01-15T10:30:00.000Z' },
        settings: {},
        failure_store: { inherit: {} },
        wired: {
          fields: {
            'host.name': { type: 'keyword' },
            'http.response.status_code': { type: 'long' },
            message: { type: 'match_only_text' },
          },
          routing: [
            {
              destination: 'logs.nginx.errors',
              where: { field: 'http.response.status_code', gte: 500 },
              status: 'enabled',
            },
          ],
        },
      },
    },
    {
      name: 'logs-myapp-default',
      description: 'Legacy application logs',
      type: 'classic',
      updated_at: '2024-12-01T09:00:00.000Z',
      ingest: {
        lifecycle: { dsl: { data_retention: '30d' } },
        processing: {
          steps: [
            {
              action: 'grok',
              from: 'message',
              patterns: [
                '%{TIMESTAMP_ISO8601:timestamp} %{LOGLEVEL:log.level} %{GREEDYDATA:message}',
              ],
              ignore_missing: true,
            },
          ],
          updated_at: '2024-12-01T09:00:00.000Z',
        },
        settings: {},
        failure_store: { disabled: {} },
        classic: {},
      },
    },
    {
      name: 'logs.errors',
      description: 'All error-level logs across every stream',
      type: 'query',
      updated_at: '2025-01-20T14:00:00.000Z',
      query: {
        view: 'logs.errors-view',
        esql: 'FROM logs* | WHERE log.level == "error"',
      },
    },
  ],
};
