/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { IUiSettingsClient } from '@kbn/core-ui-settings-server';
import type { EbtTelemetryClient } from '../../../lib/telemetry/ebt';
import type { StreamsServer } from '../../../types';
import type { GetScopedClients, RouteHandlerScopedClients } from '../../../routes/types';
import { createMockToolContext, invokeHandler } from '../../utils/test_helpers';
import {
  createFeatureKnowledgeIndicatorTool,
  STREAMS_CREATE_FEATURE_KNOWLEDGE_INDICATOR_TOOL_ID,
} from './tool';
import { assertSignificantEventsAccess } from '../../../routes/utils/assert_significant_events_access';

jest.mock('../../../routes/utils/assert_significant_events_access', () => ({
  assertSignificantEventsAccess: jest.fn(),
}));

describe('ki_feature_create tool', () => {
  const logger = loggingSystemMock.createLogger();
  const server = {} as unknown as StreamsServer;
  const request = {} as unknown as KibanaRequest;
  const uiSettings = {} as unknown as IUiSettingsClient;
  const telemetry = {
    trackAgentBuilderKnowledgeIndicatorCreated: jest.fn(),
  } as unknown as EbtTelemetryClient;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the expected tool id', () => {
    const getScopedClients = jest.fn() as unknown as jest.MockedFunction<GetScopedClients>;
    const tool = createFeatureKnowledgeIndicatorTool({
      getScopedClients,
      server,
      logger,
      telemetry,
    });

    expect(tool.id).toBe(STREAMS_CREATE_FEATURE_KNOWLEDGE_INDICATOR_TOOL_ID);
    expect(tool.id).toBe('platform.sig_events.ki_feature_create');
  });

  it('uses always confirmation policy with custom prompt', async () => {
    const getScopedClients = jest.fn() as unknown as jest.MockedFunction<GetScopedClients>;
    const tool = createFeatureKnowledgeIndicatorTool({
      getScopedClients,
      server,
      logger,
      telemetry,
    });

    expect(tool.confirmation?.askUser).toBe('always');

    const confirmation = await tool.confirmation?.getConfirmation?.({
      toolParams: {
        stream_name: 'logs.test',
        id: 'feature-1',
        type: 'error_pattern',
        description: 'Recurring timeout pattern',
        properties: {},
        confidence: 80,
      },
    });

    expect(confirmation).toEqual(
      expect.objectContaining({
        title: 'Save Feature KI',
        confirm_text: 'Save',
        cancel_text: 'Cancel',
      })
    );
    expect(confirmation?.message).toContain('stream "logs.test"');
    expect(confirmation?.message).toContain('id: "feature-1"');
    expect(confirmation?.message).toContain('type: "error_pattern"');
  });

  it('availability returns available when access check succeeds', async () => {
    (assertSignificantEventsAccess as jest.Mock).mockResolvedValueOnce(undefined);

    const getScopedClients = jest.fn(async () => {
      return { licensing: {}, uiSettingsClient: {} } as unknown as RouteHandlerScopedClients;
    }) as unknown as jest.MockedFunction<GetScopedClients>;

    const tool = createFeatureKnowledgeIndicatorTool({
      getScopedClients,
      server,
      logger,
      telemetry,
    });

    const res = await tool.availability!.handler({ request, uiSettings, spaceId: 'default' });
    expect(res).toEqual({ status: 'available' });
  });

  it('availability returns unavailable when access check throws', async () => {
    (assertSignificantEventsAccess as jest.Mock).mockRejectedValueOnce(new Error('nope'));

    const getScopedClients = jest.fn(async () => {
      return { licensing: {}, uiSettingsClient: {} } as unknown as RouteHandlerScopedClients;
    }) as unknown as jest.MockedFunction<GetScopedClients>;

    const tool = createFeatureKnowledgeIndicatorTool({
      getScopedClients,
      server,
      logger,
      telemetry,
    });

    const res = await tool.availability!.handler({ request, uiSettings, spaceId: 'default' });
    expect(res.status).toBe('unavailable');
  });

  it('tracks success telemetry when feature KI is created', async () => {
    (assertSignificantEventsAccess as jest.Mock).mockResolvedValue(undefined);

    const featureClient = {
      bulk: jest.fn().mockResolvedValue(undefined),
    };

    const getScopedClients = jest.fn(async () => {
      return {
        streamsClient: {
          getStream: jest.fn().mockResolvedValue({
            name: 'logs.test',
            ingest: {
              classic: { field_overrides: {} },
              processing: [],
              lifecycle: { inherit: {} },
              failure_store: { inherit: {} },
            },
          }),
        },
        getKnowledgeIndicatorClient: jest.fn().mockResolvedValue(featureClient),
        licensing: {},
        uiSettingsClient: { get: jest.fn().mockResolvedValue(false) },
      } as unknown as RouteHandlerScopedClients;
    }) as unknown as jest.MockedFunction<GetScopedClients>;

    const tool = createFeatureKnowledgeIndicatorTool({
      getScopedClients,
      server,
      logger,
      telemetry,
    });

    const context = createMockToolContext();
    await invokeHandler(
      tool as never,
      {
        stream_name: 'logs.test',
        id: 'feature-1',
        type: 'custom',
        description: 'desc',
        properties: {},
        confidence: 80,
      },
      context
    );

    expect(telemetry.trackAgentBuilderKnowledgeIndicatorCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        ki_kind: 'feature',
        tool_id: 'ki_feature_create',
        success: true,
        stream_name: 'logs.test',
        stream_type: 'classic',
      })
    );
  });

  it('tracks failure telemetry when feature KI creation fails', async () => {
    (assertSignificantEventsAccess as jest.Mock).mockResolvedValue(undefined);

    const featureClient = {
      bulk: jest.fn().mockRejectedValue(new Error('write failed')),
    };

    const getScopedClients = jest.fn(async () => {
      return {
        streamsClient: {
          getStream: jest.fn().mockResolvedValue({
            name: 'logs.test',
            ingest: {
              classic: { field_overrides: {} },
              processing: [],
              lifecycle: { inherit: {} },
              failure_store: { inherit: {} },
            },
          }),
        },
        getKnowledgeIndicatorClient: jest.fn().mockResolvedValue(featureClient),
        licensing: {},
        uiSettingsClient: { get: jest.fn().mockResolvedValue(false) },
      } as unknown as RouteHandlerScopedClients;
    }) as unknown as jest.MockedFunction<GetScopedClients>;

    const tool = createFeatureKnowledgeIndicatorTool({
      getScopedClients,
      server,
      logger,
      telemetry,
    });

    const context = createMockToolContext();
    await invokeHandler(
      tool as never,
      {
        stream_name: 'logs.test',
        id: 'feature-1',
        type: 'custom',
        description: 'desc',
        properties: {},
        confidence: 80,
      },
      context
    );

    expect(telemetry.trackAgentBuilderKnowledgeIndicatorCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        ki_kind: 'feature',
        tool_id: 'ki_feature_create',
        success: false,
        stream_name: 'logs.test',
        stream_type: 'classic',
        error_message: 'write failed',
      })
    );
  });
});
