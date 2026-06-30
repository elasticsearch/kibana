/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  mockBatchLogRecordProcessor,
  mockDetectResources,
  mockEmit,
  mockGetConfiguration,
  mockLoggerProvider,
  mockMergeResource,
  mockOTLPLogExporter,
  mockResourceFromAttributes,
  mockShutdown,
} from './otel_appender.test.mocks';

import { set } from '@kbn/safer-lodash-set';
import { trace } from '@opentelemetry/api';
import { LogLevel } from '@kbn/logging';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { OtelAppender } from './otel_appender';
import { Layouts } from '../../layouts/layouts';
import { JsonLayout } from '../../layouts/json_layout';

const validConfig = {
  type: 'otel' as const,
  protocol: 'http' as const,
  url: 'http://collector:4318/v1/logs',
  headers: { Authorization: 'Bearer token' },
};

const makeRecord = (overrides = {}) => ({
  context: 'test.context',
  level: LogLevel.Info,
  message: 'test message',
  timestamp: new Date('2024-01-01T00:00:00Z'),
  pid: 1234,
  ...overrides,
});

describe('OtelAppender', () => {
  let mockLayoutFormat: jest.SpyInstance;
  let mockLayoutsCreate: jest.SpyInstance;

  beforeEach(() => {
    mockEmit.mockReset();
    mockShutdown.mockReset();
    mockLoggerProvider.mockClear();
    mockBatchLogRecordProcessor.mockClear();
    mockOTLPLogExporter.mockClear();
    mockResourceFromAttributes.mockClear();
    mockDetectResources.mockClear();
    mockMergeResource.mockClear();
    mockGetConfiguration.mockClear();
    const originalLayoutsCreate = Layouts.create;
    mockLayoutsCreate = jest.spyOn(Layouts, 'create').mockImplementation((opts) => {
      const layout = originalLayoutsCreate(opts);
      mockLayoutFormat = jest.spyOn(layout, 'format');
      return layout;
    });
    jest.mocked(trace.setSpanContext).mockClear();
  });

  afterEach(() => {
    mockLayoutsCreate.mockRestore();
  });

  describe('configSchema', () => {
    it('validates a minimal config (url only required)', () => {
      const result = OtelAppender.configSchema.validate({
        type: 'otel',
        url: 'http://collector:4318/v1/logs',
      });
      expect(result.url).toBe('http://collector:4318/v1/logs');
      expect(result.headers).toEqual({});
      expect(result.layout).toBeUndefined();
      expect(result.attributes).toBeUndefined();
    });

    it('accepts a json layout config', () => {
      const result = OtelAppender.configSchema.validate({
        ...validConfig,
        layout: { type: 'json' },
      });
      expect(result.layout).toEqual({ type: 'json' });
    });

    it('accepts a pattern layout config', () => {
      const result = OtelAppender.configSchema.validate({
        ...validConfig,
        layout: { type: 'pattern', pattern: '[%p] %m' },
      });
      expect(result.layout).toEqual({ type: 'pattern', pattern: '[%p] %m' });
    });

    it('accepts optional user-provided attributes to override defaults', () => {
      const result = OtelAppender.configSchema.validate({
        ...validConfig,
        attributes: { 'service.name': 'my-kibana' },
      });
      expect(result.attributes).toEqual({ 'service.name': 'my-kibana' });
    });

    it('accepts fieldRenames with string target', () => {
      const result = OtelAppender.configSchema.validate({
        ...validConfig,
        fieldRenames: { 'kibana.space_id': 'kibana.space.id' },
      });
      expect(result.fieldRenames).toEqual({ 'kibana.space_id': 'kibana.space.id' });
    });

    it('accepts fieldRenames with array target (fan-out)', () => {
      const result = OtelAppender.configSchema.validate({
        ...validConfig,
        fieldRenames: { 'client.ip': ['source.address', 'source.ip'] },
      });
      expect(result.fieldRenames).toEqual({ 'client.ip': ['source.address', 'source.ip'] });
    });

    it('is optional and absent by default', () => {
      const result = OtelAppender.configSchema.validate({
        type: 'otel',
        url: 'http://collector:4318/v1/logs',
      });
      expect(result.fieldRenames).toBeUndefined();
    });

    it('rejects config without url', () => {
      expect(() => OtelAppender.configSchema.validate({ type: 'otel' })).toThrow();
    });

    it('rejects config with wrong type', () => {
      expect(() =>
        OtelAppender.configSchema.validate({ ...validConfig, type: 'console' })
      ).toThrow();
    });

    it('rejects ssl.certificate without ssl.key', () => {
      expect(() =>
        OtelAppender.configSchema.validate({
          ...validConfig,
          ssl: { certificate: '/path/to/cert.pem' },
        })
      ).toThrow(/ssl\.key/);
    });

    it('rejects ssl.key without ssl.certificate', () => {
      expect(() =>
        OtelAppender.configSchema.validate({
          ...validConfig,
          ssl: { key: '/path/to/key.pem' },
        })
      ).toThrow(/ssl\.certificate/);
    });

    it('rejects ssl.keyPassphrase without ssl.key', () => {
      expect(() =>
        OtelAppender.configSchema.validate({
          ...validConfig,
          ssl: { keyPassphrase: 'secret' },
        })
      ).toThrow(/ssl\.key/);
    });

    it('accepts optional ssl.tls settings', () => {
      const result = OtelAppender.configSchema.validate({
        ...validConfig,
        ssl: {
          verificationMode: 'full',
          certificateAuthorities: '/etc/ssl/custom-ca.pem',
          certificate: '/etc/ssl/client.crt',
          key: '/etc/ssl/client.key',
        },
      });
      expect(result.ssl?.verificationMode).toBe('full');
      expect(result.ssl?.certificateAuthorities).toBe('/etc/ssl/custom-ca.pem');
    });
  });

  describe('OtelAppender constructor', () => {
    it('creates OTLPLogExporter with url and headers from config', () => {
      new OtelAppender(validConfig);

      expect(mockOTLPLogExporter).toHaveBeenCalledWith({
        url: validConfig.url,
        headers: validConfig.headers,
      });
    });

    it('passes httpAgentOptions when ssl is set (HTTP exporter)', () => {
      new OtelAppender({
        ...validConfig,
        ssl: { verificationMode: 'none' },
      });

      expect(mockOTLPLogExporter).toHaveBeenCalledWith({
        url: validConfig.url,
        headers: validConfig.headers,
        httpAgentOptions: expect.objectContaining({ rejectUnauthorized: false }),
      });
    });

    it('passes httpAgentOptions for proto protocol when ssl is set', () => {
      new OtelAppender({
        ...validConfig,
        protocol: 'proto',
        ssl: { verificationMode: 'full' },
      });

      expect(mockOTLPLogExporter).toHaveBeenCalledWith({
        url: validConfig.url,
        headers: validConfig.headers,
        httpAgentOptions: expect.objectContaining({ rejectUnauthorized: true }),
      });
    });

    it('passes grpc channel credentials when ssl is set', () => {
      new OtelAppender({
        type: 'otel',
        protocol: 'grpc',
        url: 'https://collector:4317',
        ssl: { verificationMode: 'none' },
      });

      expect(mockOTLPLogExporter).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://collector:4317',
          metadata: expect.anything(),
          credentials: expect.anything(),
        })
      );
    });

    it('defaults to empty headers when none are provided', () => {
      new OtelAppender({ type: 'otel', url: validConfig.url, protocol: 'http' });

      expect(mockOTLPLogExporter).toHaveBeenCalledWith({
        url: validConfig.url,
        headers: {},
      });
    });

    it('creates a pattern layout with the OTel-specific default pattern when no layout is configured', () => {
      new OtelAppender(validConfig);

      expect(mockLayoutsCreate).toHaveBeenCalledWith({
        type: 'pattern',
        pattern: '%message %error',
      });
    });

    it('uses the OTel-specific "%message %error" pattern when pattern type is requested without a custom string', () => {
      new OtelAppender({ ...validConfig, layout: { type: 'pattern' } });

      expect(mockLayoutsCreate).toHaveBeenCalledWith({
        type: 'pattern',
        pattern: '%message %error',
      });
    });

    it('preserves an explicit custom pattern string provided by the user', () => {
      new OtelAppender({ ...validConfig, layout: { type: 'pattern', pattern: '%m' } });

      expect(mockLayoutsCreate).toHaveBeenCalledWith({ type: 'pattern', pattern: '%m' });
    });

    it('creates a JSON layout when explicitly configured', () => {
      new OtelAppender({ ...validConfig, layout: { type: 'json' } });

      expect(mockLayoutsCreate).toHaveBeenCalledWith({ type: 'json' });
    });

    it('always includes telemetry.sdk.language: nodejs in derived attributes', () => {
      mockGetConfiguration.mockReturnValue(undefined);

      new OtelAppender(validConfig);

      expect(mockResourceFromAttributes).toHaveBeenCalledWith(
        expect.objectContaining({ 'telemetry.sdk.language': 'nodejs' })
      );
    });

    it('derives service.name, service.version and deployment.environment from the APM config singleton', () => {
      mockGetConfiguration.mockReturnValue({
        serviceName: 'kibana',
        serviceVersion: '9.4.0',
        environment: 'production',
      });

      new OtelAppender(validConfig);

      expect(mockGetConfiguration).toHaveBeenCalledWith('kibana');
      expect(mockResourceFromAttributes).toHaveBeenCalledWith({
        'telemetry.sdk.language': 'nodejs',
        'service.name': 'kibana',
        'service.version': '9.4.0',
        'deployment.environment.name': 'production',
      });
    });

    it('derives service.instance.id from kibana_uuid in APM global labels', () => {
      mockGetConfiguration.mockReturnValue({
        serviceName: 'kibana',
        globalLabels: { kibana_uuid: 'test-uuid-123' },
      });

      new OtelAppender(validConfig);

      expect(mockResourceFromAttributes).toHaveBeenCalledWith(
        expect.objectContaining({ 'service.instance.id': 'test-uuid-123' })
      );
    });

    it('omits service.instance.id when kibana_uuid is absent from global labels', () => {
      mockGetConfiguration.mockReturnValue({ serviceName: 'kibana', globalLabels: {} });

      new OtelAppender(validConfig);

      expect(mockResourceFromAttributes).toHaveBeenCalledWith(
        expect.not.objectContaining({ 'service.instance.id': expect.anything() })
      );
    });

    it('omits APM-derived service attributes whose config value is falsy', () => {
      mockGetConfiguration.mockReturnValue({ serviceName: 'kibana' }); // no version, environment or uuid

      new OtelAppender(validConfig);

      expect(mockResourceFromAttributes).toHaveBeenCalledWith({
        'telemetry.sdk.language': 'nodejs',
        'service.name': 'kibana',
      });
    });

    it('only emits telemetry.sdk.language when the APM config singleton is not initialised', () => {
      mockGetConfiguration.mockReturnValue(undefined);

      new OtelAppender(validConfig);

      expect(mockResourceFromAttributes).toHaveBeenCalledWith({
        'telemetry.sdk.language': 'nodejs',
      });
    });

    it('user-provided attributes override the APM-derived ones', () => {
      mockGetConfiguration.mockReturnValue({ serviceName: 'kibana', environment: 'development' });

      new OtelAppender({
        ...validConfig,
        attributes: { 'service.name': 'custom-kibana', 'deployment.environment': 'staging' },
      });

      // The user override is passed as the last merge layer.
      expect(mockResourceFromAttributes).toHaveBeenCalledWith({
        'service.name': 'custom-kibana',
        'deployment.environment': 'staging',
      });
    });

    it('auto-detects host/process/OS/env attributes via resource detectors', () => {
      new OtelAppender(validConfig);

      expect(mockDetectResources).toHaveBeenCalledWith({
        detectors: expect.arrayContaining([
          'envDetector',
          'hostDetector',
          'osDetector',
          'processDetector',
        ]),
      });
    });
  });

  describe('append() — severity mapping', () => {
    it.each([
      {
        name: 'trace',
        level: LogLevel.Trace,
        severityNumber: SeverityNumber.TRACE,
        severityText: 'TRACE',
      },
      {
        name: 'debug',
        level: LogLevel.Debug,
        severityNumber: SeverityNumber.DEBUG,
        severityText: 'DEBUG',
      },
      {
        name: 'info',
        level: LogLevel.Info,
        severityNumber: SeverityNumber.INFO,
        severityText: 'INFO',
      },
      {
        name: 'warn',
        level: LogLevel.Warn,
        severityNumber: SeverityNumber.WARN,
        severityText: 'WARN',
      },
      {
        name: 'error',
        level: LogLevel.Error,
        severityNumber: SeverityNumber.ERROR,
        severityText: 'ERROR',
      },
      {
        name: 'fatal',
        level: LogLevel.Fatal,
        severityNumber: SeverityNumber.FATAL,
        severityText: 'FATAL',
      },
    ])(
      'maps log level $name to severityNumber $severityNumber and severityText $severityText',
      ({ level, severityNumber, severityText }) => {
        const appender = new OtelAppender(validConfig);
        appender.append(makeRecord({ level }));

        expect(mockEmit).toHaveBeenCalledWith(
          expect.objectContaining({ severityNumber, severityText })
        );
      }
    );

    it.each([
      ['off', LogLevel.Off],
      ['all', LogLevel.All],
    ])('emits records with filter-only level %s as severityNumber UNSPECIFIED', (_name, level) => {
      const appender = new OtelAppender(validConfig);
      appender.append(makeRecord({ level }));

      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({ severityNumber: SeverityNumber.UNSPECIFIED })
      );
    });
  });

  describe('append() — body', () => {
    it('with pattern layout (default): passes the formatted string as body.text', () => {
      const appender = new OtelAppender(validConfig);
      mockLayoutFormat.mockReturnValue('hello world');
      const record = makeRecord({ message: 'hello world' });
      appender.append(record);

      expect(mockLayoutFormat).toHaveBeenCalledWith(record);
      // Formatted string is indexed as body.text, aliased to the ECS `message` field.
      expect(mockEmit).toHaveBeenCalledWith(expect.objectContaining({ body: 'hello world' }));
    });

    it('with explicit pattern layout: passes the formatted string as body.text', () => {
      const appender = new OtelAppender({ ...validConfig, layout: { type: 'pattern' } });
      mockLayoutFormat.mockReturnValue('formatted: hello world');
      const record = makeRecord({ message: 'hello world' });
      appender.append(record);

      expect(mockLayoutFormat).toHaveBeenCalledWith(record);
      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({ body: 'formatted: hello world' })
      );
    });

    it('with JSON layout: passes a sanitised LogRecord as structured body - strips level and null fields', () => {
      const appender = new OtelAppender({ ...validConfig, layout: { type: 'json' } });
      // Simulate runtime null values that can appear for missing trace identifiers.
      const record = makeRecord({ message: 'hello world', spanId: null, traceId: null });
      appender.append(record as unknown as ReturnType<typeof makeRecord>);

      const { body } = mockEmit.mock.calls[0][0];
      // null fields are stripped to avoid empty entries in Elasticsearch
      expect(body).not.toHaveProperty('span');
      expect(body).not.toHaveProperty('trace');
      expect(body).not.toHaveProperty('transaction');
      expect(body).not.toHaveProperty('error');
      // non-null fields are preserved
      const {
        // Undefined fields are stripped
        span,
        trace: _trace,
        transaction: _transaction,
        error: _error,
        ...ecsRecord
      } = JsonLayout.ecsRecord(record);
      expect(body).toMatchObject(set(ecsRecord, 'process.uptime', expect.any(Number)));
      // The layout's format() method is NOT invoked for JSON layout
      expect(mockLayoutFormat).not.toHaveBeenCalled();
    });
  });

  describe('append() — trace context', () => {
    it('passes trace context via OTel context API when traceId and spanId are present', () => {
      const appender = new OtelAppender(validConfig);
      appender.append(makeRecord({ traceId: 'abc123', spanId: 'def456' }));

      expect(trace.setSpanContext).toHaveBeenCalledWith('root-context', {
        traceId: 'abc123',
        spanId: 'def456',
        traceFlags: 0, // TraceFlags.NONE
      });
      const emittedContext = mockEmit.mock.calls[0][0].context;
      expect(emittedContext).toBeDefined();
    });

    it('omits context when the record has no trace identifiers', () => {
      const appender = new OtelAppender(validConfig);
      appender.append(makeRecord());

      expect(trace.setSpanContext).not.toHaveBeenCalled();
      expect(mockEmit.mock.calls[0][0].context).toBeUndefined();
    });

    it('does not include trace.id or span.id in log record attributes', () => {
      const appender = new OtelAppender(validConfig);
      appender.append(makeRecord({ traceId: 'abc123', spanId: 'def456' }));

      const { attributes } = mockEmit.mock.calls[0][0];
      expect(attributes).not.toHaveProperty('trace.id');
      expect(attributes).not.toHaveProperty('span.id');
    });
  });

  describe('append() — attributes', () => {
    it('emits the correct timestamp and log.logger attribute', () => {
      const appender = new OtelAppender(validConfig);
      const timestamp = new Date('2024-06-15T12:00:00Z');
      appender.append(makeRecord({ timestamp, context: 'my.plugin' }));

      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp,
          attributes: expect.objectContaining({ 'log.logger': 'my.plugin' }),
        })
      );
    });

    it('does not include process.pid in log record attributes (it lives in the resource)', () => {
      const appender = new OtelAppender(validConfig);
      appender.append(makeRecord({ pid: 9999 }));

      const { attributes } = mockEmit.mock.calls[0][0];
      expect(attributes).not.toHaveProperty('process.pid');
    });

    it('maps error to OTel exception semantic convention attributes', () => {
      const appender = new OtelAppender(validConfig);
      const error = new Error('something went wrong');
      appender.append(makeRecord({ error }));

      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'exception.type': 'Error',
            'exception.message': 'something went wrong',
            'exception.stacktrace': error.stack,
          }),
        })
      );
    });

    it('omits exception attributes when no error is present', () => {
      const appender = new OtelAppender(validConfig);
      appender.append(makeRecord());

      const { attributes } = mockEmit.mock.calls[0][0];
      expect(attributes).not.toHaveProperty('exception.type');
      expect(attributes).not.toHaveProperty('exception.message');
      expect(attributes).not.toHaveProperty('exception.stacktrace');
    });

    it('includes transactionId as transaction.id attribute', () => {
      const appender = new OtelAppender(validConfig);
      appender.append(makeRecord({ transactionId: 'txn-123' }));

      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({ 'transaction.id': 'txn-123' }),
        })
      );
    });

    describe('log.meta', () => {
      it('with pattern layout (default): flattens meta fields into attributes', () => {
        const appender = new OtelAppender(validConfig);
        const meta = { http: { method: 'GET' }, tags: ['api'] };
        appender.append(makeRecord({ meta }));

        expect(mockEmit).toHaveBeenCalledWith(
          expect.objectContaining({
            attributes: expect.objectContaining({
              'http.method': 'GET',
              tags: ['api'],
            }),
          })
        );
      });

      it('with pattern layout: omits log.meta when meta is not present', () => {
        const appender = new OtelAppender(validConfig);
        appender.append(makeRecord());

        const { attributes } = mockEmit.mock.calls[0][0];
        expect(attributes).not.toHaveProperty('log.meta');
      });

      it('with JSON layout: does not include log.meta in attributes (meta is part of the structured body)', () => {
        const appender = new OtelAppender({ ...validConfig, layout: { type: 'json' } });
        const meta = { http: { method: 'GET' }, tags: ['api'] };
        appender.append(makeRecord({ meta }));

        const { attributes } = mockEmit.mock.calls[0][0];
        expect(attributes).not.toHaveProperty('log.meta');
      });
    });

    describe('fieldRenames', () => {
      // toHaveProperty('a.b') traverses nested objects; use array form (['a.b']) for flat dotted keys.

      it('renames a meta attribute to the specified target key', () => {
        const appender = new OtelAppender({
          ...validConfig,
          fieldRenames: { 'kibana.space_id': 'kibana.space.id' },
        });
        appender.append(makeRecord({ meta: { kibana: { space_id: 'default' } } }));

        const { attributes } = mockEmit.mock.calls[0][0];
        expect(attributes).toHaveProperty(['kibana.space.id'], 'default');
        expect(attributes).not.toHaveProperty(['kibana.space_id']);
      });

      it('fans out a single source key to multiple target keys and removes the original', () => {
        const appender = new OtelAppender({
          ...validConfig,
          fieldRenames: { 'client.ip': ['source.address', 'source.ip'] },
        });
        appender.append(makeRecord({ meta: { client: { ip: '1.2.3.4' } } }));

        const { attributes } = mockEmit.mock.calls[0][0];
        expect(attributes).toHaveProperty(['source.address'], '1.2.3.4');
        expect(attributes).toHaveProperty(['source.ip'], '1.2.3.4');
        expect(attributes).not.toHaveProperty(['client.ip']);
      });

      it('is a no-op when the source key is absent from the record', () => {
        const appender = new OtelAppender({
          ...validConfig,
          fieldRenames: { 'kibana.space_id': 'kibana.space.id' },
        });
        appender.append(makeRecord({ meta: { other: 'value' } }));

        const { attributes } = mockEmit.mock.calls[0][0];
        expect(attributes).not.toHaveProperty(['kibana.space.id']);
        expect(attributes).not.toHaveProperty(['kibana.space_id']);
      });

      it('leaves attributes unchanged when fieldRenames is not configured', () => {
        const appender = new OtelAppender(validConfig);
        appender.append(makeRecord({ meta: { kibana: { space_id: 'default' } } }));

        const { attributes } = mockEmit.mock.calls[0][0];
        expect(attributes).toHaveProperty(['kibana.space_id'], 'default');
        expect(attributes).not.toHaveProperty(['kibana.space.id']);
      });

      it('applies all audit field renames for a representative audit event meta payload', () => {
        const appender = new OtelAppender({
          ...validConfig,
          fieldRenames: {
            'kibana.space_id': 'kibana.space.id',
            'kibana.session_id': 'kibana.session.id',
            'kibana.lookup_realm': 'kibana.lookup.realm',
            'kibana.authentication_type': 'authentication.type',
            'client.ip': ['source.address', 'source.ip'],
            'trace.id': 'request.id',
          },
        });
        appender.append(
          makeRecord({
            meta: {
              kibana: {
                space_id: 'default',
                session_id: 'abc123',
                lookup_realm: 'native',
                authentication_type: 'basic',
              },
              client: { ip: '1.2.3.4' },
              trace: { id: 'req-xyz' },
            },
          })
        );

        const { attributes } = mockEmit.mock.calls[0][0];
        // Renamed keys present with correct values
        expect(attributes).toHaveProperty(['kibana.space.id'], 'default');
        expect(attributes).toHaveProperty(['kibana.session.id'], 'abc123');
        expect(attributes).toHaveProperty(['kibana.lookup.realm'], 'native');
        expect(attributes).toHaveProperty(['authentication.type'], 'basic');
        expect(attributes).toHaveProperty(['source.address'], '1.2.3.4');
        expect(attributes).toHaveProperty(['source.ip'], '1.2.3.4');
        expect(attributes).toHaveProperty(['request.id'], 'req-xyz');
        // Original keys removed
        expect(attributes).not.toHaveProperty(['kibana.space_id']);
        expect(attributes).not.toHaveProperty(['kibana.session_id']);
        expect(attributes).not.toHaveProperty(['kibana.lookup_realm']);
        expect(attributes).not.toHaveProperty(['kibana.authentication_type']);
        expect(attributes).not.toHaveProperty(['client.ip']);
        expect(attributes).not.toHaveProperty(['trace.id']);
      });
    });
  });

  describe('dispose()', () => {
    it('shuts down the logger provider', async () => {
      mockShutdown.mockResolvedValue(undefined);
      const appender = new OtelAppender(validConfig);
      await appender.dispose();

      expect(mockShutdown).toHaveBeenCalledTimes(1);
    });

    it('resolves even if shutdown hangs (timeout guard)', async () => {
      jest.useFakeTimers();
      mockShutdown.mockReturnValue(new Promise(() => {})); // never resolves
      const appender = new OtelAppender(validConfig);

      const disposePromise = appender.dispose();
      jest.runAllTimers();
      await expect(disposePromise).resolves.toBeUndefined();

      jest.useRealTimers();
    });

    it('does not produce an unhandled rejection when shutdown rejects after the timeout', async () => {
      jest.useFakeTimers();
      let rejectShutdown!: (err: Error) => void;
      mockShutdown.mockReturnValue(
        new Promise<void>((_, rej) => {
          rejectShutdown = rej;
        })
      );
      const appender = new OtelAppender(validConfig);

      const disposePromise = appender.dispose();
      jest.runAllTimers();
      await expect(disposePromise).resolves.toBeUndefined();

      // Rejecting the shutdown promise after dispose() has already returned should not
      // surface as an unhandled rejection because .catch(() => {}) is attached.
      expect(() => rejectShutdown(new Error('late shutdown failure'))).not.toThrow();

      jest.useRealTimers();
    });
  });
});
