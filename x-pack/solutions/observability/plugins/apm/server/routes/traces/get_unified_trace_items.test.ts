/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { APMEventClient } from '@kbn/apm-data-access-plugin/server';
import type { UnifiedTraceErrors } from './get_unified_trace_errors';
import { getErrorsByDocId, getUnifiedTraceItems } from './get_unified_trace_items';
import type { LogsClient } from '../../lib/helpers/create_es_client/create_logs_client';

jest.mock('./get_unified_trace_errors');
jest.mock('../span_links/get_linked_children');

import { getUnifiedTraceErrors } from './get_unified_trace_errors';
import { getSpanLinksCountById } from '../span_links/get_linked_children';
import { getTraceItemIcon } from './get_unified_trace_items';
import { ProcessorEvent } from '@kbn/observability-plugin/common';
import {
  AGENT_NAME,
  AT_TIMESTAMP,
  EVENT_OUTCOME,
  KIND,
  OTEL_SPAN_LINKS_TRACE_ID,
  PARENT_ID,
  PROCESSOR_EVENT,
  SERVICE_NAME,
  SPAN_DURATION,
  SPAN_ID,
  SPAN_LINKS_TRACE_ID,
  SPAN_NAME,
  SPAN_SUBTYPE,
  SPAN_SYNC,
  SPAN_TYPE,
  STATUS_CODE,
  TIMESTAMP_US,
  TRACE_ID,
  TRANSACTION_DURATION,
  TRANSACTION_ID,
  TRANSACTION_NAME,
  TRANSACTION_RESULT,
  ATTRIBUTE_HTTP_SCHEME,
  ATTRIBUTE_HTTP_STATUS_CODE,
  FAAS_COLDSTART,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  SPAN_COMPOSITE_COUNT,
  SPAN_COMPOSITE_SUM,
  SPAN_COMPOSITE_COMPRESSION_STRATEGY,
  SPAN_DESTINATION_SERVICE_RESOURCE,
} from '../../../common/es_fields/apm';

describe('getErrorsByDocId', () => {
  it('groups errors by doc id from apmErrors and unprocessedOtelErrors', () => {
    const unifiedTraceErrors = {
      apmErrors: [
        { span: { id: 'a' }, id: 'error-1', index: 'logs-apm.error-default' },
        { span: { id: 'a' }, id: 'error-2' },
        { span: { id: 'b' }, id: 'error-3' },
        { span: { id: undefined }, id: 'error-4' },
      ],
      unprocessedOtelErrors: [
        { span: { id: 'a' }, id: 'error-5' },
        { span: { id: 'c' }, id: 'error-6', index: 'logs-generic.otel-default' },
        { span: { id: undefined }, id: 'error-7' },
      ],
      totalErrors: 7,
    } as unknown as UnifiedTraceErrors;

    const result = getErrorsByDocId(unifiedTraceErrors);

    expect(result).toEqual({
      a: [
        { errorDocId: 'error-1', errorDocIndex: 'logs-apm.error-default' },
        { errorDocId: 'error-2' },
        { errorDocId: 'error-5' },
      ],
      b: [{ errorDocId: 'error-3' }],
      c: [{ errorDocId: 'error-6', errorDocIndex: 'logs-generic.otel-default' }],
    });
  });

  it('returns an empty object if there are no errors', () => {
    const unifiedTraceErrors = {
      apmErrors: [],
      unprocessedOtelErrors: [],
      totalErrors: 0,
    } as UnifiedTraceErrors;

    expect(getErrorsByDocId(unifiedTraceErrors)).toEqual({});
  });

  it('ignores errors with undefined ids', () => {
    const unifiedTraceErrors = {
      apmErrors: [{ spanId: undefined, id: 'error-1' }],
      unprocessedOtelErrors: [{ spanId: undefined, id: 'error-2' }],
      totalErrors: 0,
    } as unknown as UnifiedTraceErrors;

    expect(getErrorsByDocId(unifiedTraceErrors)).toEqual({});
  });
});

describe('getUnifiedTraceItems', () => {
  const mockApmEventClient = {
    search: jest.fn(),
  } as unknown as APMEventClient;

  const mockLogsClient = {} as LogsClient;

  const defaultParams = {
    apmEventClient: mockApmEventClient,
    logsClient: mockLogsClient,
    traceId: 'test-trace-id',
    start: 0,
    end: 1000,
    maxTraceItems: 1000,
  };

  const mockUnifiedTraceErrors = {
    apmErrors: [{ span: { id: 'span-1' }, id: 'error-1', error: { id: 'error-1' } }],
    unprocessedOtelErrors: [],
    totalErrors: 1,
  } as unknown as UnifiedTraceErrors;

  const defaultSearchFields = {
    [AT_TIMESTAMP]: ['2023-01-01T00:00:00.000Z'],
    [TRACE_ID]: ['test-trace-id'],
    [SERVICE_NAME]: ['test-service'],
    [TIMESTAMP_US]: [1672531200000000],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getUnifiedTraceErrors as jest.Mock).mockResolvedValue(mockUnifiedTraceErrors);
    (getSpanLinksCountById as jest.Mock).mockResolvedValue({});
  });

  describe('basic functionality', () => {
    it('should return trace items and unified trace without agent marks', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              _source: {},
              fields: {
                ...defaultSearchFields,
                [PROCESSOR_EVENT]: ProcessorEvent.transaction,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
              },
            },
          ],
          total: { value: 1, relation: 'eq' },
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result).toEqual({
        traceItems: [
          {
            icon: 'merge',
            id: 'span-1',
            name: 'Test Span',
            timestampUs: 1672531200000000,
            traceId: 'test-trace-id',
            duration: 1000,
            result: undefined,
            status: undefined,
            errors: [{ errorDocId: 'error-1' }],
            parentId: undefined,
            serviceName: 'test-service',
            serviceEnvironment: undefined,
            type: undefined,
            sync: undefined,
            agentName: undefined,
            coldstart: undefined,
            inputTokens: undefined,
            outputTokens: undefined,
            composite: undefined,
            spanLinksCount: {
              incoming: 0,
              outgoing: 0,
            },
            docType: 'transaction',
          },
        ],
        agentMarks: {},
        unifiedTraceErrors: mockUnifiedTraceErrors,
        traceDocsTotal: 1,
      });
    });
    it('should return trace items and unified trace with agent marks', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              _source: {
                transaction: {
                  marks: {
                    agent: {
                      domInteractive: 117,
                      timeToFirstByte: 10,
                      domComplete: 118,
                    },
                  },
                },
              },
              fields: {
                ...defaultSearchFields,
                [PROCESSOR_EVENT]: ProcessorEvent.transaction,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
              },
            },
          ],
          total: { value: 1, relation: 'eq' },
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result).toEqual({
        traceItems: [
          {
            icon: 'merge',
            id: 'span-1',
            name: 'Test Span',
            timestampUs: 1672531200000000,
            traceId: 'test-trace-id',
            duration: 1000,
            result: undefined,
            status: undefined,
            errors: [{ errorDocId: 'error-1' }],
            parentId: undefined,
            serviceName: 'test-service',
            serviceEnvironment: undefined,
            type: undefined,
            sync: undefined,
            agentName: undefined,
            coldstart: undefined,
            inputTokens: undefined,
            outputTokens: undefined,
            composite: undefined,
            spanLinksCount: {
              incoming: 0,
              outgoing: 0,
            },
            docType: 'transaction',
          },
        ],
        agentMarks: {
          domInteractive: 117,
          timeToFirstByte: 10,
          domComplete: 118,
        },
        unifiedTraceErrors: mockUnifiedTraceErrors,
        traceDocsTotal: 1,
      });
    });
    it('should return trace items and unified trace errors', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
              },
            },
          ],
          total: { value: 1, relation: 'eq' },
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result).toEqual({
        traceItems: [
          {
            icon: undefined,
            id: 'span-1',
            name: 'Test Span',
            timestampUs: 1672531200000000,
            traceId: 'test-trace-id',
            duration: 1000,
            result: undefined,
            status: undefined,
            errors: [{ errorDocId: 'error-1' }],
            parentId: undefined,
            serviceName: 'test-service',
            serviceEnvironment: undefined,
            type: undefined,
            sync: undefined,
            agentName: undefined,
            coldstart: undefined,
            inputTokens: undefined,
            outputTokens: undefined,
            composite: undefined,
            spanLinksCount: {
              incoming: 0,
              outgoing: 0,
            },
            docType: 'span',
          },
        ],
        agentMarks: {},
        unifiedTraceErrors: mockUnifiedTraceErrors,
        traceDocsTotal: 1,
      });
    });

    it('should call all required functions with correct parameters', async () => {
      const mockSearchResponse = {
        hits: { hits: [] },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      await getUnifiedTraceItems(defaultParams);

      expect(getUnifiedTraceErrors).toHaveBeenCalledWith({
        apmEventClient: mockApmEventClient,
        logsClient: mockLogsClient,
        traceId: 'test-trace-id',
        start: 0,
        end: 1000,
      });

      expect(getSpanLinksCountById).toHaveBeenCalledWith({
        traceId: 'test-trace-id',
        apmEventClient: mockApmEventClient,
        start: 0,
        end: 1000,
      });

      expect(mockApmEventClient.search).toHaveBeenCalledWith(
        'get_unified_trace_items',
        expect.objectContaining({
          apm: {
            events: ['span', 'transaction'],
          },
          track_total_hits: true,
          size: 1000,
        }),
        { skipProcessorEventFilter: true }
      );
    });

    it('should use maxTraceItems when provided', async () => {
      const mockSearchResponse = {
        hits: { hits: [] },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      await getUnifiedTraceItems({
        ...defaultParams,
        maxTraceItems: 500,
      });

      expect(mockApmEventClient.search).toHaveBeenCalledWith(
        'get_unified_trace_items',
        expect.objectContaining({
          size: 500,
        }),
        { skipProcessorEventFilter: true }
      );
    });

    it('should include serviceName in query when provided', async () => {
      const mockSearchResponse = {
        hits: { hits: [] },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      await getUnifiedTraceItems({
        ...defaultParams,
        serviceName: 'specific-service',
      });

      expect(mockApmEventClient.search).toHaveBeenCalledWith(
        'get_unified_trace_items',
        expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              must: expect.arrayContaining([
                expect.objectContaining({
                  bool: expect.objectContaining({
                    filter: expect.arrayContaining([
                      { term: { 'service.name': 'specific-service' } },
                    ]),
                  }),
                }),
              ]),
            }),
          }),
        }),
        { skipProcessorEventFilter: true }
      );
    });
  });

  describe('trace item mapping', () => {
    it('should handle transaction fields correctly', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              _source: {},
              fields: {
                ...defaultSearchFields,
                [TRANSACTION_ID]: ['transaction-1'],
                [TRANSACTION_NAME]: ['Test Transaction'],
                [TRANSACTION_DURATION]: [2000],
                [TRANSACTION_RESULT]: ['HTTP 2xx'],
                [PROCESSOR_EVENT]: [ProcessorEvent.transaction],
                [PARENT_ID]: ['parent-1'],
                [EVENT_OUTCOME]: ['success'],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0]).toMatchObject({
        id: 'transaction-1',
        name: 'Test Transaction',
        duration: 2000,
        result: 'HTTP 2xx',
        parentId: 'parent-1',
        status: {
          fieldName: 'event.outcome',
          value: 'success',
        },
      });
    });

    it('should set result from otel http scheme and status code when both are present', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['OTEL Span'],
                [SPAN_DURATION]: [1000],
                [ATTRIBUTE_HTTP_SCHEME]: ['https'],
                [ATTRIBUTE_HTTP_STATUS_CODE]: [200],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].result).toBe('HTTPS 200');
    });

    it('should leave result undefined when only otel http scheme is present', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['OTEL Span'],
                [SPAN_DURATION]: [1000],
                [ATTRIBUTE_HTTP_SCHEME]: ['http'],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].result).toBeUndefined();
    });

    it('should leave result undefined when only otel http status code is present', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['OTEL Span'],
                [SPAN_DURATION]: [1000],
                [ATTRIBUTE_HTTP_STATUS_CODE]: [404],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].result).toBeUndefined();
    });

    it('should leave result undefined when no transaction or otel http result fields are present', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['OTEL Span'],
                [SPAN_DURATION]: [1000],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].result).toBeUndefined();
    });

    it('should handle span type, subtype, and kind fields', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
                [SPAN_TYPE]: ['db'],
                [SPAN_SUBTYPE]: ['mysql'],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0]).toMatchObject({
        type: 'mysql',
      });
    });

    it('should prioritize span.subtype over span.type', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
                [SPAN_TYPE]: ['db'],
                [SPAN_SUBTYPE]: ['mysql'],
                [KIND]: ['client'],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].type).toBe('mysql');
    });

    it('should use status.code when event.outcome is not available', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
                [STATUS_CODE]: ['OK'],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].status).toEqual({
        fieldName: 'status.code',
        value: 'OK',
      });
    });

    it('should filter out items without id', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems).toHaveLength(0);
    });

    it('should filter out items without name', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_DURATION]: [1000],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems).toHaveLength(0);
    });

    it('should use @timestamp when timestamp.us is not available', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      // 2023-01-01T00:00:00.000Z in microseconds
      expect(result.traceItems[0].timestampUs).toBe(1672531200000000);
    });

    it('should include agentName when present', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
                [AGENT_NAME]: ['nodejs'],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].agentName).toBe('nodejs');
    });

    it('should return undefined agentName when not present (OTEL without processing)', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].agentName).toBeUndefined();
    });

    it('should include sync field when present', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
                [SPAN_SYNC]: [true],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].sync).toBe(true);
    });

    it('should return undefined sync when not present (OTEL without processing)', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].sync).toBeUndefined();
    });

    it('should handle OTEL documents without agentName and sync fields', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['otel-span-1'],
                [SPAN_NAME]: ['OTEL Unprocessed Span'],
                [SPAN_DURATION]: [1500],
                [KIND]: ['client'],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0]).toMatchObject({
        id: 'otel-span-1',
        name: 'OTEL Unprocessed Span',
        duration: 1500,
        type: 'client',
        agentName: undefined,
        sync: undefined,
      });
    });

    it('should return docType as transaction when processor.event is transaction', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              _source: {},
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['tx-1'],
                [SPAN_NAME]: ['Test Transaction'],
                [SPAN_DURATION]: [1000],
                [PROCESSOR_EVENT]: [ProcessorEvent.transaction],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].docType).toBe('transaction');
    });

    it('should return docType as span when processor.event is span', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
                [PROCESSOR_EVENT]: [ProcessorEvent.span],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].docType).toBe('span');
    });

    it('should default docType to span when processor.event is not present', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].docType).toBe('span');
    });

    it('should include coldstart field when present and true', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
                [FAAS_COLDSTART]: [true],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].coldstart).toBe(true);
    });

    it('should include coldstart field when present and false', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
                [FAAS_COLDSTART]: [false],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].coldstart).toBe(false);
    });

    it('should return undefined coldstart when not present', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].coldstart).toBeUndefined();
    });

    it('should include input and output tokens when present', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['chat gpt-4o-mini'],
                [SPAN_DURATION]: [1000],
                [GEN_AI_USAGE_INPUT_TOKENS]: [19],
                [GEN_AI_USAGE_OUTPUT_TOKENS]: [58],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].inputTokens).toBe(19);
      expect(result.traceItems[0].outputTokens).toBe(58);
    });

    it('should return undefined token fields when not present', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].inputTokens).toBeUndefined();
      expect(result.traceItems[0].outputTokens).toBeUndefined();
    });

    it('should return composite when all fields are present with exact_match strategy', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
                [SPAN_COMPOSITE_COUNT]: [5],
                [SPAN_COMPOSITE_SUM]: [2500],
                [SPAN_COMPOSITE_COMPRESSION_STRATEGY]: ['exact_match'],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].composite).toEqual({
        count: 5,
        sum: 2500,
        compressionStrategy: 'exact_match',
      });
    });

    it('should return composite when all fields are present with same_kind strategy', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
                [SPAN_COMPOSITE_COUNT]: [10],
                [SPAN_COMPOSITE_SUM]: [5000],
                [SPAN_COMPOSITE_COMPRESSION_STRATEGY]: ['same_kind'],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].composite).toEqual({
        count: 10,
        sum: 5000,
        compressionStrategy: 'same_kind',
      });
    });

    it('should return undefined composite when count is missing', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
                [SPAN_COMPOSITE_SUM]: [2500],
                [SPAN_COMPOSITE_COMPRESSION_STRATEGY]: ['exact_match'],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].composite).toBeUndefined();
    });

    it('should return undefined composite when sum is missing', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
                [SPAN_COMPOSITE_COUNT]: [5],
                [SPAN_COMPOSITE_COMPRESSION_STRATEGY]: ['exact_match'],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].composite).toBeUndefined();
    });

    it('should return undefined composite when compressionStrategy is missing', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
                [SPAN_COMPOSITE_COUNT]: [5],
                [SPAN_COMPOSITE_SUM]: [2500],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].composite).toBeUndefined();
    });

    it('should return undefined composite when compressionStrategy is invalid', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
                [SPAN_COMPOSITE_COUNT]: [5],
                [SPAN_COMPOSITE_SUM]: [2500],
                [SPAN_COMPOSITE_COMPRESSION_STRATEGY]: ['invalid_strategy'],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].composite).toBeUndefined();
    });

    it('should return undefined composite when no composite fields are present', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].composite).toBeUndefined();
    });
  });

  describe('span links integration', () => {
    it('should include incoming span links count from getSpanLinksCountById', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);
      (getSpanLinksCountById as jest.Mock).mockResolvedValue({
        'span-1': 3,
      });

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].spanLinksCount).toEqual({
        incoming: 3,
        outgoing: 0,
      });
    });

    it('should include outgoing span links count from span.links.trace.id', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
                [SPAN_LINKS_TRACE_ID]: ['link-1', 'link-2'],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].spanLinksCount).toEqual({
        incoming: 0,
        outgoing: 2,
      });
    });

    it('should include outgoing span links count from links.trace_id', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
                [OTEL_SPAN_LINKS_TRACE_ID]: ['link-1', 'link-2', 'link-3'],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].spanLinksCount).toEqual({
        incoming: 0,
        outgoing: 3,
      });
    });

    it('should combine incoming and outgoing span links counts', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
                [SPAN_LINKS_TRACE_ID]: ['link-1', 'link-2'],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);
      (getSpanLinksCountById as jest.Mock).mockResolvedValue({
        'span-1': 5,
      });

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].spanLinksCount).toEqual({
        incoming: 5,
        outgoing: 2,
      });
    });
  });

  describe('traceDocsTotal and maxTraceItems', () => {
    it('returns traceDocsTotal as raw ES total', async () => {
      (mockApmEventClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
              },
            },
          ],
          total: { value: 5000, relation: 'eq' },
        },
      });

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceDocsTotal).toBe(5000);
    });

    it('returns traceDocsTotal as 0 when hits.total is undefined', async () => {
      (mockApmEventClient.search as jest.Mock).mockResolvedValue({
        hits: { hits: [] },
      });

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceDocsTotal).toBe(0);
    });

    it('does not include maxTraceItems in the return value', async () => {
      (mockApmEventClient.search as jest.Mock).mockResolvedValue({
        hits: { hits: [] },
      });

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result).not.toHaveProperty('maxTraceItems');
    });

    it('does not include exceedMax in the return value', async () => {
      (mockApmEventClient.search as jest.Mock).mockResolvedValue({
        hits: { hits: [], total: { value: 2000, relation: 'eq' } },
      });

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result).not.toHaveProperty('exceedMax');
    });
  });

  describe('error mapping', () => {
    it('should map errors to correct span ids', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-1'],
                [SPAN_NAME]: ['Test Span 1'],
                [SPAN_DURATION]: [1000],
              },
            },
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-2'],
                [SPAN_NAME]: ['Test Span 2'],
                [SPAN_DURATION]: [1000],
              },
            },
          ],
        },
      };

      const mockUnifiedTraceErrorsWithMultiple = {
        apmErrors: [
          { span: { id: 'span-1' }, id: 'error-1' },
          { span: { id: 'span-1' }, id: 'error-2' },
        ],
        unprocessedOtelErrors: [{ span: { id: 'span-2' }, id: 'error-3' }],
        totalErrors: 3,
      } as unknown as UnifiedTraceErrors;

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);
      (getUnifiedTraceErrors as jest.Mock).mockResolvedValue(mockUnifiedTraceErrorsWithMultiple);

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].errors).toEqual([
        { errorDocId: 'error-1' },
        { errorDocId: 'error-2' },
      ]);
      expect(result.traceItems[1].errors).toEqual([{ errorDocId: 'error-3' }]);
    });

    it('should return empty errors array for spans without errors', async () => {
      const mockSearchResponse = {
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['span-without-error'],
                [SPAN_NAME]: ['Test Span'],
                [SPAN_DURATION]: [1000],
              },
            },
          ],
        },
      };

      (mockApmEventClient.search as jest.Mock).mockResolvedValue(mockSearchResponse);
      (getUnifiedTraceErrors as jest.Mock).mockResolvedValue({
        apmErrors: [],
        unprocessedOtelErrors: [],
        totalErrors: 0,
      });

      const result = await getUnifiedTraceItems(defaultParams);

      expect(result.traceItems[0].errors).toEqual([]);
    });
  });

  describe('missingDestination', () => {
    const otelSpanAndChildTransaction = (withDestination: boolean) => ({
      hits: {
        hits: [
          {
            fields: {
              ...defaultSearchFields,
              [SPAN_ID]: ['exit-span'],
              [SPAN_NAME]: ['call-service-b'],
              [SPAN_DURATION]: [500],
              [AGENT_NAME]: ['opentelemetry/nodejs'],
              ...(withDestination ? { [SPAN_DESTINATION_SERVICE_RESOURCE]: ['postgresql'] } : {}),
            },
          },
          {
            _source: {},
            fields: {
              ...defaultSearchFields,
              [PROCESSOR_EVENT]: [ProcessorEvent.transaction],
              [TRANSACTION_ID]: ['child-tx'],
              [TRANSACTION_NAME]: ['GET /downstream'],
              [TRANSACTION_DURATION]: [300],
              [PARENT_ID]: ['exit-span'],
            },
          },
        ],
        total: { value: 2, relation: 'eq' },
      },
    });

    it('sets missingDestination on an OTel exit span whose child is a transaction and destination is absent', async () => {
      (mockApmEventClient.search as jest.Mock).mockResolvedValue(
        otelSpanAndChildTransaction(false)
      );

      const result = await getUnifiedTraceItems(defaultParams);

      const exitSpan = result.traceItems.find((item) => item.id === 'exit-span');
      expect(exitSpan?.missingDestination).toBe(true);
    });

    it('does not set missingDestination when the OTel span has a destination', async () => {
      (mockApmEventClient.search as jest.Mock).mockResolvedValue(otelSpanAndChildTransaction(true));

      const result = await getUnifiedTraceItems(defaultParams);

      const exitSpan = result.traceItems.find((item) => item.id === 'exit-span');
      expect(exitSpan?.missingDestination).toBeUndefined();
    });

    it('does not set missingDestination on a non-OTel APM span even without a destination', async () => {
      (mockApmEventClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['apm-span'],
                [SPAN_NAME]: ['call-service-b'],
                [SPAN_DURATION]: [500],
                [AGENT_NAME]: ['nodejs'],
              },
            },
            {
              _source: {},
              fields: {
                ...defaultSearchFields,
                [PROCESSOR_EVENT]: [ProcessorEvent.transaction],
                [TRANSACTION_ID]: ['child-tx'],
                [TRANSACTION_NAME]: ['GET /downstream'],
                [TRANSACTION_DURATION]: [300],
                [PARENT_ID]: ['apm-span'],
              },
            },
          ],
          total: { value: 2, relation: 'eq' },
        },
      });

      const result = await getUnifiedTraceItems(defaultParams);

      const apmSpan = result.traceItems.find((item) => item.id === 'apm-span');
      expect(apmSpan?.missingDestination).toBeUndefined();
    });

    it('does not set missingDestination when the child is a span, not a transaction', async () => {
      (mockApmEventClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: [
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['exit-span'],
                [SPAN_NAME]: ['call-service-b'],
                [SPAN_DURATION]: [500],
                [AGENT_NAME]: ['opentelemetry/nodejs'],
              },
            },
            {
              fields: {
                ...defaultSearchFields,
                [SPAN_ID]: ['child-span'],
                [SPAN_NAME]: ['downstream-span'],
                [SPAN_DURATION]: [300],
                [PARENT_ID]: ['exit-span'],
              },
            },
          ],
          total: { value: 2, relation: 'eq' },
        },
      });

      const result = await getUnifiedTraceItems(defaultParams);

      const exitSpan = result.traceItems.find((item) => item.id === 'exit-span');
      expect(exitSpan?.missingDestination).toBeUndefined();
    });
  });
});

describe('getTraceItemIcon', () => {
  describe('database icon', () => {
    it('returns "database" when spanType starts with "db"', () => {
      expect(getTraceItemIcon({ spanType: 'db' })).toBe('database');
    });

    it('returns "database" when spanType is "db.mysql"', () => {
      expect(getTraceItemIcon({ spanType: 'db.mysql' })).toBe('database');
    });

    it('returns "database" when spanType is "db.elasticsearch"', () => {
      expect(getTraceItemIcon({ spanType: 'db.elasticsearch' })).toBe('database');
    });

    it('returns "database" even when processorEvent is transaction', () => {
      expect(
        getTraceItemIcon({
          spanType: 'db.redis',
          processorEvent: ProcessorEvent.transaction,
          agentName: 'nodejs',
        })
      ).toBe('database');
    });
  });

  describe('non-transaction processor events', () => {
    it('returns undefined when processorEvent is span', () => {
      expect(getTraceItemIcon({ processorEvent: ProcessorEvent.span })).toBeUndefined();
    });

    it('returns undefined when processorEvent is undefined', () => {
      expect(getTraceItemIcon({})).toBeUndefined();
    });

    it('returns undefined when processorEvent is error', () => {
      expect(getTraceItemIcon({ processorEvent: ProcessorEvent.error })).toBeUndefined();
    });
  });

  describe('transaction processor events', () => {
    it('returns "globe" for RUM agent "js-base"', () => {
      expect(
        getTraceItemIcon({
          processorEvent: ProcessorEvent.transaction,
          agentName: 'js-base',
        })
      ).toBe('globe');
    });

    it('returns "globe" for RUM agent "rum-js"', () => {
      expect(
        getTraceItemIcon({
          processorEvent: ProcessorEvent.transaction,
          agentName: 'rum-js',
        })
      ).toBe('globe');
    });

    it('returns "globe" for RUM agent "opentelemetry/webjs"', () => {
      expect(
        getTraceItemIcon({
          processorEvent: ProcessorEvent.transaction,
          agentName: 'opentelemetry/webjs',
        })
      ).toBe('globe');
    });

    it('returns "merge" for non-RUM agent "nodejs"', () => {
      expect(
        getTraceItemIcon({
          processorEvent: ProcessorEvent.transaction,
          agentName: 'nodejs',
        })
      ).toBe('merge');
    });

    it('returns "merge" for non-RUM agent "java"', () => {
      expect(
        getTraceItemIcon({
          processorEvent: ProcessorEvent.transaction,
          agentName: 'java',
        })
      ).toBe('merge');
    });

    it('returns "merge" for non-RUM agent "python"', () => {
      expect(
        getTraceItemIcon({
          processorEvent: ProcessorEvent.transaction,
          agentName: 'python',
        })
      ).toBe('merge');
    });

    it('returns "merge" when agentName is undefined', () => {
      expect(
        getTraceItemIcon({
          processorEvent: ProcessorEvent.transaction,
        })
      ).toBe('merge');
    });
  });
});

describe('getUnifiedTraceItems focused document reservation', () => {
  const mockApmEventClient = {
    search: jest.fn(),
  } as unknown as APMEventClient;

  const mockLogsClient = {} as LogsClient;

  const defaultParams = {
    apmEventClient: mockApmEventClient,
    logsClient: mockLogsClient,
    traceId: 'test-trace-id',
    start: 0,
    end: 1000,
    maxTraceItems: 1,
  };

  const defaultSearchFields = {
    [AT_TIMESTAMP]: ['2023-01-01T00:00:00.000Z'],
    [TRACE_ID]: ['test-trace-id'],
    [SERVICE_NAME]: ['test-service'],
    [TIMESTAMP_US]: [1672531200000000],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getUnifiedTraceErrors as jest.Mock).mockResolvedValue({
      apmErrors: [],
      unprocessedOtelErrors: [],
      totalErrors: 0,
    });
    (getSpanLinksCountById as jest.Mock).mockResolvedValue({});
  });

  it('merges a missing focused transaction into truncated ranked hits', async () => {
    const rankedRoot = {
      _source: {},
      fields: {
        ...defaultSearchFields,
        [PROCESSOR_EVENT]: ProcessorEvent.transaction,
        [SPAN_ID]: ['root-1'],
        [TRANSACTION_ID]: ['root-1'],
        [TRANSACTION_NAME]: ['long-root'],
        [TRANSACTION_DURATION]: [1_000_000],
      },
    };
    const focusedChild = {
      _source: {},
      fields: {
        ...defaultSearchFields,
        [PROCESSOR_EVENT]: ProcessorEvent.transaction,
        [SPAN_ID]: ['focused-1'],
        [TRANSACTION_ID]: ['focused-1'],
        [TRANSACTION_NAME]: ['short-child'],
        [TRANSACTION_DURATION]: [2000],
        [PARENT_ID]: ['root-1'],
      },
    };

    (mockApmEventClient.search as jest.Mock).mockImplementation((operationName: string) => {
      if (operationName === 'get_focused_trace_items') {
        return Promise.resolve({
          hits: { hits: [focusedChild], total: { value: 1, relation: 'eq' } },
        });
      }

      return Promise.resolve({
        hits: {
          hits: [rankedRoot],
          total: { value: 2, relation: 'eq' },
        },
      });
    });

    const result = await getUnifiedTraceItems({
      ...defaultParams,
      focusedDocId: 'focused-1',
    });

    expect(result.traceItems.map((item) => item.id)).toEqual(['focused-1']);
    expect(result.traceDocsTotal).toBe(2);
    expect(
      (mockApmEventClient.search as jest.Mock).mock.calls.some(
        (call) => call[0] === 'get_focused_trace_items'
      )
    ).toBe(true);
  });
});
