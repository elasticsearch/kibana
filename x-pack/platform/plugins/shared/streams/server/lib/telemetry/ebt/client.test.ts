/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnalyticsServiceSetup } from '@kbn/core-analytics-server';
import { EbtTelemetryClient } from './client';
import {
  STREAMS_ENDPOINT_LATENCY_EVENT,
  STREAMS_STATE_ERROR_EVENT,
  STREAMS_DESCRIPTION_GENERATED_EVENT_TYPE,
  STREAMS_SIGNIFICANT_EVENTS_QUERIES_GENERATED_EVENT_TYPE,
  STREAMS_PROCESSING_PIPELINE_SUGGESTED_EVENT_TYPE,
} from './constants';

describe('EbtTelemetryClient', () => {
  let analyticsService: jest.Mocked<AnalyticsServiceSetup>;
  let client: EbtTelemetryClient;

  beforeEach(() => {
    analyticsService = {
      reportEvent: jest.fn(),
      registerEventType: jest.fn(),
      registerShipper: jest.fn(),
      registerContextProvider: jest.fn(),
      removeContextProvider: jest.fn(),
      optIn: jest.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      telemetryCounter$: {} as any,
    };
    client = new EbtTelemetryClient(analyticsService);
  });

  describe('startTrackingEndpointLatency', () => {
    it('tracks endpoint latency for allowed endpoints', () => {
      jest.useFakeTimers();
      const finishTracking = client.startTrackingEndpointLatency({
        name: 'test-stream',
        endpoint: 'POST /api/streams/{name}/processing/_simulate 2023-10-31',
      });

      jest.advanceTimersByTime(100);
      finishTracking();

      expect(analyticsService.reportEvent).toHaveBeenCalledWith(STREAMS_ENDPOINT_LATENCY_EVENT, {
        name: 'test-stream',
        endpoint: 'POST /api/streams/{name}/processing/_simulate 2023-10-31',
        duration_ms: 100,
      });
      jest.useRealTimers();
    });

    it('does not track latency for non-allowed endpoints', () => {
      const finishTracking = client.startTrackingEndpointLatency({
        name: 'test-stream',
        endpoint: 'GET /api/streams/not-allowed',
      });

      finishTracking();

      expect(analyticsService.reportEvent).not.toHaveBeenCalled();
    });
  });

  describe('reportStreamsStateError', () => {
    it('reports state errors', () => {
      const error = new Error('Test error') as Error & { statusCode: number };
      error.statusCode = 500;
      error.stack = 'Error stack trace';

      client.reportStreamsStateError(error);

      expect(analyticsService.reportEvent).toHaveBeenCalledWith(STREAMS_STATE_ERROR_EVENT, {
        error: {
          name: 'Error',
          message: 'Test error',
          stack_trace: 'Error stack trace',
        },
        status_code: 500,
      });
    });
  });

  describe('trackDescriptionGenerated', () => {
    it('tracks description generated events', () => {
      client.trackDescriptionGenerated({
        input_tokens_used: 200,
        output_tokens_used: 100,
        stream_name: 'test-stream',
        stream_type: 'classic',
      });

      expect(analyticsService.reportEvent).toHaveBeenCalledWith(
        STREAMS_DESCRIPTION_GENERATED_EVENT_TYPE,
        {
          input_tokens_used: 200,
          output_tokens_used: 100,
          stream_name: 'test-stream',
          stream_type: 'classic',
        }
      );
    });
  });

  describe('trackSignificantEventsQueriesGenerated', () => {
    it('tracks significant events queries generated events', () => {
      client.trackSignificantEventsQueriesGenerated({
        count: 5,
        connector_id: 'test-connector',
        input_tokens_used: 300,
        output_tokens_used: 150,
        cached_tokens_used: 20,
        duration_ms: 1200,
        stream_name: 'test-stream',
        stream_type: 'wired',
        tool_usage: {
          get_stream_features: {
            calls: 1,
            failures: 0,
            latency_ms: 100,
          },
          add_queries: {
            calls: 1,
            failures: 0,
            latency_ms: 100,
          },
        },
      });

      expect(analyticsService.reportEvent).toHaveBeenCalledWith(
        STREAMS_SIGNIFICANT_EVENTS_QUERIES_GENERATED_EVENT_TYPE,
        {
          count: 5,
          connector_id: 'test-connector',
          input_tokens_used: 300,
          output_tokens_used: 150,
          cached_tokens_used: 20,
          duration_ms: 1200,
          stream_name: 'test-stream',
          stream_type: 'wired',
          tool_usage: {
            get_stream_features: {
              calls: 1,
              failures: 0,
              latency_ms: 100,
            },
            add_queries: {
              calls: 1,
              failures: 0,
              latency_ms: 100,
            },
          },
        }
      );
    });
  });

  describe('trackProcessingPipelineSuggested', () => {
    it('tracks processing pipeline suggested events on success', () => {
      client.trackProcessingPipelineSuggested({
        duration_ms: 5000,
        steps_used: 4,
        success: true,
        stream_name: 'logs-test',
        stream_type: 'wired',
      });

      expect(analyticsService.reportEvent).toHaveBeenCalledWith(
        STREAMS_PROCESSING_PIPELINE_SUGGESTED_EVENT_TYPE,
        {
          duration_ms: 5000,
          steps_used: 4,
          success: true,
          stream_name: 'logs-test',
          stream_type: 'wired',
        }
      );
    });

    it('tracks processing pipeline suggested events on failure', () => {
      client.trackProcessingPipelineSuggested({
        duration_ms: 2000,
        steps_used: 2,
        success: false,
        stream_name: 'logs-test',
        stream_type: 'classic',
      });

      expect(analyticsService.reportEvent).toHaveBeenCalledWith(
        STREAMS_PROCESSING_PIPELINE_SUGGESTED_EVENT_TYPE,
        {
          duration_ms: 2000,
          steps_used: 2,
          success: false,
          stream_name: 'logs-test',
          stream_type: 'classic',
        }
      );
    });

    it('tracks processing pipeline suggested events when no documents provided', () => {
      client.trackProcessingPipelineSuggested({
        duration_ms: 100,
        steps_used: 0,
        success: false,
        stream_name: 'logs-empty',
        stream_type: 'wired',
      });

      expect(analyticsService.reportEvent).toHaveBeenCalledWith(
        STREAMS_PROCESSING_PIPELINE_SUGGESTED_EVENT_TYPE,
        {
          duration_ms: 100,
          steps_used: 0,
          success: false,
          stream_name: 'logs-empty',
          stream_type: 'wired',
        }
      );
    });
  });
});
