/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Output, FullAgentPolicyInput, TemplateAgentPolicyInput } from '../../types';

import { OTEL_COLLECTOR_INPUT_TYPE, outputType } from '../../../common/constants';

import { generateOtelcolConfig } from './otel_collector';

describe('generateOtelcolConfig', () => {
  const defaultOutput: Output = {
    type: 'elasticsearch',
    is_default: true,
    is_default_monitoring: true,
    name: 'default',
    id: 'fleet-default-output',
    hosts: ['http://localhost:9200'],
  };

  const logInput: FullAgentPolicyInput = {
    type: 'log',
    id: 'test',
    name: 'test',
    revision: 0,
    data_stream: {
      namespace: 'default',
    },
    use_output: 'default',
    package_policy_id: '123',
  };

  const otelInput1: FullAgentPolicyInput = {
    type: OTEL_COLLECTOR_INPUT_TYPE,
    id: 'test-1',
    name: 'test-1',
    revision: 0,
    data_stream: {
      namespace: 'testing',
    },
    use_output: 'default',
    package_policy_id: 'somepolicy',
    streams: [
      {
        id: 'stream-id-1',
        data_stream: {
          dataset: 'somedataset',
          type: 'metrics',
        },
        receivers: {
          httpcheck: {
            targets: [
              {
                endpoints: ['https://epr.elastic.co'],
              },
            ],
          },
        },
        processors: {
          transform: {
            metric_statements: ['set(metric.description, "Sum") where metric.type == "Sum"'],
          },
        },
        service: {
          pipelines: {
            metrics: {
              receivers: ['httpcheck'],
              processors: ['transform'],
            },
          },
        },
      },
    ],
  };

  const otelInput2: FullAgentPolicyInput = {
    type: OTEL_COLLECTOR_INPUT_TYPE,
    id: 'test-2',
    name: 'test-2',
    revision: 0,
    data_stream: {
      namespace: 'default',
    },
    use_output: 'default',
    package_policy_id: 'otherpolicy',
    streams: [
      {
        id: 'stream-id-1',
        data_stream: {
          dataset: 'otherdataset',
          type: 'metrics',
        },
        receivers: {
          httpcheck: {
            targets: [
              {
                endpoints: ['https://www.elastic.co'],
              },
            ],
          },
        },
        processors: {
          transform: {
            metric_statements: ['set(metric.description, "Sum") where metric.type == "Sum"'],
          },
        },
        service: {
          pipelines: {
            metrics: {
              receivers: ['httpcheck'],
              processors: ['transform'],
            },
          },
        },
      },
    ],
  };

  const otelInputTemplate: TemplateAgentPolicyInput = {
    type: OTEL_COLLECTOR_INPUT_TYPE,
    id: 'test-1',
    streams: [
      {
        id: 'stream-id-1',
        data_stream: {
          dataset: 'somedataset',
          type: 'metrics',
        },
        receivers: {
          httpcheck: {
            targets: [
              {
                endpoints: ['https://epr.elastic.co'],
              },
            ],
          },
        },
        processors: {
          transform: {
            metric_statements: ['set(metric.description, "Sum") where metric.type == "Sum"'],
          },
        },
        service: {
          pipelines: {
            metrics: {
              receivers: ['httpcheck'],
              processors: ['transform'],
            },
          },
        },
      },
    ],
  };

  const otelInputMultipleComponentsSameType: FullAgentPolicyInput = {
    type: OTEL_COLLECTOR_INPUT_TYPE,
    id: 'test-3',
    name: 'test-3',
    revision: 0,
    data_stream: {
      namespace: 'default',
    },
    use_output: 'default',
    package_policy_id: 'otherpolicy',
    streams: [
      {
        id: 'stream-id-1',
        data_stream: {
          dataset: 'somedataset',
          type: 'metrics',
        },
        receivers: {
          'httpcheck/1': {
            targets: [
              {
                endpoints: ['https://epr.elastic.co'],
              },
            ],
          },
          'httpcheck/2': {
            targets: [
              {
                endpoints: ['https://epr.elastic.co'],
              },
            ],
          },
        },
        processors: {
          'transform/1': {
            metric_statements: ['set(metric.description, "Sum") where metric.type == "Sum"'],
          },
          'transform/2': {
            metric_statements: ['set(metric.description, "Sum") where metric.type == "Sum"'],
          },
        },
        service: {
          pipelines: {
            metrics: {
              receivers: ['httpcheck/1', 'httpcheck/2'],
              processors: ['transform/1', 'transform/2'],
            },
          },
        },
      },
    ],
  };

  const otelTracesInputWithAPM: FullAgentPolicyInput = {
    type: OTEL_COLLECTOR_INPUT_TYPE,
    id: 'test-traces',
    name: 'test-traces',
    revision: 0,
    data_stream: {
      namespace: 'apmtest',
    },
    use_output: 'default',
    package_policy_id: 'tracespolicy',
    streams: [
      {
        id: 'stream-id-1',
        data_stream: {
          dataset: 'zipkinreceiver',
          type: 'traces',
        },
        use_apm: true,
        receivers: {
          zipkin: {
            endpoint: 'localhost:9411',
          },
        },
        service: {
          pipelines: {
            traces: {
              receivers: ['zipkin'],
            },
          },
        },
      },
    ],
  };

  it('should be empty if there is no input', () => {
    const inputs: FullAgentPolicyInput[] = [];
    expect(generateOtelcolConfig({ inputs, dataOutput: defaultOutput })).toEqual({});
  });

  it('should be empty if there is no otel config', () => {
    const inputs: FullAgentPolicyInput[] = [logInput];
    expect(generateOtelcolConfig({ inputs, dataOutput: defaultOutput })).toEqual({});
  });

  it('should return the otel config when there is one', () => {
    const inputs: FullAgentPolicyInput[] = [otelInput1];
    expect(generateOtelcolConfig({ inputs, dataOutput: defaultOutput })).toEqual({
      receivers: {
        'httpcheck/test-1-stream-id-1': {
          targets: [
            {
              endpoints: ['https://epr.elastic.co'],
            },
          ],
        },
      },
      processors: {
        'transform/test-1-stream-id-1': {
          metric_statements: ['set(metric.description, "Sum") where metric.type == "Sum"'],
        },
        'transform/test-1-stream-id-1-routing': {
          metric_statements: [
            {
              context: 'datapoint',
              statements: [
                'set(attributes["data_stream.type"], "metrics")',
                'set(attributes["data_stream.dataset"], "somedataset")',
                'set(attributes["data_stream.namespace"], "testing")',
              ],
            },
          ],
        },
      },
      connectors: {
        'forward/default': {},
      },
      exporters: {
        'elasticsearch/default': {
          endpoints: ['http://localhost:9200'],
        },
      },
      service: {
        pipelines: {
          'metrics/test-1-stream-id-1': {
            receivers: ['httpcheck/test-1-stream-id-1'],
            processors: ['transform/test-1-stream-id-1', 'transform/test-1-stream-id-1-routing'],
            exporters: ['forward/default'],
          },
          'metrics/default': {
            receivers: ['forward/default'],
            exporters: ['elasticsearch/default'],
          },
        },
      },
    });
  });

  it('should use the output id when it is not the default', () => {
    const inputs: FullAgentPolicyInput[] = [otelInput1];
    expect(
      generateOtelcolConfig({ inputs, dataOutput: { ...defaultOutput, is_default: false } })
    ).toEqual({
      receivers: {
        'httpcheck/test-1-stream-id-1': {
          targets: [
            {
              endpoints: ['https://epr.elastic.co'],
            },
          ],
        },
      },
      processors: {
        'transform/test-1-stream-id-1': {
          metric_statements: ['set(metric.description, "Sum") where metric.type == "Sum"'],
        },
        'transform/test-1-stream-id-1-routing': {
          metric_statements: [
            {
              context: 'datapoint',
              statements: [
                'set(attributes["data_stream.type"], "metrics")',
                'set(attributes["data_stream.dataset"], "somedataset")',
                'set(attributes["data_stream.namespace"], "testing")',
              ],
            },
          ],
        },
      },
      connectors: {
        'forward/fleet-default-output': {},
      },
      exporters: {
        'elasticsearch/fleet-default-output': {
          endpoints: ['http://localhost:9200'],
        },
      },
      service: {
        pipelines: {
          'metrics/test-1-stream-id-1': {
            receivers: ['httpcheck/test-1-stream-id-1'],
            processors: ['transform/test-1-stream-id-1', 'transform/test-1-stream-id-1-routing'],
            exporters: ['forward/fleet-default-output'],
          },
          'metrics/fleet-default-output': {
            receivers: ['forward/fleet-default-output'],
            exporters: ['elasticsearch/fleet-default-output'],
          },
        },
      },
    });
  });

  it('should return the otel config if there is any', () => {
    const inputs: FullAgentPolicyInput[] = [logInput, otelInput1];
    expect(generateOtelcolConfig({ inputs, dataOutput: defaultOutput })).toEqual({
      receivers: {
        'httpcheck/test-1-stream-id-1': {
          targets: [
            {
              endpoints: ['https://epr.elastic.co'],
            },
          ],
        },
      },
      processors: {
        'transform/test-1-stream-id-1': {
          metric_statements: ['set(metric.description, "Sum") where metric.type == "Sum"'],
        },
        'transform/test-1-stream-id-1-routing': {
          metric_statements: [
            {
              context: 'datapoint',
              statements: [
                'set(attributes["data_stream.type"], "metrics")',
                'set(attributes["data_stream.dataset"], "somedataset")',
                'set(attributes["data_stream.namespace"], "testing")',
              ],
            },
          ],
        },
      },
      connectors: {
        'forward/default': {},
      },
      exporters: {
        'elasticsearch/default': {
          endpoints: ['http://localhost:9200'],
        },
      },
      service: {
        pipelines: {
          'metrics/test-1-stream-id-1': {
            receivers: ['httpcheck/test-1-stream-id-1'],
            processors: ['transform/test-1-stream-id-1', 'transform/test-1-stream-id-1-routing'],
            exporters: ['forward/default'],
          },
          'metrics/default': {
            receivers: ['forward/default'],
            exporters: ['elasticsearch/default'],
          },
        },
      },
    });
  });

  it('should also work for templates', () => {
    const inputs: TemplateAgentPolicyInput[] = [otelInputTemplate];
    expect(generateOtelcolConfig({ inputs })).toEqual({
      receivers: {
        'httpcheck/test-1-stream-id-1': {
          targets: [
            {
              endpoints: ['https://epr.elastic.co'],
            },
          ],
        },
      },
      processors: {
        'transform/test-1-stream-id-1': {
          metric_statements: ['set(metric.description, "Sum") where metric.type == "Sum"'],
        },
        'transform/test-1-stream-id-1-routing': {
          metric_statements: [
            {
              context: 'datapoint',
              statements: [
                'set(attributes["data_stream.type"], "metrics")',
                'set(attributes["data_stream.dataset"], "somedataset")',
                'set(attributes["data_stream.namespace"], "default")',
              ],
            },
          ],
        },
      },
      service: {
        pipelines: {
          'metrics/test-1-stream-id-1': {
            receivers: ['httpcheck/test-1-stream-id-1'],
            processors: ['transform/test-1-stream-id-1', 'transform/test-1-stream-id-1-routing'],
          },
        },
      },
    });
  });

  it('should merge otel configs', () => {
    const inputs: FullAgentPolicyInput[] = [logInput, otelInput1, otelInput2];
    expect(generateOtelcolConfig({ inputs, dataOutput: defaultOutput })).toEqual({
      receivers: {
        'httpcheck/test-1-stream-id-1': {
          targets: [
            {
              endpoints: ['https://epr.elastic.co'],
            },
          ],
        },
        'httpcheck/test-2-stream-id-1': {
          targets: [
            {
              endpoints: ['https://www.elastic.co'],
            },
          ],
        },
      },
      processors: {
        'transform/test-1-stream-id-1': {
          metric_statements: ['set(metric.description, "Sum") where metric.type == "Sum"'],
        },
        'transform/test-2-stream-id-1': {
          metric_statements: ['set(metric.description, "Sum") where metric.type == "Sum"'],
        },
        'transform/test-1-stream-id-1-routing': {
          metric_statements: [
            {
              context: 'datapoint',
              statements: [
                'set(attributes["data_stream.type"], "metrics")',
                'set(attributes["data_stream.dataset"], "somedataset")',
                'set(attributes["data_stream.namespace"], "testing")',
              ],
            },
          ],
        },
        'transform/test-2-stream-id-1-routing': {
          metric_statements: [
            {
              context: 'datapoint',
              statements: [
                'set(attributes["data_stream.type"], "metrics")',
                'set(attributes["data_stream.dataset"], "otherdataset")',
                'set(attributes["data_stream.namespace"], "default")',
              ],
            },
          ],
        },
      },
      connectors: {
        'forward/default': {},
      },
      exporters: {
        'elasticsearch/default': {
          endpoints: ['http://localhost:9200'],
        },
      },
      service: {
        pipelines: {
          'metrics/test-1-stream-id-1': {
            receivers: ['httpcheck/test-1-stream-id-1'],
            processors: ['transform/test-1-stream-id-1', 'transform/test-1-stream-id-1-routing'],
            exporters: ['forward/default'],
          },
          'metrics/test-2-stream-id-1': {
            receivers: ['httpcheck/test-2-stream-id-1'],
            processors: ['transform/test-2-stream-id-1', 'transform/test-2-stream-id-1-routing'],
            exporters: ['forward/default'],
          },
          'metrics/default': {
            receivers: ['forward/default'],
            exporters: ['elasticsearch/default'],
          },
        },
      },
    });
  });

  it('should keep components with the same type', () => {
    const inputs: FullAgentPolicyInput[] = [otelInputMultipleComponentsSameType];
    expect(generateOtelcolConfig({ inputs, dataOutput: defaultOutput })).toEqual({
      receivers: {
        'httpcheck/1/test-3-stream-id-1': {
          targets: [
            {
              endpoints: ['https://epr.elastic.co'],
            },
          ],
        },
        'httpcheck/2/test-3-stream-id-1': {
          targets: [
            {
              endpoints: ['https://epr.elastic.co'],
            },
          ],
        },
      },
      processors: {
        'transform/1/test-3-stream-id-1': {
          metric_statements: ['set(metric.description, "Sum") where metric.type == "Sum"'],
        },
        'transform/2/test-3-stream-id-1': {
          metric_statements: ['set(metric.description, "Sum") where metric.type == "Sum"'],
        },
        'transform/test-3-stream-id-1-routing': {
          metric_statements: [
            {
              context: 'datapoint',
              statements: [
                'set(attributes["data_stream.type"], "metrics")',
                'set(attributes["data_stream.dataset"], "somedataset")',
                'set(attributes["data_stream.namespace"], "default")',
              ],
            },
          ],
        },
      },
      connectors: {
        'forward/default': {},
      },
      exporters: {
        'elasticsearch/default': {
          endpoints: ['http://localhost:9200'],
        },
      },
      service: {
        pipelines: {
          'metrics/test-3-stream-id-1': {
            receivers: ['httpcheck/1/test-3-stream-id-1', 'httpcheck/2/test-3-stream-id-1'],
            processors: [
              'transform/1/test-3-stream-id-1',
              'transform/2/test-3-stream-id-1',
              'transform/test-3-stream-id-1-routing',
            ],
            exporters: ['forward/default'],
          },
          'metrics/default': {
            receivers: ['forward/default'],
            exporters: ['elasticsearch/default'],
          },
        },
      },
    });
  });

  it('should suffix service.extensions and auth.authenticator references to match suffixed extension keys (bearertokenauth regression)', () => {
    const inputId = 'otlp-input-1';
    const streamId = 'stream-id-1';
    const expectedSuffix = `${inputId}-${streamId}`;

    const otelInputWithExtension: FullAgentPolicyInput = {
      type: OTEL_COLLECTOR_INPUT_TYPE,
      id: inputId,
      name: inputId,
      revision: 0,
      data_stream: { namespace: 'default' },
      use_output: 'default',
      package_policy_id: 'mypolicy',
      streams: [
        {
          id: streamId,
          data_stream: { dataset: 'generic.otel', type: 'logs' },
          extensions: {
            bearertokenauth: { token: 'secret' },
          },
          receivers: {
            otlp: {
              protocols: {
                grpc: {
                  endpoint: '0.0.0.0:4317',
                  auth: { authenticator: 'bearertokenauth' },
                },
                http: {
                  endpoint: '0.0.0.0:4318',
                  auth: { authenticator: 'bearertokenauth' },
                },
              },
            },
          },
          service: {
            extensions: ['bearertokenauth'],
            pipelines: {
              logs: { receivers: ['otlp'] },
            },
          },
        },
      ],
    };

    const result = generateOtelcolConfig({
      inputs: [otelInputWithExtension],
      dataOutput: defaultOutput,
    });

    // The extension key must be suffixed
    expect(result.extensions?.[`bearertokenauth/${expectedSuffix}`]).toEqual({ token: 'secret' });
    expect(result.extensions?.bearertokenauth).toBeUndefined();

    // The service.extensions reference must also be suffixed to match
    expect(result.service?.extensions).toContain(`bearertokenauth/${expectedSuffix}`);
    expect(result.service?.extensions).not.toContain('bearertokenauth');

    // auth.authenticator references inside receiver bodies must be suffixed
    const suffixedReceiver = result.receivers?.[`otlp/${expectedSuffix}`];
    expect(suffixedReceiver?.protocols?.grpc?.auth?.authenticator).toBe(
      `bearertokenauth/${expectedSuffix}`
    );
    expect(suffixedReceiver?.protocols?.http?.auth?.authenticator).toBe(
      `bearertokenauth/${expectedSuffix}`
    );

    // Pipeline component references must still be suffixed
    expect(result.service?.pipelines?.[`logs/${expectedSuffix}`]?.receivers).toContain(
      `otlp/${expectedSuffix}`
    );
  });

  it('should leave auth.authenticator untouched when it does not reference a stream-declared extension', () => {
    const inputId = 'otlp-input-2';
    const streamId = 'stream-id-1';
    const expectedSuffix = `${inputId}-${streamId}`;

    // The receiver references an externally-managed authenticator (e.g. injected by output path)
    // that was NOT declared in stream.extensions — it must not be rewritten.
    const otelInputExternalAuth: FullAgentPolicyInput = {
      type: OTEL_COLLECTOR_INPUT_TYPE,
      id: inputId,
      name: inputId,
      revision: 0,
      data_stream: { namespace: 'default' },
      use_output: 'default',
      package_policy_id: 'mypolicy2',
      streams: [
        {
          id: streamId,
          data_stream: { dataset: 'generic.otel', type: 'logs' },
          receivers: {
            otlp: {
              protocols: {
                grpc: {
                  auth: { authenticator: 'beatsauth/default' },
                },
              },
            },
          },
          service: {
            pipelines: {
              logs: { receivers: ['otlp'] },
            },
          },
        },
      ],
    };

    const result = generateOtelcolConfig({
      inputs: [otelInputExternalAuth],
      dataOutput: defaultOutput,
    });

    const suffixedReceiver = result.receivers?.[`otlp/${expectedSuffix}`];
    expect(suffixedReceiver?.protocols?.grpc?.auth?.authenticator).toBe('beatsauth/default');
  });

  it('should suffix only locally-declared extensions in service.extensions, leaving external references untouched', () => {
    const inputId = 'otlp-input-1';
    const streamId = 'stream-id-1';
    const expectedSuffix = `${inputId}-${streamId}`;

    const input: FullAgentPolicyInput = {
      type: OTEL_COLLECTOR_INPUT_TYPE,
      id: inputId,
      name: inputId,
      revision: 0,
      data_stream: { namespace: 'default' },
      use_output: 'default',
      package_policy_id: 'mypolicy',
      streams: [
        {
          id: streamId,
          data_stream: { dataset: 'generic.otel', type: 'logs' },
          extensions: {
            bearertokenauth: { token: 'secret' },
          },
          service: {
            extensions: ['bearertokenauth', 'beatsauth/default'],
            pipelines: {
              logs: { receivers: ['otlp'] },
            },
          },
        },
      ],
    };

    const result = generateOtelcolConfig({ inputs: [input], dataOutput: defaultOutput });

    expect(result.service?.extensions).toContain(`bearertokenauth/${expectedSuffix}`);
    expect(result.service?.extensions).not.toContain('bearertokenauth');
    expect(result.service?.extensions).toContain('beatsauth/default');
    expect(result.service?.extensions).not.toContain(`beatsauth/default/${expectedSuffix}`);
  });

  it('should rewrite credentials_provider field that references a stream-declared extension', () => {
    const inputId = 'aws-input-1';
    const streamId = 'stream-id-1';
    const expectedSuffix = `${inputId}-${streamId}`;

    const input: FullAgentPolicyInput = {
      type: OTEL_COLLECTOR_INPUT_TYPE,
      id: inputId,
      name: inputId,
      revision: 0,
      data_stream: { namespace: 'default' },
      use_output: 'default',
      package_policy_id: 'mypolicy',
      streams: [
        {
          id: streamId,
          data_stream: { dataset: 'aws.cloudwatch', type: 'logs' },
          extensions: {
            awscredentialsprovider: { region: 'us-east-1' },
          },
          receivers: {
            awscloudwatch: {
              region: 'us-east-1',
              credentials_provider: 'awscredentialsprovider',
            },
          },
          service: {
            extensions: ['awscredentialsprovider'],
            pipelines: {
              logs: { receivers: ['awscloudwatch'] },
            },
          },
        },
      ],
    };

    const result = generateOtelcolConfig({ inputs: [input], dataOutput: defaultOutput });

    expect(result.extensions?.[`awscredentialsprovider/${expectedSuffix}`]).toEqual({
      region: 'us-east-1',
    });
    expect(result.extensions?.awscredentialsprovider).toBeUndefined();

    const suffixedReceiver = result.receivers?.[`awscloudwatch/${expectedSuffix}`];
    expect(suffixedReceiver?.credentials_provider).toBe(`awscredentialsprovider/${expectedSuffix}`);
    expect(suffixedReceiver?.region).toBe('us-east-1');

    expect(result.service?.extensions).toContain(`awscredentialsprovider/${expectedSuffix}`);
    expect(result.service?.extensions).not.toContain('awscredentialsprovider');
  });

  it('should rewrite storage field that references a stream-declared extension (file_storage persistent queue)', () => {
    const inputId = 'otlp-input-storage';
    const streamId = 'stream-id-1';
    const expectedSuffix = `${inputId}-${streamId}`;

    const input: FullAgentPolicyInput = {
      type: OTEL_COLLECTOR_INPUT_TYPE,
      id: inputId,
      name: inputId,
      revision: 0,
      data_stream: { namespace: 'default' },
      use_output: 'default',
      package_policy_id: 'mypolicy',
      streams: [
        {
          id: streamId,
          data_stream: { dataset: 'generic.otel', type: 'logs' },
          extensions: {
            file_storage: { directory: '/var/lib/otelcol' },
          },
          exporters: {
            otlphttp: {
              endpoint: 'https://example.com',
              sending_queue: {
                storage: 'file_storage',
              },
            },
          },
          service: {
            extensions: ['file_storage'],
            pipelines: {
              logs: { receivers: ['otlp'], exporters: ['otlphttp'] },
            },
          },
        },
      ],
    };

    const result = generateOtelcolConfig({ inputs: [input], dataOutput: defaultOutput });

    expect(result.extensions?.[`file_storage/${expectedSuffix}`]).toEqual({
      directory: '/var/lib/otelcol',
    });

    const suffixedExporter = result.exporters?.[`otlphttp/${expectedSuffix}`];
    expect(suffixedExporter?.sending_queue?.storage).toBe(`file_storage/${expectedSuffix}`);

    expect(result.service?.extensions).toContain(`file_storage/${expectedSuffix}`);
  });

  it('should suffix a receiver storage reference to match a stream-declared file_storage extension (akamai SIEM pattern)', () => {
    const inputId = 'otelcol-akamai-1';
    const streamId = 'otelcol-akamai-siem_otel-1';
    const expectedSuffix = `${inputId}-${streamId}`;

    const otelInputWithStorage: FullAgentPolicyInput = {
      type: OTEL_COLLECTOR_INPUT_TYPE,
      id: inputId,
      name: inputId,
      revision: 0,
      data_stream: { namespace: 'default' },
      use_output: 'default',
      package_policy_id: 'akamai-policy',
      streams: [
        {
          id: streamId,
          data_stream: { dataset: 'akamai.siem', type: 'logs' },
          extensions: {
            file_storage: { directory: '/usr/share/elastic-agent/state' },
          },
          receivers: {
            akamai_siem: {
              storage: 'file_storage',
              config_id: 'abc',
            },
          },
          service: {
            extensions: ['file_storage'],
            pipelines: {
              logs: { receivers: ['akamai_siem'] },
            },
          },
        },
      ],
    };

    const result = generateOtelcolConfig({
      inputs: [otelInputWithStorage],
      dataOutput: defaultOutput,
    });

    expect(result.extensions?.[`file_storage/${expectedSuffix}`]).toEqual({
      directory: '/usr/share/elastic-agent/state',
    });
    expect(result.extensions?.file_storage).toBeUndefined();

    expect(result.service?.extensions).toContain(`file_storage/${expectedSuffix}`);
    expect(result.service?.extensions).not.toContain('file_storage');

    const suffixedReceiver = result.receivers?.[`akamai_siem/${expectedSuffix}`];
    expect(suffixedReceiver?.storage).toBe(`file_storage/${expectedSuffix}`);
    expect(suffixedReceiver?.config_id).toBe('abc');
  });

  it('should leave a receiver storage reference untouched when it points at a globally-injected extension', () => {
    const inputId = 'otelcol-akamai-2';
    const streamId = 'otelcol-akamai-siem_otel-1';
    const expectedSuffix = `${inputId}-${streamId}`;

    // elasticsearch_storage is injected externally by elastic-agent with a stable,
    // un-suffixed ID; it is never declared in the stream's component map.
    const otelInputExternalStorage: FullAgentPolicyInput = {
      type: OTEL_COLLECTOR_INPUT_TYPE,
      id: inputId,
      name: inputId,
      revision: 0,
      data_stream: { namespace: 'default' },
      use_output: 'default',
      package_policy_id: 'akamai-policy-2',
      streams: [
        {
          id: streamId,
          data_stream: { dataset: 'akamai.siem', type: 'logs' },
          receivers: {
            akamai_siem: {
              storage: 'elasticsearch_storage',
            },
          },
          service: {
            pipelines: {
              logs: { receivers: ['akamai_siem'] },
            },
          },
        },
      ],
    };

    const result = generateOtelcolConfig({
      inputs: [otelInputExternalStorage],
      dataOutput: defaultOutput,
    });

    const suffixedReceiver = result.receivers?.[`akamai_siem/${expectedSuffix}`];
    expect(suffixedReceiver?.storage).toBe('elasticsearch_storage');
  });

  it('should leave a receiver storage reference untouched when the extension is not declared at all', () => {
    const inputId = 'otelcol-akamai-3';
    const streamId = 'otelcol-akamai-siem_otel-1';
    const expectedSuffix = `${inputId}-${streamId}`;

    const otelInputUnknownStorage: FullAgentPolicyInput = {
      type: OTEL_COLLECTOR_INPUT_TYPE,
      id: inputId,
      name: inputId,
      revision: 0,
      data_stream: { namespace: 'default' },
      use_output: 'default',
      package_policy_id: 'akamai-policy-3',
      streams: [
        {
          id: streamId,
          data_stream: { dataset: 'akamai.siem', type: 'logs' },
          receivers: {
            akamai_siem: {
              storage: 'nonexistent_extension',
            },
          },
          service: {
            pipelines: {
              logs: { receivers: ['akamai_siem'] },
            },
          },
        },
      ],
    };

    const result = generateOtelcolConfig({
      inputs: [otelInputUnknownStorage],
      dataOutput: defaultOutput,
    });

    // Validating extension existence is the collector's job at startup, not the renderer's.
    const suffixedReceiver = result.receivers?.[`akamai_siem/${expectedSuffix}`];
    expect(suffixedReceiver?.storage).toBe('nonexistent_extension');
  });

  it('should suffix both storage and auth.authenticator references independently in the same receiver', () => {
    const inputId = 'otelcol-akamai-4';
    const streamId = 'otelcol-akamai-siem_otel-1';
    const expectedSuffix = `${inputId}-${streamId}`;

    const otelInputBoth: FullAgentPolicyInput = {
      type: OTEL_COLLECTOR_INPUT_TYPE,
      id: inputId,
      name: inputId,
      revision: 0,
      data_stream: { namespace: 'default' },
      use_output: 'default',
      package_policy_id: 'akamai-policy-4',
      streams: [
        {
          id: streamId,
          data_stream: { dataset: 'akamai.siem', type: 'logs' },
          extensions: {
            file_storage: { directory: '/usr/share/elastic-agent/state' },
            bearertokenauth: { token: 'secret' },
          },
          receivers: {
            akamai_siem: {
              storage: 'file_storage',
              auth: { authenticator: 'bearertokenauth' },
            },
          },
          service: {
            extensions: ['file_storage', 'bearertokenauth'],
            pipelines: {
              logs: { receivers: ['akamai_siem'] },
            },
          },
        },
      ],
    };

    const result = generateOtelcolConfig({
      inputs: [otelInputBoth],
      dataOutput: defaultOutput,
    });

    const suffixedReceiver = result.receivers?.[`akamai_siem/${expectedSuffix}`];
    expect(suffixedReceiver?.storage).toBe(`file_storage/${expectedSuffix}`);
    expect(suffixedReceiver?.auth?.authenticator).toBe(`bearertokenauth/${expectedSuffix}`);

    expect(result.extensions?.[`file_storage/${expectedSuffix}`]).toEqual({
      directory: '/usr/share/elastic-agent/state',
    });
    expect(result.extensions?.[`bearertokenauth/${expectedSuffix}`]).toEqual({ token: 'secret' });
  });

  it('should rewrite extension references that appear in an array value', () => {
    const inputId = 'multi-ext-input';
    const streamId = 'stream-id-1';
    const expectedSuffix = `${inputId}-${streamId}`;

    const input: FullAgentPolicyInput = {
      type: OTEL_COLLECTOR_INPUT_TYPE,
      id: inputId,
      name: inputId,
      revision: 0,
      data_stream: { namespace: 'default' },
      use_output: 'default',
      package_policy_id: 'mypolicy',
      streams: [
        {
          id: streamId,
          data_stream: { dataset: 'generic.otel', type: 'logs' },
          extensions: {
            ext_a: { key: 'a' },
            ext_b: { key: 'b' },
          },
          receivers: {
            somereceiver: {
              // hypothetical field that takes a list of extension IDs
              providers: ['ext_a', 'ext_b', 'external_ext'],
            },
          },
          service: {
            extensions: ['ext_a', 'ext_b'],
            pipelines: {
              logs: { receivers: ['somereceiver'] },
            },
          },
        },
      ],
    };

    const result = generateOtelcolConfig({ inputs: [input], dataOutput: defaultOutput });

    const suffixedReceiver = result.receivers?.[`somereceiver/${expectedSuffix}`];
    expect(suffixedReceiver?.providers).toEqual([
      `ext_a/${expectedSuffix}`,
      `ext_b/${expectedSuffix}`,
      'external_ext', // not a declared extension — must not be rewritten
    ]);
  });

  it('should rewrite extension-to-extension references within the extensions block', () => {
    const inputId = 'ext-chain-input';
    const streamId = 'stream-id-1';
    const expectedSuffix = `${inputId}-${streamId}`;

    // ext_b references ext_a in its config body (e.g. a credential chaining pattern)
    const input: FullAgentPolicyInput = {
      type: OTEL_COLLECTOR_INPUT_TYPE,
      id: inputId,
      name: inputId,
      revision: 0,
      data_stream: { namespace: 'default' },
      use_output: 'default',
      package_policy_id: 'mypolicy',
      streams: [
        {
          id: streamId,
          data_stream: { dataset: 'generic.otel', type: 'logs' },
          extensions: {
            ext_base: { token: 'abc' },
            ext_derived: { delegate: 'ext_base', extra: 'value' },
          },
          service: {
            extensions: ['ext_base', 'ext_derived'],
            pipelines: {
              logs: { receivers: ['otlp'] },
            },
          },
        },
      ],
    };

    const result = generateOtelcolConfig({ inputs: [input], dataOutput: defaultOutput });

    expect(result.extensions?.[`ext_base/${expectedSuffix}`]).toEqual({ token: 'abc' });
    // The delegate reference inside ext_derived's body must be suffixed
    expect(result.extensions?.[`ext_derived/${expectedSuffix}`]).toEqual({
      delegate: `ext_base/${expectedSuffix}`,
      extra: 'value',
    });
  });

  it('should not rewrite substring occurrences — only exact whole-string matches are rewritten', () => {
    const inputId = 'no-collision-input';
    const streamId = 'stream-id-1';
    const expectedSuffix = `${inputId}-${streamId}`;

    const input: FullAgentPolicyInput = {
      type: OTEL_COLLECTOR_INPUT_TYPE,
      id: inputId,
      name: inputId,
      revision: 0,
      data_stream: { namespace: 'default' },
      use_output: 'default',
      package_policy_id: 'mypolicy',
      streams: [
        {
          id: streamId,
          data_stream: { dataset: 'generic.otel', type: 'logs' },
          extensions: {
            myext: { token: 'secret' },
          },
          receivers: {
            otlp: {
              // substring — must not be rewritten
              endpoint: 'http://myext.internal:4317',
              // exact match — must be rewritten
              auth: { authenticator: 'myext' },
            },
          },
          service: {
            extensions: ['myext'],
            pipelines: {
              logs: { receivers: ['otlp'] },
            },
          },
        },
      ],
    };

    const result = generateOtelcolConfig({ inputs: [input], dataOutput: defaultOutput });

    const suffixedReceiver = result.receivers?.[`otlp/${expectedSuffix}`];
    expect(suffixedReceiver?.auth?.authenticator).toBe(`myext/${expectedSuffix}`);
    // substring inside a URL must not be touched
    expect(suffixedReceiver?.endpoint).toBe('http://myext.internal:4317');
  });

  it('should add elasticapm connector and processor for traces input with use_apm enabled', () => {
    const inputs: FullAgentPolicyInput[] = [otelTracesInputWithAPM];
    expect(generateOtelcolConfig({ inputs, dataOutput: defaultOutput })).toEqual({
      receivers: {
        'zipkin/test-traces-stream-id-1': {
          endpoint: 'localhost:9411',
        },
      },
      processors: {
        'transform/test-traces-stream-id-1-routing': {
          trace_statements: [
            {
              context: 'span',
              statements: [
                'set(attributes["data_stream.type"], "traces")',
                'set(attributes["data_stream.dataset"], "zipkinreceiver")',
                'set(attributes["data_stream.namespace"], "apmtest")',
              ],
            },
            {
              context: 'spanevent',
              statements: [
                'set(attributes["data_stream.type"], "logs")',
                'set(attributes["data_stream.dataset"], "zipkinreceiver")',
                'set(attributes["data_stream.namespace"], "apmtest")',
              ],
            },
          ],
        },
        'transform/apmtest-apm-namespace-routing': {
          metric_statements: [
            {
              context: 'datapoint',
              statements: ['set(attributes["data_stream.namespace"], "apmtest")'],
            },
          ],
        },
        'elasticapm/apmtest': {},
      },
      connectors: {
        'elasticapm/apmtest': {},
        'forward/default': {},
      },
      exporters: {
        'elasticsearch/default': {
          endpoints: ['http://localhost:9200'],
        },
      },
      service: {
        pipelines: {
          'traces/test-traces-stream-id-1': {
            receivers: ['zipkin/test-traces-stream-id-1'],
            exporters: ['elasticapm/apmtest', 'forward/default'],
            processors: ['elasticapm/apmtest', 'transform/test-traces-stream-id-1-routing'],
          },
          'metrics/apmtest-aggregated-apm-metrics': {
            receivers: ['elasticapm/apmtest'],
            processors: ['transform/apmtest-apm-namespace-routing'],
            exporters: ['forward/default'],
          },
          'traces/default': {
            receivers: ['forward/default'],
            exporters: ['elasticsearch/default'],
          },
          'metrics/default': {
            receivers: ['forward/default'],
            exporters: ['elasticsearch/default'],
          },
        },
      },
    });
  });

  it('should include dataset in span routing transform for traces input without use_apm', () => {
    const otelTracesInputNoAPM: FullAgentPolicyInput = {
      ...otelTracesInputWithAPM,
      streams: otelTracesInputWithAPM.streams?.map((stream) => {
        const { use_apm: _useApm, ...rest } = stream as any;
        return rest;
      }),
    };
    const inputs: FullAgentPolicyInput[] = [otelTracesInputNoAPM];
    const result = generateOtelcolConfig({ inputs, dataOutput: defaultOutput });

    expect(
      result.processors?.['transform/test-traces-stream-id-1-routing']?.trace_statements
    ).toEqual([
      {
        context: 'span',
        statements: [
          'set(attributes["data_stream.type"], "traces")',
          'set(attributes["data_stream.dataset"], "zipkinreceiver")',
          'set(attributes["data_stream.namespace"], "apmtest")',
        ],
      },
      {
        context: 'spanevent',
        statements: [
          'set(attributes["data_stream.type"], "logs")',
          'set(attributes["data_stream.dataset"], "zipkinreceiver")',
          'set(attributes["data_stream.namespace"], "apmtest")',
        ],
      },
    ]);
  });

  it('should produce separate aggregated-apm-metrics pipelines for two APM package policies with different namespaces', () => {
    const inputA: FullAgentPolicyInput = {
      ...otelTracesInputWithAPM,
      id: 'policy-a',
      name: 'policy-a',
      package_policy_id: 'policy-a',
      data_stream: { namespace: 'ns-a' },
      streams: [
        {
          id: 'stream-id-1',
          data_stream: { dataset: 'apm', type: 'traces' },
          use_apm: true,
          receivers: { otlp: { protocols: { grpc: { endpoint: '0.0.0.0:4317' } } } },
          service: { pipelines: { traces: { receivers: ['otlp'] } } },
        },
      ],
    };
    const inputB: FullAgentPolicyInput = {
      ...otelTracesInputWithAPM,
      id: 'policy-b',
      name: 'policy-b',
      package_policy_id: 'policy-b',
      data_stream: { namespace: 'ns-b' },
      streams: [
        {
          id: 'stream-id-1',
          data_stream: { dataset: 'apm', type: 'traces' },
          use_apm: true,
          receivers: { otlp: { protocols: { grpc: { endpoint: '0.0.0.0:4318' } } } },
          service: { pipelines: { traces: { receivers: ['otlp'] } } },
        },
      ],
    };

    const result = generateOtelcolConfig({ inputs: [inputA, inputB], dataOutput: defaultOutput });

    expect(result.connectors?.['elasticapm/ns-a']).toEqual({});
    expect(result.connectors?.['elasticapm/ns-b']).toEqual({});
    expect(result.connectors?.['elasticapm/policy-a-stream-id-1']).toBeUndefined();
    expect(result.connectors?.['elasticapm/policy-b-stream-id-1']).toBeUndefined();

    expect(result.service?.pipelines?.['metrics/ns-a-aggregated-apm-metrics']).toEqual({
      receivers: ['elasticapm/ns-a'],
      processors: ['transform/ns-a-apm-namespace-routing'],
      exporters: ['forward/default'],
    });
    expect(result.service?.pipelines?.['metrics/ns-b-aggregated-apm-metrics']).toEqual({
      receivers: ['elasticapm/ns-b'],
      processors: ['transform/ns-b-apm-namespace-routing'],
      exporters: ['forward/default'],
    });
    expect(
      result.service?.pipelines?.['metrics/policy-a-stream-id-1-aggregated-apm-metrics']
    ).toBeUndefined();
    expect(
      result.service?.pipelines?.['metrics/policy-b-stream-id-1-aggregated-apm-metrics']
    ).toBeUndefined();

    expect(result.processors?.['transform/ns-a-apm-namespace-routing']).toEqual({
      metric_statements: [
        { context: 'datapoint', statements: ['set(attributes["data_stream.namespace"], "ns-a")'] },
      ],
    });
    expect(result.processors?.['transform/ns-b-apm-namespace-routing']).toEqual({
      metric_statements: [
        { context: 'datapoint', statements: ['set(attributes["data_stream.namespace"], "ns-b")'] },
      ],
    });

    expect(result.service?.pipelines?.['traces/policy-a-stream-id-1']?.exporters).toContain(
      'elasticapm/ns-a'
    );
    expect(result.service?.pipelines?.['traces/policy-b-stream-id-1']?.exporters).toContain(
      'elasticapm/ns-b'
    );
  });

  it('should produce a single aggregated-apm-metrics pipeline for two APM package policies with the same namespace', () => {
    const inputA: FullAgentPolicyInput = {
      ...otelTracesInputWithAPM,
      id: 'policy-a',
      name: 'policy-a',
      package_policy_id: 'policy-a',
      data_stream: { namespace: 'ns-shared' },
      streams: [
        {
          id: 'stream-id-1',
          data_stream: { dataset: 'apm', type: 'traces' },
          use_apm: true,
          receivers: { otlp: { protocols: { grpc: { endpoint: '0.0.0.0:4317' } } } },
          service: { pipelines: { traces: { receivers: ['otlp'] } } },
        },
      ],
    };
    const inputB: FullAgentPolicyInput = {
      ...otelTracesInputWithAPM,
      id: 'policy-b',
      name: 'policy-b',
      package_policy_id: 'policy-b',
      data_stream: { namespace: 'ns-shared' },
      streams: [
        {
          id: 'stream-id-1',
          data_stream: { dataset: 'apm', type: 'traces' },
          use_apm: true,
          receivers: { otlp: { protocols: { grpc: { endpoint: '0.0.0.0:4318' } } } },
          service: { pipelines: { traces: { receivers: ['otlp'] } } },
        },
      ],
    };

    const result = generateOtelcolConfig({ inputs: [inputA, inputB], dataOutput: defaultOutput });

    expect(result.connectors?.['elasticapm/ns-shared']).toEqual({});
    expect(result.connectors?.['elasticapm/policy-a-stream-id-1']).toBeUndefined();
    expect(result.connectors?.['elasticapm/policy-b-stream-id-1']).toBeUndefined();

    const aggregatedPipelineKeys = Object.keys(result.service?.pipelines ?? {}).filter((k) =>
      k.includes('aggregated-apm-metrics')
    );
    expect(aggregatedPipelineKeys).toHaveLength(1);
    expect(result.service?.pipelines?.['metrics/ns-shared-aggregated-apm-metrics']).toEqual({
      receivers: ['elasticapm/ns-shared'],
      processors: ['transform/ns-shared-apm-namespace-routing'],
      exporters: ['forward/default'],
    });

    expect(result.service?.pipelines?.['traces/policy-a-stream-id-1']?.exporters).toContain(
      'elasticapm/ns-shared'
    );
    expect(result.service?.pipelines?.['traces/policy-b-stream-id-1']?.exporters).toContain(
      'elasticapm/ns-shared'
    );
  });

  describe('with dynamic_signal_types (multiple signal types)', () => {
    const otelInputWithMultipleSignalTypes: FullAgentPolicyInput = {
      type: OTEL_COLLECTOR_INPUT_TYPE,
      id: 'test-multi-signal',
      name: 'test-multi-signal',
      revision: 0,
      data_stream: {
        namespace: 'default',
      },
      use_output: 'default',
      package_policy_id: 'multipolicy',
      meta: {
        package: {
          name: 'otel-multi-signal',
          version: '1.0.0',
        },
      },
      streams: [
        {
          id: 'stream-id-1',
          data_stream: {
            dataset: 'multidataset',
            type: 'logs',
          },
          receivers: {
            otlp: {
              protocols: {
                grpc: {
                  endpoint: '0.0.0.0:4317',
                },
              },
            },
          },
          service: {
            pipelines: {
              'logs/otlp': {
                receivers: ['otlp'],
              },
              'metrics/otlp': {
                receivers: ['otlp'],
              },
              'traces/otlp': {
                receivers: ['otlp'],
              },
              'profiles/otlp': {
                receivers: ['otlp'],
              },
            },
          },
        },
      ],
    };

    const otelInputWithMultipleSignalTypes2: FullAgentPolicyInput = {
      type: OTEL_COLLECTOR_INPUT_TYPE,
      id: 'test-multi-signal',
      name: 'test-multi-signal',
      revision: 0,
      data_stream: {
        namespace: 'default',
      },
      use_output: 'default',
      package_policy_id: 'multipolicy',
      meta: {
        package: {
          name: 'otel-multi-signal',
          version: '1.0.0',
        },
      },
      streams: [
        {
          id: 'stream-id-1',
          data_stream: {
            dataset: 'multidataset',
            type: 'logs',
          },
          receivers: {
            otlp: {
              protocols: {
                grpc: {
                  endpoint: '0.0.0.0:4317',
                },
              },
            },
          },
          service: {
            pipelines: {
              logs: {
                receivers: ['otlp'],
              },
              metrics: {
                receivers: ['otlp'],
              },
              traces: {
                receivers: ['otlp'],
              },
              profiles: {
                receivers: ['otlp'],
              },
            },
          },
        },
      ],
    };

    const packageInfoCache = new Map([
      [
        'otel-multi-signal-1.0.0',
        {
          name: 'otel-multi-signal',
          version: '1.0.0',
          policy_templates: [
            {
              name: 'template1',
              title: 'OTel Multi Signal',
              input: 'otelcol',
              type: 'logs',
              template_path: 'input.yml.hbs',
              dynamic_signal_types: true,
              vars: [],
            },
          ],
        } as any,
      ],
    ]);

    it('should add elasticapm connector and processor when stream has traces pipeline and use_apm enabled even if data_stream.type is not traces', () => {
      const inputWithUseApm: FullAgentPolicyInput = {
        ...otelInputWithMultipleSignalTypes,
        streams:
          otelInputWithMultipleSignalTypes.streams?.map((stream) => ({
            ...stream,
            use_apm: true,
          })) ?? [],
      };
      const inputs: FullAgentPolicyInput[] = [inputWithUseApm];
      const result = generateOtelcolConfig({ inputs, dataOutput: defaultOutput, packageInfoCache });

      expect(result.connectors?.['elasticapm/default']).toEqual({});
      expect(result.processors?.['elasticapm/default']).toEqual({});
      expect(result.service?.pipelines?.['metrics/default-aggregated-apm-metrics']).toEqual({
        receivers: ['elasticapm/default'],
        processors: ['transform/default-apm-namespace-routing'],
        exporters: ['forward/default'],
      });
      const tracesPipelineKey = 'traces/otlp/test-multi-signal-stream-id-1';
      const tracesPipeline = result.service?.pipelines?.[tracesPipelineKey];
      expect(tracesPipeline).toBeDefined();
      expect(tracesPipeline?.exporters).toContain('elasticapm/default');
      expect(tracesPipeline?.processors).toContain('elasticapm/default');
      const metricsPipelineKey = 'metrics/otlp/test-multi-signal-stream-id-1';
      const metricsPipeline = result.service?.pipelines?.[metricsPipelineKey];
      expect(metricsPipeline).toBeDefined();
      expect(metricsPipeline?.exporters).not.toContain('elasticapm/default');
      expect(metricsPipeline?.processors).not.toContain('elasticapm/default');
    });

    it('should generate transform with multiple signal type statements (excluding profiles) when dynamic_signal_types is true', () => {
      const inputs: FullAgentPolicyInput[] = [otelInputWithMultipleSignalTypes];
      const result = generateOtelcolConfig({ inputs, dataOutput: defaultOutput, packageInfoCache });

      expect(result.processors?.['transform/test-multi-signal-stream-id-1-routing']).toEqual({
        log_statements: [
          {
            context: 'log',
            statements: [
              'set(attributes["data_stream.type"], "logs")',
              'set(attributes["data_stream.dataset"], "multidataset")',
              'set(attributes["data_stream.namespace"], "default")',
            ],
          },
        ],
        metric_statements: [
          {
            context: 'datapoint',
            statements: [
              'set(attributes["data_stream.type"], "metrics")',
              'set(attributes["data_stream.dataset"], "multidataset")',
              'set(attributes["data_stream.namespace"], "default")',
            ],
          },
        ],
        trace_statements: [
          {
            context: 'span',
            statements: [
              'set(attributes["data_stream.type"], "traces")',
              'set(attributes["data_stream.dataset"], "multidataset")',
              'set(attributes["data_stream.namespace"], "default")',
            ],
          },
          {
            context: 'spanevent',
            statements: [
              'set(attributes["data_stream.type"], "logs")',
              'set(attributes["data_stream.dataset"], "multidataset")',
              'set(attributes["data_stream.namespace"], "default")',
            ],
          },
        ],
      });
    });

    it('should generate transform with multiple signal type statements (excluding profiles) when dynamic_signal_types is true and pipelines have simple names', () => {
      const inputs: FullAgentPolicyInput[] = [otelInputWithMultipleSignalTypes2];
      const result = generateOtelcolConfig({ inputs, dataOutput: defaultOutput, packageInfoCache });

      expect(result.processors?.['transform/test-multi-signal-stream-id-1-routing']).toEqual({
        log_statements: [
          {
            context: 'log',
            statements: [
              'set(attributes["data_stream.type"], "logs")',
              'set(attributes["data_stream.dataset"], "multidataset")',
              'set(attributes["data_stream.namespace"], "default")',
            ],
          },
        ],
        metric_statements: [
          {
            context: 'datapoint',
            statements: [
              'set(attributes["data_stream.type"], "metrics")',
              'set(attributes["data_stream.dataset"], "multidataset")',
              'set(attributes["data_stream.namespace"], "default")',
            ],
          },
        ],
        trace_statements: [
          {
            context: 'span',
            statements: [
              'set(attributes["data_stream.type"], "traces")',
              'set(attributes["data_stream.dataset"], "multidataset")',
              'set(attributes["data_stream.namespace"], "default")',
            ],
          },
          {
            context: 'spanevent',
            statements: [
              'set(attributes["data_stream.type"], "logs")',
              'set(attributes["data_stream.dataset"], "multidataset")',
              'set(attributes["data_stream.namespace"], "default")',
            ],
          },
        ],
      });
    });

    it('should not route or generate profile_statements for the profiles signal in a dynamic package', () => {
      const inputs: FullAgentPolicyInput[] = [otelInputWithMultipleSignalTypes];
      const result = generateOtelcolConfig({ inputs, dataOutput: defaultOutput, packageInfoCache });

      // profiles is owned end-to-end by Universal Profiling (routing and storage handled by its
      // Elasticsearch exporter), so Fleet must not stamp data_stream.* for it.
      expect(
        result.processors?.['transform/test-multi-signal-stream-id-1-routing']?.profile_statements
      ).toBeUndefined();
    });

    it('should not generate a routing transform at all for a profiles-only stream', () => {
      const profilesOnlyInput: FullAgentPolicyInput = {
        ...otelInputWithMultipleSignalTypes,
        streams: [
          {
            id: 'stream-id-1',
            data_stream: {
              dataset: 'profilingreceiver',
              type: 'profiles',
            },
            receivers: {
              profiling: {},
            },
            service: {
              pipelines: {
                profiles: {
                  receivers: ['profiling'],
                },
              },
            },
          },
        ],
      };

      const result = generateOtelcolConfig({
        inputs: [profilesOnlyInput],
        dataOutput: defaultOutput,
        packageInfoCache,
      });

      // No routing transform should be injected, and the profiles pipeline must not
      // reference one (regression test for elastic/package-spec#1191).
      const routingKeys = Object.keys(result.processors ?? {}).filter((key) =>
        key.endsWith('-routing')
      );
      expect(routingKeys).toEqual([]);

      const pipeline = result.service?.pipelines?.['profiles/test-multi-signal-stream-id-1'];
      expect(pipeline).toBeDefined();
      expect(pipeline?.processors ?? []).not.toContain(
        'transform/test-multi-signal-stream-id-1-routing'
      );
    });

    it('should generate transform with only specified signal types when pipelines have subset', () => {
      const baseStream = otelInputWithMultipleSignalTypes.streams?.[0];
      if (!baseStream) {
        throw new Error('Test data is invalid');
      }

      const otelInputWithSubsetSignalTypes: FullAgentPolicyInput = {
        ...otelInputWithMultipleSignalTypes,
        streams: [
          {
            ...baseStream,
            service: {
              pipelines: {
                'logs/otlp': {
                  receivers: ['otlp'],
                },
                'metrics/otlp': {
                  receivers: ['otlp'],
                },
              },
            },
          },
        ],
      };

      const inputs: FullAgentPolicyInput[] = [otelInputWithSubsetSignalTypes];
      const result = generateOtelcolConfig({ inputs, dataOutput: defaultOutput, packageInfoCache });

      expect(result.processors?.['transform/test-multi-signal-stream-id-1-routing']).toEqual({
        log_statements: [
          {
            context: 'log',
            statements: [
              'set(attributes["data_stream.type"], "logs")',
              'set(attributes["data_stream.dataset"], "multidataset")',
              'set(attributes["data_stream.namespace"], "default")',
            ],
          },
        ],
        metric_statements: [
          {
            context: 'datapoint',
            statements: [
              'set(attributes["data_stream.type"], "metrics")',
              'set(attributes["data_stream.dataset"], "multidataset")',
              'set(attributes["data_stream.namespace"], "default")',
            ],
          },
        ],
      });
      // Should not have trace_statements
      expect(
        result.processors?.['transform/test-multi-signal-stream-id-1-routing']?.trace_statements
      ).toBeUndefined();
    });

    it('should fall back to single signal type when dynamic_signal_types is false', () => {
      const packageInfoCacheNoDynamic = new Map([
        [
          'otel-multi-signal-1.0.0',
          {
            name: 'otel-multi-signal',
            version: '1.0.0',
            policy_templates: [
              {
                name: 'template1',
                title: 'OTel Multi Signal',
                input: 'otelcol',
                type: 'logs',
                template_path: 'input.yml.hbs',
                dynamic_signal_types: false,
                vars: [],
              },
            ],
          } as any,
        ],
      ]);

      const inputs: FullAgentPolicyInput[] = [otelInputWithMultipleSignalTypes];
      const result = generateOtelcolConfig({
        inputs,
        dataOutput: defaultOutput,
        packageInfoCache: packageInfoCacheNoDynamic,
      });

      // Should generate single signal type transform (uses stream.data_stream.type)
      expect(result.processors?.['transform/test-multi-signal-stream-id-1-routing']).toEqual({
        log_statements: [
          {
            context: 'log',
            statements: [
              'set(attributes["data_stream.type"], "logs")',
              'set(attributes["data_stream.dataset"], "multidataset")',
              'set(attributes["data_stream.namespace"], "default")',
            ],
          },
        ],
      });
    });

    it('should use stream data_stream.type when dynamic_signal_types is not defined', () => {
      const otelInputWithMetricsType: FullAgentPolicyInput = {
        ...otelInputWithMultipleSignalTypes,
        streams: [
          {
            id: 'stream-id-1',
            data_stream: {
              dataset: 'multidataset',
              type: 'metrics',
            },
            receivers: {
              otlp: {
                protocols: {
                  grpc: {
                    endpoint: '0.0.0.0:4317',
                  },
                },
              },
            },
          },
        ],
      };

      const packageInfoCacheNoDynamicVar = new Map([
        [
          'otel-multi-signal-1.0.0',
          {
            name: 'otel-multi-signal',
            version: '1.0.0',
            policy_templates: [
              {
                name: 'template1',
                title: 'OTel Multi Signal',
                input: 'otelcol',
                type: 'logs',
                // No dynamic_signal_types property
                template_path: 'input.yml.hbs',
                vars: [],
              },
            ],
          } as any,
        ],
      ]);

      const inputs: FullAgentPolicyInput[] = [otelInputWithMetricsType];
      const result = generateOtelcolConfig({
        inputs,
        dataOutput: defaultOutput,
        packageInfoCache: packageInfoCacheNoDynamicVar,
      });

      // Should use the stream's data_stream.type (metrics)
      expect(result.processors?.['transform/test-multi-signal-stream-id-1-routing']).toEqual({
        metric_statements: [
          {
            context: 'datapoint',
            statements: [
              'set(attributes["data_stream.type"], "metrics")',
              'set(attributes["data_stream.dataset"], "multidataset")',
              'set(attributes["data_stream.namespace"], "default")',
            ],
          },
        ],
      });
    });
  });

  describe('integration-type packages with otelcol input', () => {
    const otelIntegrationInput: FullAgentPolicyInput = {
      type: OTEL_COLLECTOR_INPUT_TYPE,
      id: 'integration-otel',
      name: 'integration-otel',
      revision: 0,
      data_stream: { namespace: 'default' },
      use_output: 'default',
      package_policy_id: 'integration-policy',
      meta: {
        package: { name: 'my_integration', version: '1.0.0' },
      },
      streams: [
        {
          id: 'stream-id-1',
          data_stream: { dataset: 'my_integration.metrics', type: 'metrics' },
          service: {
            pipelines: {
              'metrics/otlp': {
                receivers: ['otlp/integration-otel-stream-id-1'],
                processors: [],
              },
            },
          },
          receivers: { otlp: {} },
        },
      ],
    };

    it('generates OTel config for integration package with otelcol input', () => {
      const result = generateOtelcolConfig({
        inputs: [otelIntegrationInput],
        dataOutput: defaultOutput,
      });

      expect(result.receivers).toHaveProperty('otlp/integration-otel-stream-id-1');
      expect(result.exporters).toHaveProperty('elasticsearch/default');
      expect(result.service?.pipelines).toHaveProperty('metrics/default');
    });

    it('uses defaultPackageInfo for dynamic signal types when packageInfoCache has no meta match', () => {
      // TemplateAgentPolicyInput has no meta.package — simulate via defaultPackageInfo
      const templateInput: TemplateAgentPolicyInput = {
        id: 'integration-otel',
        type: OTEL_COLLECTOR_INPUT_TYPE,
        streams: [
          {
            id: 'stream-id-1',
            data_stream: { dataset: 'my_integration.data', type: 'metrics' },
            service: {
              pipelines: {
                'metrics/otlp': {
                  receivers: ['otlp/integration-otel-stream-id-1'],
                  processors: [],
                },
                'logs/otlp': { receivers: ['otlp/integration-otel-stream-id-1'], processors: [] },
              },
            },
            receivers: { otlp: {} },
          },
        ],
      };

      const integrationPackageInfo = {
        type: 'integration',
        name: 'my_integration',
        version: '1.0.0',
        policy_templates: [
          {
            name: 'my_policy',
            title: 'My Policy',
            description: 'My Policy',
            inputs: [
              {
                type: OTEL_COLLECTOR_INPUT_TYPE,
                title: 'OTel',
                description: 'OTel',
                dynamic_signal_types: true,
              },
            ],
          },
        ],
      } as any;

      const result = generateOtelcolConfig({
        inputs: [templateInput],
        defaultPackageInfo: integrationPackageInfo,
      });

      // With dynamic_signal_types, routing transforms are generated per signal type
      const routingKey = Object.keys(result.processors ?? {}).find((k) =>
        k.startsWith('transform/')
      );
      expect(routingKey).toBeDefined();
      const routingProcessor = result.processors?.[routingKey!];
      // Should have both metric_statements and log_statements for dynamic signal types
      expect(routingProcessor).toHaveProperty('metric_statements');
      expect(routingProcessor).toHaveProperty('log_statements');
    });

    it('falls back to single signal type routing when integration package has no dynamic_signal_types', () => {
      const templateInput: TemplateAgentPolicyInput = {
        id: 'integration-otel',
        type: OTEL_COLLECTOR_INPUT_TYPE,
        streams: [
          {
            id: 'stream-id-1',
            data_stream: { dataset: 'my_integration.metrics', type: 'metrics' },
            service: {
              pipelines: {
                'metrics/otlp': {
                  receivers: ['otlp/integration-otel-stream-id-1'],
                  processors: [],
                },
              },
            },
            receivers: { otlp: {} },
          },
        ],
      };

      const integrationPackageInfo = {
        type: 'integration',
        name: 'my_integration',
        version: '1.0.0',
        policy_templates: [
          {
            name: 'my_policy',
            title: 'My Policy',
            description: 'My Policy',
            inputs: [{ type: OTEL_COLLECTOR_INPUT_TYPE, title: 'OTel', description: 'OTel' }],
          },
        ],
      } as any;

      const result = generateOtelcolConfig({
        inputs: [templateInput],
        defaultPackageInfo: integrationPackageInfo,
      });

      const routingKey = Object.keys(result.processors ?? {}).find((k) =>
        k.startsWith('transform/')
      );
      expect(routingKey).toBeDefined();
      const routingProcessor = result.processors?.[routingKey!];
      // Without dynamic_signal_types, only metric_statements (from data_stream.type: metrics)
      expect(routingProcessor).toHaveProperty('metric_statements');
      expect(routingProcessor).not.toHaveProperty('log_statements');
    });

    it('defaultPackageInfo is overridden by packageInfoCache when meta.package is present', () => {
      // When both are provided, cache takes precedence for inputs that have meta.package
      const packageInfoCacheWithDynamic = new Map([
        [
          'my_integration-1.0.0',
          {
            type: 'integration',
            name: 'my_integration',
            version: '1.0.0',
            policy_templates: [
              {
                name: 'my_policy',
                title: 'My Policy',
                description: 'My Policy',
                inputs: [
                  {
                    type: OTEL_COLLECTOR_INPUT_TYPE,
                    title: 'OTel',
                    description: 'OTel',
                    dynamic_signal_types: true,
                  },
                ],
              },
            ],
          } as any,
        ],
      ]);

      // defaultPackageInfo says no dynamic_signal_types
      const defaultPkgInfoNoDynamic = {
        type: 'integration',
        name: 'my_integration',
        version: '1.0.0',
        policy_templates: [
          {
            name: 'my_policy',
            title: 'My Policy',
            description: 'My Policy',
            inputs: [{ type: OTEL_COLLECTOR_INPUT_TYPE, title: 'OTel', description: 'OTel' }],
          },
        ],
      } as any;

      const inputWithMeta: FullAgentPolicyInput = {
        ...otelIntegrationInput,
        streams: [
          {
            id: 'stream-id-1',
            data_stream: { dataset: 'my_integration.data', type: 'metrics' },
            service: {
              pipelines: {
                'metrics/otlp': {
                  receivers: ['otlp/integration-otel-stream-id-1'],
                  processors: [],
                },
                'logs/otlp': { receivers: ['otlp/integration-otel-stream-id-1'], processors: [] },
              },
            },
            receivers: { otlp: {} },
          },
        ],
      };

      const result = generateOtelcolConfig({
        inputs: [inputWithMeta],
        packageInfoCache: packageInfoCacheWithDynamic,
        defaultPackageInfo: defaultPkgInfoNoDynamic,
      });

      const routingKey = Object.keys(result.processors ?? {}).find((k) =>
        k.startsWith('transform/')
      );
      const routingProcessor = result.processors?.[routingKey!];
      // Cache has dynamic_signal_types: true, so routing should have both metric and log statements
      expect(routingProcessor).toHaveProperty('metric_statements');
      expect(routingProcessor).toHaveProperty('log_statements');
    });

    it('uses single-type routing for a non-dynamic input even when another template in the same package has dynamic_signal_types', () => {
      // Package has two policy templates: 'otel_policy' with dynamic_signal_types and
      // 'metrics_policy' without it. The input below belongs to 'metrics_policy'.
      const mixedPackageInfo = {
        type: 'integration',
        name: 'mixed_pkg',
        version: '1.0.0',
        policy_templates: [
          {
            name: 'otel_policy',
            title: 'OTel',
            description: 'OTel',
            inputs: [
              {
                type: OTEL_COLLECTOR_INPUT_TYPE,
                title: 'OTel',
                description: 'OTel',
                dynamic_signal_types: true,
              },
            ],
          },
          {
            name: 'metrics_policy',
            title: 'Metrics',
            description: 'Metrics',
            inputs: [
              {
                type: OTEL_COLLECTOR_INPUT_TYPE,
                title: 'Metrics OTel',
                description: 'Metrics only',
                // No dynamic_signal_types
              },
            ],
          },
        ],
      } as any;

      const nonDynamicInput: FullAgentPolicyInput = {
        type: OTEL_COLLECTOR_INPUT_TYPE,
        id: 'non-dynamic-otel',
        name: 'non-dynamic-otel',
        revision: 0,
        data_stream: { namespace: 'default' },
        use_output: 'default',
        package_policy_id: 'non-dynamic-policy',
        meta: {
          package: {
            name: 'mixed_pkg',
            version: '1.0.0',
            policy_template: 'metrics_policy', // belongs to the non-dynamic template
          },
        },
        streams: [
          {
            id: 'stream-id-1',
            data_stream: { dataset: 'mixed_pkg.metrics', type: 'metrics' },
            service: {
              pipelines: {
                'metrics/otlp': { receivers: ['otlp'] },
                'logs/otlp': { receivers: ['otlp'] },
              },
            },
          },
        ],
      };

      const cache = new Map([['mixed_pkg-1.0.0', mixedPackageInfo]]);
      const result = generateOtelcolConfig({ inputs: [nonDynamicInput], packageInfoCache: cache });

      const routingKey = Object.keys(result.processors ?? {}).find((k) =>
        k.startsWith('transform/')
      );
      expect(routingKey).toBeDefined();
      const routingProcessor = result.processors?.[routingKey!];

      // 'metrics_policy' input has no dynamic_signal_types — must produce only metric_statements
      // (from data_stream.type: metrics), not log_statements from the other template.
      expect(routingProcessor).toHaveProperty('metric_statements');
      expect(routingProcessor).not.toHaveProperty('log_statements');
    });

    it('uses single-type routing for an otelcol input when the same template also has a different dynamic input type', () => {
      // Single template 'combined_policy' with two inputs:
      //   - 'otelcol'         — no dynamic_signal_types
      //   - 'custom_receiver' — dynamic_signal_types: true
      // Only the 'otelcol' input is processed here; it should produce single-type routing
      // because its own definition has no dynamic_signal_types.
      const mixedInputsPackageInfo = {
        type: 'integration',
        name: 'combined_pkg',
        version: '1.0.0',
        policy_templates: [
          {
            name: 'combined_policy',
            title: 'Combined',
            description: 'Combined inputs',
            inputs: [
              {
                type: OTEL_COLLECTOR_INPUT_TYPE,
                title: 'OTel',
                description: 'Standard OTel collector',
                // No dynamic_signal_types
              },
              {
                type: 'custom_receiver',
                title: 'Custom',
                description: 'Custom dynamic receiver',
                dynamic_signal_types: true,
              },
            ],
          },
        ],
      } as any;

      const nonDynamicOtelInput: FullAgentPolicyInput = {
        type: OTEL_COLLECTOR_INPUT_TYPE,
        id: 'combined-otel',
        name: 'combined-otel',
        revision: 0,
        data_stream: { namespace: 'default' },
        use_output: 'default',
        package_policy_id: 'combined-policy',
        meta: {
          package: {
            name: 'combined_pkg',
            version: '1.0.0',
            policy_template: 'combined_policy',
          },
        },
        streams: [
          {
            id: 'stream-id-1',
            data_stream: { dataset: 'combined_pkg.metrics', type: 'metrics' },
            service: {
              pipelines: {
                'metrics/otlp': { receivers: ['otlp'] },
                'logs/otlp': { receivers: ['otlp'] },
              },
            },
          },
        ],
      };

      const cache = new Map([['combined_pkg-1.0.0', mixedInputsPackageInfo]]);
      const result2 = generateOtelcolConfig({
        inputs: [nonDynamicOtelInput],
        packageInfoCache: cache,
      });

      const routingKey2 = Object.keys(result2.processors ?? {}).find((k) =>
        k.startsWith('transform/')
      );
      expect(routingKey2).toBeDefined();
      const routingProcessor2 = result2.processors?.[routingKey2!];

      // otelcol in this template has no dynamic_signal_types — must produce only metric_statements
      // (from data_stream.type: metrics), not log_statements from the sibling custom_receiver input.
      expect(routingProcessor2).toHaveProperty('metric_statements');
      expect(routingProcessor2).not.toHaveProperty('log_statements');
    });
  });

  describe('adjustPipelineSignalType for non-dynamic OTel packages', () => {
    const packageInfoCacheNonDynamic = new Map([
      [
        'otel-traces-1.0.0',
        {
          name: 'otel-traces',
          version: '1.0.0',
          policy_templates: [
            {
              name: 'template1',
              title: 'OTel Traces',
              input: 'otelcol',
              type: 'logs',
              template_path: 'input.yml.hbs',
              dynamic_signal_types: false,
              vars: [],
            },
          ],
        } as any,
      ],
    ]);

    const packageInfoCacheDynamic = new Map([
      [
        'otel-traces-1.0.0',
        {
          name: 'otel-traces',
          version: '1.0.0',
          policy_templates: [
            {
              name: 'template1',
              title: 'OTel Traces',
              input: 'otelcol',
              type: 'logs',
              template_path: 'input.yml.hbs',
              dynamic_signal_types: true,
              vars: [],
            },
          ],
        } as any,
      ],
    ]);

    const makeInput = (dataStreamType: string, pipelineKey: string): FullAgentPolicyInput => ({
      type: OTEL_COLLECTOR_INPUT_TYPE,
      id: 'test-otel',
      name: 'test-otel',
      revision: 0,
      data_stream: { namespace: 'default' },
      use_output: 'default',
      package_policy_id: 'somepolicy',
      meta: { package: { name: 'otel-traces', version: '1.0.0' } },
      streams: [
        {
          id: 'stream-id-1',
          data_stream: { dataset: 'mydata', type: dataStreamType },
          receivers: { otlp: { protocols: { grpc: { endpoint: '0.0.0.0:4317' } } } },
          service: { pipelines: { [pipelineKey]: { receivers: ['otlp'] } } },
        },
      ],
    });

    it('renames the pipeline key when data_stream.type differs from the package default', () => {
      const input = makeInput('traces', 'logs/otlp');
      const result = generateOtelcolConfig({
        inputs: [input],
        dataOutput: defaultOutput,
        packageInfoCache: packageInfoCacheNonDynamic,
      });
      expect(result.service?.pipelines).toHaveProperty('traces/otlp/test-otel-stream-id-1');
      expect(result.service?.pipelines).not.toHaveProperty('logs/otlp/test-otel-stream-id-1');
    });

    it('passes through unchanged when data_stream.type already matches the pipeline key', () => {
      const input = makeInput('logs', 'logs/otlp');
      const result = generateOtelcolConfig({
        inputs: [input],
        dataOutput: defaultOutput,
        packageInfoCache: packageInfoCacheNonDynamic,
      });
      expect(result.service?.pipelines).toHaveProperty('logs/otlp/test-otel-stream-id-1');
    });

    it('does not rename for dynamic_signal_types packages', () => {
      const input = makeInput('traces', 'logs/otlp');
      const result = generateOtelcolConfig({
        inputs: [input],
        dataOutput: defaultOutput,
        packageInfoCache: packageInfoCacheDynamic,
      });
      expect(result.service?.pipelines).toHaveProperty('logs/otlp/test-otel-stream-id-1');
      expect(result.service?.pipelines).not.toHaveProperty('traces/otlp/test-otel-stream-id-1');
    });

    it('renames pipeline for non-dynamic input when another template in the package has dynamic_signal_types', () => {
      const mixedPackageInfo = {
        type: 'integration',
        name: 'mixed_pkg',
        version: '1.0.0',
        policy_templates: [
          {
            name: 'otel_policy',
            title: 'OTel',
            description: 'OTel',
            inputs: [
              {
                type: OTEL_COLLECTOR_INPUT_TYPE,
                title: 'OTel',
                description: 'OTel',
                dynamic_signal_types: true,
              },
            ],
          },
          {
            name: 'metrics_policy',
            title: 'Metrics',
            description: 'Metrics',
            inputs: [
              {
                type: OTEL_COLLECTOR_INPUT_TYPE,
                title: 'Metrics OTel',
                description: 'Metrics only',
              },
            ],
          },
        ],
      } as any;

      const nonDynamicInput: FullAgentPolicyInput = {
        type: OTEL_COLLECTOR_INPUT_TYPE,
        id: 'non-dynamic-otel',
        name: 'non-dynamic-otel',
        revision: 0,
        data_stream: { namespace: 'default' },
        use_output: 'default',
        package_policy_id: 'non-dynamic-policy',
        meta: {
          package: {
            name: 'mixed_pkg',
            version: '1.0.0',
            policy_template: 'metrics_policy',
          },
        },
        streams: [
          {
            id: 'stream-id-1',
            data_stream: { dataset: 'mixed_pkg.metrics', type: 'traces' },
            receivers: { otlp: { protocols: { grpc: { endpoint: '0.0.0.0:4317' } } } },
            service: {
              pipelines: {
                'logs/otlp': { receivers: ['otlp'] },
              },
            },
          },
        ],
      };

      const cache = new Map([['mixed_pkg-1.0.0', mixedPackageInfo]]);
      const result = generateOtelcolConfig({
        inputs: [nonDynamicInput],
        dataOutput: defaultOutput,
        packageInfoCache: cache,
      });

      expect(result.service?.pipelines).toHaveProperty('traces/otlp/non-dynamic-otel-stream-id-1');
      expect(result.service?.pipelines).not.toHaveProperty(
        'logs/otlp/non-dynamic-otel-stream-id-1'
      );
    });

    it('does not rename when there are multiple pipelines', () => {
      const input: FullAgentPolicyInput = {
        type: OTEL_COLLECTOR_INPUT_TYPE,
        id: 'test-otel',
        name: 'test-otel',
        revision: 0,
        data_stream: { namespace: 'default' },
        use_output: 'default',
        package_policy_id: 'somepolicy',
        meta: { package: { name: 'otel-traces', version: '1.0.0' } },
        streams: [
          {
            id: 'stream-id-1',
            data_stream: { dataset: 'mydata', type: 'traces' },
            receivers: { otlp: { protocols: { grpc: { endpoint: '0.0.0.0:4317' } } } },
            service: {
              pipelines: {
                'logs/otlp': { receivers: ['otlp'] },
                'metrics/otlp': { receivers: ['otlp'] },
              },
            },
          },
        ],
      };
      const result = generateOtelcolConfig({
        inputs: [input],
        dataOutput: defaultOutput,
        packageInfoCache: packageInfoCacheNonDynamic,
      });
      expect(result.service?.pipelines).toHaveProperty('logs/otlp/test-otel-stream-id-1');
      expect(result.service?.pipelines).toHaveProperty('metrics/otlp/test-otel-stream-id-1');
    });
  });
  describe('beatsauth extension generation', () => {
    const inputs: FullAgentPolicyInput[] = [otelInput1];

    it('should include beatsauth extension with ssl fields when output has ssl config', () => {
      const outputWithSSL: Output = {
        ...defaultOutput,
        ca_trusted_fingerprint: 'abc123fingerprint',
        ssl: {
          certificate_authorities: ['-----BEGIN CERTIFICATE-----\nMIIC...'],
          certificate: '-----BEGIN CERTIFICATE-----\nMIID...',
          key: '-----BEGIN PRIVATE KEY-----\nMIIE...',
          verification_mode: 'full',
        },
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: outputWithSSL });

      expect(result.extensions?.['beatsauth/default']).toEqual({
        ssl: {
          ca_trusted_fingerprint: 'abc123fingerprint',
          certificate_authorities: ['-----BEGIN CERTIFICATE-----\nMIIC...'],
          certificate: '-----BEGIN CERTIFICATE-----\nMIID...',
          key: '-----BEGIN PRIVATE KEY-----\nMIIE...',
          verification_mode: 'full',
        },
      });
      expect(result.exporters?.['elasticsearch/default']).toEqual({
        endpoints: ['http://localhost:9200'],
        auth: { authenticator: 'beatsauth/default' },
      });
      expect(result.service?.extensions).toContain('beatsauth/default');
    });

    it('should include ca_trusted_fingerprint only when that is the only ssl field set', () => {
      const outputWithFingerprint: Output = {
        ...defaultOutput,
        ca_trusted_fingerprint: 'myfingerprint',
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: outputWithFingerprint });

      expect(result.extensions?.['beatsauth/default']).toEqual({
        ssl: { ca_trusted_fingerprint: 'myfingerprint' },
      });
    });

    it('should include ca_sha256 in beatsauth ssl config', () => {
      const outputWithCaSha: Output = {
        ...defaultOutput,
        ca_sha256: 'sha256value',
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: outputWithCaSha });

      expect(result.extensions?.['beatsauth/default']).toEqual({
        ssl: { ca_sha256: 'sha256value' },
      });
    });

    it('should include proxy fields when proxy is passed', () => {
      const proxy = {
        id: 'proxy-1',
        name: 'my-proxy',
        url: 'http://proxy.example.com:3128',
        proxy_headers: { 'X-Custom-Header': 'value' },
        is_preconfigured: false,
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: defaultOutput, proxy });

      expect(result.extensions?.['beatsauth/default']).toEqual({
        proxy_url: 'http://proxy.example.com:3128',
        proxy_headers: { 'X-Custom-Header': 'value' },
      });
      expect(result.service?.extensions).toContain('beatsauth/default');
    });

    it('should include proxy url but not proxy_headers when headers are not set', () => {
      const proxy = {
        id: 'proxy-1',
        name: 'my-proxy',
        url: 'http://proxy.example.com:3128',
        is_preconfigured: false,
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: defaultOutput, proxy });

      expect(result.extensions?.['beatsauth/default']).toEqual({
        proxy_url: 'http://proxy.example.com:3128',
      });
    });

    it('should combine ssl and proxy fields in beatsauth when both are configured', () => {
      const outputWithSSL: Output = {
        ...defaultOutput,
        ca_trusted_fingerprint: 'combinedfingerprint',
        ssl: {
          certificate_authorities: ['-----BEGIN CERTIFICATE-----\nCA...'],
        },
      };
      const proxy = {
        id: 'proxy-1',
        name: 'my-proxy',
        url: 'http://proxy.example.com:3128',
        proxy_headers: { 'Proxy-Auth': 'token' },
        is_preconfigured: false,
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: outputWithSSL, proxy });

      expect(result.extensions?.['beatsauth/default']).toEqual({
        ssl: {
          ca_trusted_fingerprint: 'combinedfingerprint',
          certificate_authorities: ['-----BEGIN CERTIFICATE-----\nCA...'],
        },
        proxy_url: 'http://proxy.example.com:3128',
        proxy_headers: { 'Proxy-Auth': 'token' },
      });
    });

    it('should omit beatsauth from extensions and exporter auth when output has no ssl or proxy fields', () => {
      const result = generateOtelcolConfig({ inputs, dataOutput: defaultOutput });

      expect(result.extensions?.['beatsauth/default']).toBeUndefined();
      expect(result.exporters?.['elasticsearch/default']).not.toHaveProperty('auth');
      expect(result.service?.extensions ?? []).not.toContain('beatsauth/default');
    });

    it('should use secrets.ssl.key when present, ignoring plain ssl.key', () => {
      const outputWithSecretKey: Output = {
        ...defaultOutput,
        ssl: {
          key: 'plain-key-should-be-ignored',
        },
        secrets: {
          ssl: { key: { id: 'secret-id-abc123' } },
        },
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: outputWithSecretKey });

      expect(result.extensions?.['beatsauth/default']).toEqual({
        secrets: { ssl: { key: { id: 'secret-id-abc123' } } },
      });
    });

    it('should include secrets.ssl.key in beatsauth when only secret key is set', () => {
      const outputWithSecretOnly: Output = {
        ...defaultOutput,
        secrets: {
          ssl: { key: { id: 'my-secret-id' } },
        },
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: outputWithSecretOnly });

      expect(result.extensions?.['beatsauth/default']).toEqual({
        secrets: { ssl: { key: { id: 'my-secret-id' } } },
      });
    });

    it('should suppress ssl.key from config_yaml when secrets.ssl.key is set', () => {
      // config_yaml has a plain ssl.key — it must be stripped when a secret key is configured,
      // otherwise both would appear in beatsauth (plain key in ssl.key, secret in secrets.ssl.key).
      const outputWithYamlKeyAndSecret: Output = {
        ...defaultOutput,
        config_yaml: 'ssl:\n  key: plain-key-from-yaml\n  verification_mode: none',
        secrets: {
          ssl: { key: { id: 'secret-id-takes-precedence' } },
        },
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: outputWithYamlKeyAndSecret });

      expect(result.extensions?.['beatsauth/default']).toEqual({
        ssl: { verification_mode: 'none' }, // key stripped from ssl
        secrets: { ssl: { key: { id: 'secret-id-takes-precedence' } } },
      });
      // Ensure no plain key leaks through
      expect((result.extensions?.['beatsauth/default'] as any)?.ssl?.key).toBeUndefined();
    });
  });

  describe('otel_exporter_config_yaml merging', () => {
    const inputs: FullAgentPolicyInput[] = [otelInput1];

    it('should merge user YAML into the exporter config', () => {
      const outputWithExporterYaml: Output = {
        ...defaultOutput,
        otel_exporter_config_yaml: 'flush_interval: 10s',
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: outputWithExporterYaml });

      expect(result.exporters?.['elasticsearch/default']).toEqual(
        expect.objectContaining({ flush_interval: '10s' })
      );
    });

    it('should not allow user YAML to override endpoints', () => {
      const outputWithOverrides: Output = {
        ...defaultOutput,
        otel_exporter_config_yaml: 'endpoints:\n  - http://evil.com',
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: outputWithOverrides });

      expect(result.exporters?.['elasticsearch/default']).toEqual(
        expect.objectContaining({
          endpoints: defaultOutput.hosts,
        })
      );
    });

    it('should handle null otel_exporter_config_yaml gracefully', () => {
      const outputWithNull: Output = {
        ...defaultOutput,
        otel_exporter_config_yaml: null,
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: outputWithNull });

      expect(result.exporters?.['elasticsearch/default']).toEqual({
        endpoints: defaultOutput.hosts,
      });
    });

    it('should handle undefined otel_exporter_config_yaml gracefully', () => {
      const result = generateOtelcolConfig({ inputs, dataOutput: defaultOutput });

      expect(result.exporters?.['elasticsearch/default']).toEqual({
        endpoints: defaultOutput.hosts,
      });
    });

    it('should handle malformed YAML without throwing', () => {
      const outputWithBadYaml: Output = {
        ...defaultOutput,
        otel_exporter_config_yaml: ': invalid yaml',
      };

      expect(() => generateOtelcolConfig({ inputs, dataOutput: outputWithBadYaml })).not.toThrow();

      const result = generateOtelcolConfig({ inputs, dataOutput: outputWithBadYaml });
      expect(result.exporters?.['elasticsearch/default']).toEqual({
        endpoints: defaultOutput.hosts,
      });
    });

    it('should ignore non-object YAML (scalar)', () => {
      const outputWithScalarYaml: Output = {
        ...defaultOutput,
        otel_exporter_config_yaml: 'just a string',
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: outputWithScalarYaml });

      expect(result.exporters?.['elasticsearch/default']).toEqual({
        endpoints: defaultOutput.hosts,
      });
    });

    it('should ignore non-object YAML (array)', () => {
      const outputWithArrayYaml: Output = {
        ...defaultOutput,
        otel_exporter_config_yaml: '- a\n- b',
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: outputWithArrayYaml });

      expect(result.exporters?.['elasticsearch/default']).toEqual({
        endpoints: defaultOutput.hosts,
      });
    });
  });

  describe('config_yaml Advanced YAML parameters in beatsauth', () => {
    const inputs: FullAgentPolicyInput[] = [otelInput1];

    it('should include ssl parameters from config_yaml in beatsauth', () => {
      const outputWithConfigYaml: Output = {
        ...defaultOutput,
        config_yaml:
          'ssl:\n  certificate_authorities:\n    - /path/to/ca.crt\n  verification_mode: none',
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: outputWithConfigYaml });

      expect(result.extensions?.['beatsauth/default']).toEqual({
        ssl: {
          certificate_authorities: ['/path/to/ca.crt'],
          verification_mode: 'none',
        },
      });
    });

    it('should include timeout and idle_connection_timeout from config_yaml in beatsauth', () => {
      const outputWithConfigYaml: Output = {
        ...defaultOutput,
        config_yaml: 'timeout: 30s\nidle_connection_timeout: 5s',
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: outputWithConfigYaml });

      expect(result.extensions?.['beatsauth/default']).toEqual({
        timeout: '30s',
        idle_connection_timeout: '5s',
      });
    });

    it('should include proxy fields from config_yaml in beatsauth when no structured proxy is set', () => {
      const outputWithConfigYaml: Output = {
        ...defaultOutput,
        config_yaml:
          'proxy_url: socks5://internal-proxy:1080\nproxy_headers:\n  X-Proxy-Auth: token',
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: outputWithConfigYaml });

      expect(result.extensions?.['beatsauth/default']).toEqual({
        proxy_url: 'socks5://internal-proxy:1080',
        proxy_headers: { 'X-Proxy-Auth': 'token' },
      });
    });

    it('structured ssl fields should take precedence over config_yaml ssl values', () => {
      const outputWithBoth: Output = {
        ...defaultOutput,
        // config_yaml sets verification_mode to none and a CA path
        config_yaml:
          'ssl:\n  verification_mode: none\n  certificate_authorities:\n    - /yaml/ca.crt',
        // structured field overrides verification_mode to full and provides its own CA
        ssl: {
          certificate_authorities: ['-----BEGIN CERTIFICATE-----\nSTRUCTURED_CA'],
          verification_mode: 'full',
        },
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: outputWithBoth });

      expect(result.extensions?.['beatsauth/default']).toEqual({
        ssl: {
          certificate_authorities: ['-----BEGIN CERTIFICATE-----\nSTRUCTURED_CA'],
          verification_mode: 'full',
        },
      });
    });

    it('should not crash when config_yaml is null', () => {
      const outputWithNull: Output = {
        ...defaultOutput,
        config_yaml: null,
      };

      expect(() => generateOtelcolConfig({ inputs, dataOutput: outputWithNull })).not.toThrow();
      const result = generateOtelcolConfig({ inputs, dataOutput: outputWithNull });
      expect(result.extensions?.['beatsauth/default']).toBeUndefined();
    });

    it('should throw when config_yaml contains malformed YAML', () => {
      const outputWithBadYaml: Output = {
        ...defaultOutput,
        config_yaml: ': invalid yaml',
      };

      expect(() => generateOtelcolConfig({ inputs, dataOutput: outputWithBadYaml })).toThrow();
    });
  });

  describe('remote_elasticsearch output', () => {
    const inputs: FullAgentPolicyInput[] = [otelInput1];
    const remoteOutput: Output = {
      ...defaultOutput,
      id: 'remote-output',
      name: 'remote-output',
      is_default: false,
      type: outputType.RemoteElasticsearch,
      hosts: ['https://remote-es.example.com:9200'],
    };

    it('should generate an elasticsearch exporter keyed by the remote output id', () => {
      const result = generateOtelcolConfig({ inputs, dataOutput: remoteOutput });

      expect(result.exporters).toHaveProperty('elasticsearch/remote-output');
      expect(result.exporters).not.toHaveProperty('elasticsearch/default');
      expect(result.exporters?.['elasticsearch/remote-output']).toMatchObject({
        endpoints: ['https://remote-es.example.com:9200'],
      });
    });

    it('should include beatsauth extension with ssl fields when remote output has ssl config', () => {
      const remoteOutputWithSSL: Output = {
        ...remoteOutput,
        ca_trusted_fingerprint: 'remote-fingerprint',
        ssl: {
          certificate_authorities: ['-----BEGIN CERTIFICATE-----\nREMOTE...'],
          verification_mode: 'full',
        },
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: remoteOutputWithSSL });

      expect(result.extensions?.['beatsauth/remote-output']).toEqual({
        ssl: {
          ca_trusted_fingerprint: 'remote-fingerprint',
          certificate_authorities: ['-----BEGIN CERTIFICATE-----\nREMOTE...'],
          verification_mode: 'full',
        },
      });
      expect(result.exporters?.['elasticsearch/remote-output']).toMatchObject({
        auth: { authenticator: 'beatsauth/remote-output' },
      });
      expect(result.service?.extensions).toContain('beatsauth/remote-output');
    });

    it('should omit beatsauth when remote output has no ssl or proxy', () => {
      const result = generateOtelcolConfig({ inputs, dataOutput: remoteOutput });

      expect(result.extensions?.['beatsauth/remote-output']).toBeUndefined();
      expect(result.exporters?.['elasticsearch/remote-output']).not.toHaveProperty('auth');
      expect(result.service?.extensions ?? []).not.toContain('beatsauth/remote-output');
    });

    it('should include proxy fields in beatsauth for remote output', () => {
      const proxy = {
        id: 'proxy-1',
        name: 'my-proxy',
        url: 'http://proxy.example.com:3128',
        is_preconfigured: false,
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: remoteOutput, proxy });

      expect(result.extensions?.['beatsauth/remote-output']).toEqual({
        proxy_url: 'http://proxy.example.com:3128',
      });
      expect(result.service?.extensions).toContain('beatsauth/remote-output');
    });

    it('should omit beatsauth and include only endpoints when otel_disable_beatsauth is true on remote output', () => {
      const remoteOutputDisabled: Output = {
        ...remoteOutput,
        otel_disable_beatsauth: true,
        ssl: {
          certificate_authorities: ['-----BEGIN CERTIFICATE-----\nREMOTE...'],
        },
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: remoteOutputDisabled });

      expect(result.extensions?.['beatsauth/remote-output']).toBeUndefined();
      expect(result.exporters?.['elasticsearch/remote-output']).toEqual({
        endpoints: ['https://remote-es.example.com:9200'],
      });
    });

    it('should merge otel_exporter_config_yaml into exporter for remote output', () => {
      const remoteOutputWithYaml: Output = {
        ...remoteOutput,
        otel_exporter_config_yaml: 'flush_interval: 10s',
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: remoteOutputWithYaml });

      expect(result.exporters?.['elasticsearch/remote-output']).toMatchObject({
        flush_interval: '10s',
        endpoints: ['https://remote-es.example.com:9200'],
      });
    });
  });

  describe('otel_disable_beatsauth toggle', () => {
    const inputs: FullAgentPolicyInput[] = [otelInput1];

    it('should omit beatsauth extension and auth when otel_disable_beatsauth is true', () => {
      const outputWithDisabledBeatsauth: Output = {
        ...defaultOutput,
        otel_disable_beatsauth: true,
        ssl: {
          certificate_authorities: ['-----BEGIN CERTIFICATE-----\nMIIC...'],
          verification_mode: 'full',
        },
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: outputWithDisabledBeatsauth });

      expect(result.extensions?.['beatsauth/default']).toBeUndefined();
      expect(result.exporters?.['elasticsearch/default']).not.toHaveProperty('auth');
      expect(result.service?.extensions ?? []).not.toContain('beatsauth/default');
    });

    it('should still include endpoints in exporter when otel_disable_beatsauth is true', () => {
      const outputWithDisabledBeatsauth: Output = {
        ...defaultOutput,
        otel_disable_beatsauth: true,
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: outputWithDisabledBeatsauth });

      expect(result.exporters?.['elasticsearch/default']).toEqual({
        endpoints: defaultOutput.hosts,
      });
    });

    it('should still merge otel_exporter_config_yaml into exporter when otel_disable_beatsauth is true', () => {
      const outputWithDisabledBeatsauth: Output = {
        ...defaultOutput,
        otel_disable_beatsauth: true,
        otel_exporter_config_yaml: 'flush_interval: 5s',
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: outputWithDisabledBeatsauth });

      expect(result.exporters?.['elasticsearch/default']).toEqual({
        flush_interval: '5s',
        endpoints: defaultOutput.hosts,
      });
      expect(result.extensions?.['beatsauth/default']).toBeUndefined();
    });

    it('should use beatsauth normally when otel_disable_beatsauth is false', () => {
      const outputWithEnabledBeatsauth: Output = {
        ...defaultOutput,
        otel_disable_beatsauth: false,
        ssl: {
          certificate_authorities: ['-----BEGIN CERTIFICATE-----\nMIIC...'],
        },
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: outputWithEnabledBeatsauth });

      expect(result.extensions?.['beatsauth/default']).toBeDefined();
      expect(result.exporters?.['elasticsearch/default']).toHaveProperty('auth');
    });

    it('should use beatsauth normally when otel_disable_beatsauth is undefined', () => {
      const outputWithSSL: Output = {
        ...defaultOutput,
        ssl: {
          certificate_authorities: ['-----BEGIN CERTIFICATE-----\nMIIC...'],
        },
      };

      const result = generateOtelcolConfig({ inputs, dataOutput: outputWithSSL });

      expect(result.extensions?.['beatsauth/default']).toBeDefined();
      expect(result.exporters?.['elasticsearch/default']).toHaveProperty('auth');
    });
  });

  it('should fall back to default output when packageOutputs is empty', () => {
    const inputA: FullAgentPolicyInput = {
      ...otelInput1,
      id: 'input-a',
      name: 'input-a',
      package_policy_id: 'pkg-policy-a',
    };
    expect(
      generateOtelcolConfig({
        inputs: [inputA],
        dataOutput: defaultOutput,
        packageOutputs: new Map(),
      })
    ).toEqual({
      receivers: {
        'httpcheck/input-a-stream-id-1': {
          targets: [{ endpoints: ['https://epr.elastic.co'] }],
        },
      },
      processors: {
        'transform/input-a-stream-id-1': {
          metric_statements: ['set(metric.description, "Sum") where metric.type == "Sum"'],
        },
        'transform/input-a-stream-id-1-routing': {
          metric_statements: [
            {
              context: 'datapoint',
              statements: [
                'set(attributes["data_stream.type"], "metrics")',
                'set(attributes["data_stream.dataset"], "somedataset")',
                'set(attributes["data_stream.namespace"], "testing")',
              ],
            },
          ],
        },
      },
      connectors: {
        'forward/default': {},
      },
      exporters: {
        'elasticsearch/default': {
          endpoints: ['http://localhost:9200'],
        },
      },
      service: {
        pipelines: {
          'metrics/input-a-stream-id-1': {
            receivers: ['httpcheck/input-a-stream-id-1'],
            processors: ['transform/input-a-stream-id-1', 'transform/input-a-stream-id-1-routing'],
            exporters: ['forward/default'],
          },
          'metrics/default': {
            receivers: ['forward/default'],
            exporters: ['elasticsearch/default'],
          },
        },
      },
    });
  });

  it('should route streams to the override output when packageOutputs contains an entry', () => {
    const overrideOutput: Output = {
      id: 'override-output-id',
      name: 'override-output',
      type: outputType.Elasticsearch,
      is_default: false,
      is_default_monitoring: false,
      hosts: ['http://override-es:9200'],
    };
    const inputA: FullAgentPolicyInput = {
      ...otelInput1,
      id: 'input-a',
      name: 'input-a',
      package_policy_id: 'pkg-policy-a',
    };
    expect(
      generateOtelcolConfig({
        inputs: [inputA],
        dataOutput: defaultOutput,
        packageOutputs: new Map([['pkg-policy-a', overrideOutput]]),
      })
    ).toEqual({
      receivers: {
        'httpcheck/input-a-stream-id-1': {
          targets: [{ endpoints: ['https://epr.elastic.co'] }],
        },
      },
      processors: {
        'transform/input-a-stream-id-1': {
          metric_statements: ['set(metric.description, "Sum") where metric.type == "Sum"'],
        },
        'transform/input-a-stream-id-1-routing': {
          metric_statements: [
            {
              context: 'datapoint',
              statements: [
                'set(attributes["data_stream.type"], "metrics")',
                'set(attributes["data_stream.dataset"], "somedataset")',
                'set(attributes["data_stream.namespace"], "testing")',
              ],
            },
          ],
        },
      },
      connectors: {
        'forward/override-output-id': {},
      },
      exporters: {
        'elasticsearch/override-output-id': {
          endpoints: ['http://override-es:9200'],
        },
      },
      service: {
        pipelines: {
          'metrics/input-a-stream-id-1': {
            receivers: ['httpcheck/input-a-stream-id-1'],
            processors: ['transform/input-a-stream-id-1', 'transform/input-a-stream-id-1-routing'],
            exporters: ['forward/override-output-id'],
          },
          'metrics/override-output-id': {
            receivers: ['forward/override-output-id'],
            exporters: ['elasticsearch/override-output-id'],
          },
        },
      },
    });
  });

  it('should route to different outputs for two inputs with different overrides', () => {
    const overrideOutput: Output = {
      id: 'override-output-id',
      name: 'override-output',
      type: outputType.Elasticsearch,
      is_default: false,
      is_default_monitoring: false,
      hosts: ['http://override-es:9200'],
    };
    const inputA: FullAgentPolicyInput = {
      ...otelInput1,
      id: 'input-a',
      name: 'input-a',
      package_policy_id: 'pkg-policy-a',
    };
    const inputB: FullAgentPolicyInput = {
      ...otelInput2,
      id: 'input-b',
      name: 'input-b',
      package_policy_id: 'pkg-policy-b',
    };
    expect(
      generateOtelcolConfig({
        inputs: [inputA, inputB],
        dataOutput: defaultOutput,
        packageOutputs: new Map([
          ['pkg-policy-a', overrideOutput],
          ['pkg-policy-b', { ...defaultOutput, is_default: false }],
        ]),
      })
    ).toEqual({
      receivers: {
        'httpcheck/input-a-stream-id-1': {
          targets: [{ endpoints: ['https://epr.elastic.co'] }],
        },
        'httpcheck/input-b-stream-id-1': {
          targets: [{ endpoints: ['https://www.elastic.co'] }],
        },
      },
      processors: {
        'transform/input-a-stream-id-1': {
          metric_statements: ['set(metric.description, "Sum") where metric.type == "Sum"'],
        },
        'transform/input-a-stream-id-1-routing': {
          metric_statements: [
            {
              context: 'datapoint',
              statements: [
                'set(attributes["data_stream.type"], "metrics")',
                'set(attributes["data_stream.dataset"], "somedataset")',
                'set(attributes["data_stream.namespace"], "testing")',
              ],
            },
          ],
        },
        'transform/input-b-stream-id-1': {
          metric_statements: ['set(metric.description, "Sum") where metric.type == "Sum"'],
        },
        'transform/input-b-stream-id-1-routing': {
          metric_statements: [
            {
              context: 'datapoint',
              statements: [
                'set(attributes["data_stream.type"], "metrics")',
                'set(attributes["data_stream.dataset"], "otherdataset")',
                'set(attributes["data_stream.namespace"], "default")',
              ],
            },
          ],
        },
      },
      connectors: {
        'forward/override-output-id': {},
        'forward/fleet-default-output': {},
      },
      exporters: {
        'elasticsearch/override-output-id': {
          endpoints: ['http://override-es:9200'],
        },
        'elasticsearch/fleet-default-output': {
          endpoints: ['http://localhost:9200'],
        },
      },
      service: {
        pipelines: {
          'metrics/input-a-stream-id-1': {
            receivers: ['httpcheck/input-a-stream-id-1'],
            processors: ['transform/input-a-stream-id-1', 'transform/input-a-stream-id-1-routing'],
            exporters: ['forward/override-output-id'],
          },
          'metrics/input-b-stream-id-1': {
            receivers: ['httpcheck/input-b-stream-id-1'],
            processors: ['transform/input-b-stream-id-1', 'transform/input-b-stream-id-1-routing'],
            exporters: ['forward/fleet-default-output'],
          },
          'metrics/override-output-id': {
            receivers: ['forward/override-output-id'],
            exporters: ['elasticsearch/override-output-id'],
          },
          'metrics/fleet-default-output': {
            receivers: ['forward/fleet-default-output'],
            exporters: ['elasticsearch/fleet-default-output'],
          },
        },
      },
    });
  });

  it('should route one input to override and one to default when only one has an override', () => {
    const overrideOutput: Output = {
      id: 'override-output-id',
      name: 'override-output',
      type: outputType.Elasticsearch,
      is_default: false,
      is_default_monitoring: false,
      hosts: ['http://override-es:9200'],
    };
    const inputA: FullAgentPolicyInput = {
      ...otelInput1,
      id: 'input-a',
      name: 'input-a',
      package_policy_id: 'pkg-policy-a',
    };
    const inputB: FullAgentPolicyInput = {
      ...otelInput2,
      id: 'input-b',
      name: 'input-b',
      package_policy_id: 'pkg-policy-b',
    };
    expect(
      generateOtelcolConfig({
        inputs: [inputA, inputB],
        dataOutput: defaultOutput,
        packageOutputs: new Map([['pkg-policy-a', overrideOutput]]),
      })
    ).toEqual({
      receivers: {
        'httpcheck/input-a-stream-id-1': {
          targets: [{ endpoints: ['https://epr.elastic.co'] }],
        },
        'httpcheck/input-b-stream-id-1': {
          targets: [{ endpoints: ['https://www.elastic.co'] }],
        },
      },
      processors: {
        'transform/input-a-stream-id-1': {
          metric_statements: ['set(metric.description, "Sum") where metric.type == "Sum"'],
        },
        'transform/input-a-stream-id-1-routing': {
          metric_statements: [
            {
              context: 'datapoint',
              statements: [
                'set(attributes["data_stream.type"], "metrics")',
                'set(attributes["data_stream.dataset"], "somedataset")',
                'set(attributes["data_stream.namespace"], "testing")',
              ],
            },
          ],
        },
        'transform/input-b-stream-id-1': {
          metric_statements: ['set(metric.description, "Sum") where metric.type == "Sum"'],
        },
        'transform/input-b-stream-id-1-routing': {
          metric_statements: [
            {
              context: 'datapoint',
              statements: [
                'set(attributes["data_stream.type"], "metrics")',
                'set(attributes["data_stream.dataset"], "otherdataset")',
                'set(attributes["data_stream.namespace"], "default")',
              ],
            },
          ],
        },
      },
      connectors: {
        'forward/override-output-id': {},
        'forward/default': {},
      },
      exporters: {
        'elasticsearch/override-output-id': {
          endpoints: ['http://override-es:9200'],
        },
        'elasticsearch/default': {
          endpoints: ['http://localhost:9200'],
        },
      },
      service: {
        pipelines: {
          'metrics/input-a-stream-id-1': {
            receivers: ['httpcheck/input-a-stream-id-1'],
            processors: ['transform/input-a-stream-id-1', 'transform/input-a-stream-id-1-routing'],
            exporters: ['forward/override-output-id'],
          },
          'metrics/input-b-stream-id-1': {
            receivers: ['httpcheck/input-b-stream-id-1'],
            processors: ['transform/input-b-stream-id-1', 'transform/input-b-stream-id-1-routing'],
            exporters: ['forward/default'],
          },
          'metrics/override-output-id': {
            receivers: ['forward/override-output-id'],
            exporters: ['elasticsearch/override-output-id'],
          },
          'metrics/default': {
            receivers: ['forward/default'],
            exporters: ['elasticsearch/default'],
          },
        },
      },
    });
  });

  it('should throw when packageOutputs contains an unsupported output type', () => {
    const logstashOutput: Output = {
      id: 'logstash-output-id',
      name: 'logstash',
      type: 'logstash' as any,
      is_default: false,
      is_default_monitoring: false,
      hosts: ['localhost:5044'],
    };
    const inputA: FullAgentPolicyInput = {
      ...otelInput1,
      id: 'input-a',
      name: 'input-a',
      package_policy_id: 'pkg-policy-a',
    };
    expect(() =>
      generateOtelcolConfig({
        inputs: [inputA],
        dataOutput: defaultOutput,
        packageOutputs: new Map([['pkg-policy-a', logstashOutput]]),
      })
    ).toThrow();
  });

  it('should route APM aggregated pipeline to the default output even when the input has an override', () => {
    const overrideOutput: Output = {
      id: 'override-output-id',
      name: 'override-output',
      type: outputType.Elasticsearch,
      is_default: false,
      is_default_monitoring: false,
      hosts: ['http://override-es:9200'],
    };
    const apmInput: FullAgentPolicyInput = {
      ...otelTracesInputWithAPM,
      id: 'apm-input',
      name: 'apm-input',
      package_policy_id: 'pkg-policy-a',
      data_stream: { namespace: 'apmtest' },
    };
    expect(
      generateOtelcolConfig({
        inputs: [apmInput],
        dataOutput: defaultOutput,
        packageOutputs: new Map([['pkg-policy-a', overrideOutput]]),
      })
    ).toEqual({
      receivers: {
        'zipkin/apm-input-stream-id-1': { endpoint: 'localhost:9411' },
      },
      processors: {
        'transform/apm-input-stream-id-1-routing': {
          trace_statements: [
            {
              context: 'span',
              statements: [
                'set(attributes["data_stream.type"], "traces")',
                'set(attributes["data_stream.dataset"], "zipkinreceiver")',
                'set(attributes["data_stream.namespace"], "apmtest")',
              ],
            },
            {
              context: 'spanevent',
              statements: [
                'set(attributes["data_stream.type"], "logs")',
                'set(attributes["data_stream.dataset"], "zipkinreceiver")',
                'set(attributes["data_stream.namespace"], "apmtest")',
              ],
            },
          ],
        },
        'elasticapm/apmtest': {},
        'transform/apmtest-apm-namespace-routing': {
          metric_statements: [
            {
              context: 'datapoint',
              statements: ['set(attributes["data_stream.namespace"], "apmtest")'],
            },
          ],
        },
      },
      connectors: {
        'elasticapm/apmtest': {},
        'forward/override-output-id': {},
        'forward/default': {},
      },
      exporters: {
        'elasticsearch/override-output-id': {
          endpoints: ['http://override-es:9200'],
        },
        'elasticsearch/default': {
          endpoints: ['http://localhost:9200'],
        },
      },
      service: {
        pipelines: {
          'traces/apm-input-stream-id-1': {
            receivers: ['zipkin/apm-input-stream-id-1'],
            exporters: ['elasticapm/apmtest', 'forward/override-output-id'],
            processors: ['elasticapm/apmtest', 'transform/apm-input-stream-id-1-routing'],
          },
          'metrics/apmtest-aggregated-apm-metrics': {
            receivers: ['elasticapm/apmtest'],
            processors: ['transform/apmtest-apm-namespace-routing'],
            exporters: ['forward/default'],
          },
          'traces/override-output-id': {
            receivers: ['forward/override-output-id'],
            exporters: ['elasticsearch/override-output-id'],
          },
          'metrics/default': {
            receivers: ['forward/default'],
            exporters: ['elasticsearch/default'],
          },
        },
      },
    });
  });
});
