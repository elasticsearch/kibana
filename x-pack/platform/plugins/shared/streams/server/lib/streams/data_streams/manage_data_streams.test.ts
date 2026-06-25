/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  getTemplateLifecycle,
  simulateClassicStreamTemplate,
  updateDataStreamsFailureStore,
  updateDataStreamsLifecycle,
} from './manage_data_streams';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { FailureStore } from '@kbn/streams-schema/src/models/ingest/failure_store';
import type { Streams } from '@kbn/streams-schema';

type MockLogger = Pick<Logger, 'debug' | 'error' | 'info' | 'warn'>;

const createMockLogger = (): jest.Mocked<MockLogger> => ({
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
});

const createMockWiredStream = (name: string): Streams.WiredStream.Definition => ({
  type: 'wired',
  name,
  description: 'Test wired stream',
  updated_at: new Date().toISOString(),
  ingest: {
    lifecycle: { inherit: {} },
    processing: { steps: [], updated_at: new Date().toISOString() },
    settings: {},
    wired: { fields: {}, routing: [] },
    failure_store: { inherit: {} },
  },
});

const createMockClassicStream = (name: string): Streams.ClassicStream.Definition => ({
  type: 'classic',
  name,
  description: 'Test classic stream',
  updated_at: new Date().toISOString(),
  ingest: {
    lifecycle: { inherit: {} },
    processing: { steps: [], updated_at: new Date().toISOString() },
    settings: {},
    classic: {},
    failure_store: { inherit: {} },
  },
});

describe('getTemplateLifecycle', () => {
  it('returns dsl when only dsl is enabled', () => {
    const result = getTemplateLifecycle({
      aliases: {},
      mappings: {},
      lifecycle: { enabled: true, data_retention: '30d' },
      settings: { index: { lifecycle: { prefer_ilm: false } } },
    });
    expect(result).toEqual({ dsl: { data_retention: '30d' } });
  });

  it('maps template downsampling into dsl downsample', () => {
    const result = getTemplateLifecycle({
      aliases: {},
      mappings: {},
      lifecycle: {
        enabled: true,
        data_retention: '30d',
        downsampling: [{ after: '1d', fixed_interval: '1h' }],
      },
      settings: { index: { lifecycle: { prefer_ilm: false } } },
    });
    expect(result).toEqual({
      dsl: { data_retention: '30d', downsample: [{ after: '1d', fixed_interval: '1h' }] },
    });
  });

  it('returns dsl when enabled is omitted but data_retention is set', () => {
    const result = getTemplateLifecycle({
      aliases: {},
      mappings: {},
      lifecycle: { data_retention: '30d' },
      settings: { index: { lifecycle: { prefer_ilm: false } } },
    });
    expect(result).toEqual({ dsl: { data_retention: '30d' } });
  });

  it('returns dsl when dsl and ilm are enabled but no policy is set', () => {
    const result = getTemplateLifecycle({
      aliases: {},
      mappings: {},
      lifecycle: { enabled: true, data_retention: '30d' },
      settings: { index: { lifecycle: { prefer_ilm: true } } },
    });
    expect(result).toEqual({ dsl: { data_retention: '30d' } });
  });

  it('returns ilm when only ilm is enabled', () => {
    const result = getTemplateLifecycle({
      aliases: {},
      mappings: {},
      settings: { index: { lifecycle: { name: 'my-ilm-policy', prefer_ilm: true } } },
    });
    expect(result).toEqual({ ilm: { policy: 'my-ilm-policy' } });
  });

  it('returns ilm when only ilm is enabled even though prefer_ilm is false', () => {
    const result = getTemplateLifecycle({
      aliases: {},
      mappings: {},
      settings: { index: { lifecycle: { name: 'my-ilm-policy', prefer_ilm: false } } },
    });
    expect(result).toEqual({ ilm: { policy: 'my-ilm-policy' } });
  });

  it('returns ilm when dsl is disabled and prefer_ilm is false', () => {
    const result = getTemplateLifecycle({
      aliases: {},
      mappings: {},
      lifecycle: { enabled: false, data_retention: '1d' },
      settings: { index: { lifecycle: { name: 'my-ilm-policy', prefer_ilm: false } } },
    });
    expect(result).toEqual({ ilm: { policy: 'my-ilm-policy' } });
  });

  it('returns ilm when ilm and dsl are enabled but prefer_ilm is true', () => {
    const result = getTemplateLifecycle({
      aliases: {},
      mappings: {},
      lifecycle: { enabled: true, data_retention: '30d' },
      settings: { index: { lifecycle: { name: 'my-ilm-policy', prefer_ilm: true } } },
    });
    expect(result).toEqual({ ilm: { policy: 'my-ilm-policy' } });
  });

  it('returns ilm when ilm and dsl are enabled and prefer_ilm is omitted (ES defaults to true)', () => {
    const result = getTemplateLifecycle({
      aliases: {},
      mappings: {},
      lifecycle: { enabled: true },
      settings: { index: { lifecycle: { name: 'my-ilm-policy' } } },
    });
    expect(result).toEqual({ ilm: { policy: 'my-ilm-policy' } });
  });

  it('returns disabled when neither dsl nor ilm are enabled', () => {
    const result = getTemplateLifecycle({
      aliases: {},
      settings: {},
      mappings: {},
      lifecycle: { enabled: false },
    });
    expect(result).toEqual({ disabled: {} });
  });
});

describe('updateDataStreamsLifecycle downsampling', () => {
  interface DownsamplingEsClient {
    indices: Pick<ElasticsearchClient['indices'], 'putDataLifecycle'>;
  }

  let mockEsClient: jest.Mocked<DownsamplingEsClient>;
  let mockLogger: jest.Mocked<MockLogger>;

  beforeEach(() => {
    mockEsClient = {
      indices: {
        putDataLifecycle: jest.fn().mockResolvedValue({}),
      },
    };

    mockLogger = createMockLogger();
  });

  it('passes downsampling settings when provided', async () => {
    await updateDataStreamsLifecycle({
      esClient: mockEsClient as unknown as ElasticsearchClient,
      logger: mockLogger as unknown as Logger,
      names: ['test-stream'],
      lifecycle: {
        dsl: {
          data_retention: '30d',
          downsample: [{ after: '1d', fixed_interval: '1h' }],
        },
      },
      isServerless: true,
    });

    expect(mockEsClient.indices.putDataLifecycle).toHaveBeenCalledWith({
      name: ['test-stream'],
      data_retention: '30d',
      downsampling: [{ after: '1d', fixed_interval: '1h' }],
    });
  });

  it('omits downsampling when no steps are provided', async () => {
    await updateDataStreamsLifecycle({
      esClient: mockEsClient as unknown as ElasticsearchClient,
      logger: mockLogger as unknown as Logger,
      names: ['test-stream'],
      lifecycle: {
        dsl: {
          data_retention: '30d',
          downsample: [],
        },
      },
      isServerless: true,
    });

    expect(mockEsClient.indices.putDataLifecycle).toHaveBeenCalledWith({
      name: ['test-stream'],
      data_retention: '30d',
    });
  });
});

describe('updateDataStreamsLifecycle inherit', () => {
  interface InheritEsClient {
    indices: Pick<
      ElasticsearchClient['indices'],
      | 'getDataStream'
      | 'simulateTemplate'
      | 'simulateIndexTemplate'
      | 'putDataLifecycle'
      | 'deleteDataLifecycle'
      | 'putDataStreamSettings'
    >;
  }

  let mockEsClient: jest.Mocked<InheritEsClient>;
  let mockLogger: jest.Mocked<MockLogger>;

  beforeEach(() => {
    mockEsClient = {
      indices: {
        getDataStream: jest.fn().mockResolvedValue({
          data_streams: [{ name: 'logs-foo-default', template: 'logs-foo-template' }],
        }),
        // Simulating the template by name returns the pristine template lifecycle
        // without the data stream's lingering ILM overrides.
        simulateTemplate: jest.fn().mockResolvedValue({
          template: {
            settings: { index: { lifecycle: { prefer_ilm: false } } },
            lifecycle: {
              enabled: true,
              data_retention: '80d',
              downsampling: [{ after: '7d', fixed_interval: '1h' }],
            },
          },
        }),
        simulateIndexTemplate: jest.fn().mockResolvedValue({}),
        putDataLifecycle: jest.fn().mockResolvedValue({}),
        deleteDataLifecycle: jest.fn().mockResolvedValue({}),
        putDataStreamSettings: jest.fn().mockResolvedValue({ data_streams: [] }),
      },
    };

    mockLogger = createMockLogger();
  });

  it('resolves the template by name (not against the existing data stream) and applies the inherited DSL retention', async () => {
    await updateDataStreamsLifecycle({
      esClient: mockEsClient as unknown as ElasticsearchClient,
      logger: mockLogger as unknown as Logger,
      names: ['logs-foo-default'],
      lifecycle: { inherit: {} },
      isServerless: false,
    });

    // Resolving by template name means the simulation is not contaminated by the
    // data stream's current index.lifecycle settings.
    expect(mockEsClient.indices.simulateTemplate).toHaveBeenCalledWith({
      name: 'logs-foo-template',
    });
    expect(mockEsClient.indices.putDataLifecycle).toHaveBeenCalledWith({
      name: 'logs-foo-default',
      data_retention: '80d',
      downsampling: [{ after: '7d', fixed_interval: '1h' }],
    });
    expect(mockEsClient.indices.deleteDataLifecycle).not.toHaveBeenCalled();
  });

  it('fails closed when the backing template cannot be simulated', async () => {
    mockEsClient.indices.simulateTemplate = jest.fn().mockResolvedValue({});

    await expect(
      updateDataStreamsLifecycle({
        esClient: mockEsClient as unknown as ElasticsearchClient,
        logger: mockLogger as unknown as Logger,
        names: ['logs-foo-default'],
        lifecycle: { inherit: {} },
        isServerless: false,
      })
    ).rejects.toThrow('Cannot determine template lifecycle for logs-foo-default');
  });
});

describe('updateDataStreamsFailureStore', () => {
  interface FailureStoreEsClient {
    indices: Pick<ElasticsearchClient['indices'], 'putDataStreamOptions' | 'simulateIndexTemplate'>;
  }

  let mockEsClient: jest.Mocked<FailureStoreEsClient>;
  let mockLogger: jest.Mocked<MockLogger>;

  beforeEach(() => {
    mockEsClient = {
      indices: {
        putDataStreamOptions: jest.fn().mockResolvedValue({}),
        simulateIndexTemplate: jest.fn().mockResolvedValue({
          template: {
            data_stream_options: {
              failure_store: { enabled: true, lifecycle: { enabled: true, data_retention: '7d' } },
            },
          },
        }),
      },
    };

    mockLogger = createMockLogger();
  });

  it('enables failure store with lifecycle data retention', async () => {
    const failureStore: FailureStore = {
      lifecycle: { enabled: { data_retention: '30d' } },
    };

    await updateDataStreamsFailureStore({
      esClient: mockEsClient as unknown as ElasticsearchClient,
      logger: mockLogger as unknown as Logger,
      failureStore,
      stream: createMockWiredStream('test-stream'),
      isServerless: false,
    });

    expect(mockEsClient.indices.putDataStreamOptions).toHaveBeenCalledWith(
      {
        name: 'test-stream',
        failure_store: {
          enabled: true,
          lifecycle: { data_retention: '30d', enabled: true },
        },
      },
      { meta: true }
    );
  });

  it('enables failure store without lifecycle data retention', async () => {
    const failureStore: FailureStore = {
      lifecycle: { enabled: {} },
    };

    await updateDataStreamsFailureStore({
      esClient: mockEsClient as unknown as ElasticsearchClient,
      logger: mockLogger as unknown as Logger,
      failureStore,
      stream: createMockWiredStream('test-stream'),
      isServerless: false,
    });

    expect(mockEsClient.indices.putDataStreamOptions).toHaveBeenCalledWith(
      {
        name: 'test-stream',
        failure_store: {
          enabled: true,
        },
      },
      { meta: true }
    );
  });

  it('disables failure store lifecycle in non-serverless', async () => {
    const failureStore: FailureStore = {
      lifecycle: { disabled: {} },
    };

    await updateDataStreamsFailureStore({
      esClient: mockEsClient as unknown as ElasticsearchClient,
      logger: mockLogger as unknown as Logger,
      failureStore,
      stream: createMockWiredStream('test-stream'),
      isServerless: false,
    });

    expect(mockEsClient.indices.putDataStreamOptions).toHaveBeenCalledWith(
      {
        name: 'test-stream',
        failure_store: { enabled: true, lifecycle: { enabled: false } },
      },
      { meta: true }
    );
  });

  it('do not disable failure store lifecycle in serverless', async () => {
    const failureStore: FailureStore = {
      lifecycle: { disabled: {} },
    };

    await updateDataStreamsFailureStore({
      esClient: mockEsClient as unknown as ElasticsearchClient,
      logger: mockLogger as unknown as Logger,
      failureStore,
      stream: createMockWiredStream('test-stream'),
      isServerless: true,
    });

    expect(mockEsClient.indices.putDataStreamOptions).toHaveBeenCalledWith(
      {
        name: 'test-stream',
        failure_store: {
          enabled: true,
        },
      },
      { meta: true }
    );
  });

  it('disables failure store', async () => {
    const failureStore: FailureStore = {
      disabled: {},
    };

    await updateDataStreamsFailureStore({
      esClient: mockEsClient as unknown as ElasticsearchClient,
      logger: mockLogger as unknown as Logger,
      failureStore,
      stream: createMockWiredStream('test-stream'),
      isServerless: false,
    });

    expect(mockEsClient.indices.putDataStreamOptions).toHaveBeenCalledWith(
      {
        name: 'test-stream',
        failure_store: {
          enabled: false,
        },
      },
      { meta: true }
    );
  });

  it('uses template defaults when failureStore is set to inherit', async () => {
    const failureStore: FailureStore = {
      inherit: {},
    };

    await updateDataStreamsFailureStore({
      esClient: mockEsClient as unknown as ElasticsearchClient,
      logger: mockLogger as unknown as Logger,
      failureStore,
      stream: createMockClassicStream('test-stream'),
      isServerless: false,
    });

    expect(mockEsClient.indices.simulateIndexTemplate).toHaveBeenCalledWith({
      name: 'test-stream',
    });

    expect(mockEsClient.indices.putDataStreamOptions).toHaveBeenCalledWith(
      {
        name: 'test-stream',
        failure_store: {
          enabled: true,
          lifecycle: { enabled: true, data_retention: '7d' },
        },
      },
      { meta: true }
    );
  });

  it('disables failure store when failureStore is set to inherit and template has no failure store config', async () => {
    mockEsClient.indices.simulateIndexTemplate = jest.fn().mockResolvedValue({
      template: {},
    });

    const failureStore: FailureStore = {
      inherit: {},
    };

    await updateDataStreamsFailureStore({
      esClient: mockEsClient as unknown as ElasticsearchClient,
      logger: mockLogger as unknown as Logger,
      failureStore,
      stream: createMockClassicStream('test-stream'),
      isServerless: false,
    });

    expect(mockEsClient.indices.simulateIndexTemplate).toHaveBeenCalledWith({
      name: 'test-stream',
    });

    expect(mockEsClient.indices.putDataStreamOptions).toHaveBeenCalledWith(
      {
        name: 'test-stream',
        failure_store: {
          enabled: false,
        },
      },
      { meta: true }
    );
  });

  it('logs and throws error when putDataStreamOptions fails', async () => {
    const failureStore: FailureStore = {
      lifecycle: { enabled: { data_retention: '30d' } },
    };

    const error = new Error('Elasticsearch error');
    mockEsClient.indices.putDataStreamOptions = jest.fn().mockRejectedValue(error);

    await expect(
      updateDataStreamsFailureStore({
        esClient: mockEsClient as unknown as ElasticsearchClient,
        logger: mockLogger as unknown as Logger,
        failureStore,
        stream: createMockWiredStream('test-stream'),
        isServerless: false,
      })
    ).rejects.toThrow('Elasticsearch error');

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error updating data stream failure store: Elasticsearch error'
    );
  });

  it('logs and throws error when simulateIndexTemplate fails', async () => {
    const error = new Error('Template simulation error');
    mockEsClient.indices.simulateIndexTemplate = jest.fn().mockRejectedValue(error);

    await expect(
      updateDataStreamsFailureStore({
        esClient: mockEsClient as unknown as ElasticsearchClient,
        logger: mockLogger as unknown as Logger,
        failureStore: { inherit: {} },
        stream: createMockClassicStream('test-stream'),
        isServerless: false,
      })
    ).rejects.toThrow('Template simulation error');

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error updating data stream failure store: Template simulation error'
    );
  });
});

describe('simulateClassicStreamTemplate', () => {
  let mockGetDataStream: jest.Mock;
  let mockSimulateTemplate: jest.Mock;
  let mockSimulateIndexTemplate: jest.Mock;
  let mockEsClient: {
    indices: {
      getDataStream: jest.Mock;
      simulateTemplate: jest.Mock;
      simulateIndexTemplate: jest.Mock;
    };
  };
  let mockLogger: jest.Mocked<MockLogger>;

  beforeEach(() => {
    mockGetDataStream = jest.fn().mockResolvedValue({
      data_streams: [{ name: 'logs-foo-default', template: 'logs-foo-template' }],
    });
    mockSimulateTemplate = jest.fn().mockResolvedValue({
      template: {
        settings: { index: { lifecycle: { name: 'my-ilm-policy', prefer_ilm: true } } },
      },
    });
    mockSimulateIndexTemplate = jest.fn().mockResolvedValue({
      template: {
        settings: { index: { lifecycle: { name: 'my-ilm-policy', prefer_ilm: true } } },
      },
    });
    mockEsClient = {
      indices: {
        getDataStream: mockGetDataStream,
        simulateTemplate: mockSimulateTemplate,
        simulateIndexTemplate: mockSimulateIndexTemplate,
      },
    };
    mockLogger = createMockLogger();
  });

  it('simulates the backing template by name (not against an index)', async () => {
    const template = await simulateClassicStreamTemplate({
      esClient: mockEsClient as unknown as ElasticsearchClient,
      name: 'logs-foo-default',
      logger: mockLogger as unknown as Logger,
    });

    expect(mockGetDataStream).toHaveBeenCalledWith({ name: 'logs-foo-default' });
    // Resolving by template name avoids merging in the existing data stream's settings.
    expect(mockSimulateTemplate).toHaveBeenCalledWith({ name: 'logs-foo-template' });
    expect(mockSimulateIndexTemplate).not.toHaveBeenCalled();
    expect(getTemplateLifecycle(template!)).toEqual({ ilm: { policy: 'my-ilm-policy' } });
  });

  it('returns the pristine DSL lifecycle for an exact-pattern template even when the data stream has an ILM override (regression)', async () => {
    // Reproduces a classic stream whose template uses an exact index pattern
    // (e.g. `my-exact-stream`) and whose data stream has a lingering ILM override.
    // Resolving by template name must surface the template's DSL retention, not the
    // override's ILM policy.
    mockSimulateTemplate.mockResolvedValue({
      template: {
        settings: { index: { lifecycle: { prefer_ilm: false } } },
        lifecycle: { enabled: true, data_retention: '80d' },
      },
    });

    const template = await simulateClassicStreamTemplate({
      esClient: mockEsClient as unknown as ElasticsearchClient,
      name: 'my-exact-stream',
      logger: mockLogger as unknown as Logger,
    });

    expect(mockSimulateTemplate).toHaveBeenCalledWith({ name: 'logs-foo-template' });
    expect(getTemplateLifecycle(template!)).toEqual({ dsl: { data_retention: '80d' } });
  });

  it('falls back to simulating the stream name when the backing template cannot be resolved', async () => {
    mockGetDataStream.mockRejectedValue(new Error('not found'));

    await simulateClassicStreamTemplate({
      esClient: mockEsClient as unknown as ElasticsearchClient,
      name: 'logs-foo-default',
      logger: mockLogger as unknown as Logger,
    });

    expect(mockSimulateTemplate).not.toHaveBeenCalled();
    expect(mockSimulateIndexTemplate).toHaveBeenCalledWith({ name: 'logs-foo-default' });
  });

  it('returns undefined for an empty simulated template (e.g. replicated streams)', async () => {
    mockSimulateTemplate.mockResolvedValue({});

    const template = await simulateClassicStreamTemplate({
      esClient: mockEsClient as unknown as ElasticsearchClient,
      name: 'logs-foo-default',
      logger: mockLogger as unknown as Logger,
    });

    expect(template).toBeUndefined();
  });

  it('degrades to undefined when the template simulation fails', async () => {
    mockSimulateTemplate.mockRejectedValue(new Error('boom'));

    const template = await simulateClassicStreamTemplate({
      esClient: mockEsClient as unknown as ElasticsearchClient,
      name: 'logs-foo-default',
      logger: mockLogger as unknown as Logger,
    });

    expect(template).toBeUndefined();
  });
});
