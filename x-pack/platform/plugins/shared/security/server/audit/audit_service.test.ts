/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Socket } from 'net';
import { lastValueFrom, Observable, of } from 'rxjs';

import { coreMock } from '@kbn/core/server/mocks';
import type { FakeRawRequest } from '@kbn/core-http-server';
import { httpServerMock, httpServiceMock } from '@kbn/core-http-server-mocks';
import { kibanaRequestFactory } from '@kbn/core-http-server-utils';
import type { AppenderConfigType, OtelAppenderConfig } from '@kbn/core-logging-server';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { asSpaceId } from '@kbn/core-spaces-common';
import type { AuditEvent } from '@kbn/security-plugin-types-server';

import {
  AUDIT_OTEL_FIELD_RENAMES,
  AuditService,
  createLoggingConfig,
  filterEvent,
  getForwardedFor,
  RECORD_USAGE_INTERVAL,
} from './audit_service';
import { licenseMock } from '../../common/licensing/index.mock';
import type { ConfigType } from '../config';
import { ConfigSchema, createConfig } from '../config';

jest.useFakeTimers({ legacyFakeTimers: true });

const logger = loggingSystemMock.createLogger();
const license = licenseMock.create();

const createAuditConfig = (settings: Partial<ConfigType['audit']>) => {
  return createConfig(ConfigSchema.validate({ audit: settings }), logger, { isTLSEnabled: false })
    .audit;
};

const config = createAuditConfig({ enabled: true });
const { logging } = coreMock.createSetup();
const http = httpServiceMock.createSetupContract();
const getCurrentUser = jest
  .fn()
  .mockReturnValue({ username: 'jdoe', roles: ['admin'], profile_uid: 'uid' });
const getSpaceId = jest.fn().mockReturnValue('default');
const getSID = jest.fn().mockResolvedValue('SESSION_ID');
const recordAuditLoggingUsage = jest.fn();

beforeEach(() => {
  logger.info.mockClear();
  logging.configure.mockClear();
  logger.isLevelEnabled.mockClear().mockReturnValue(true);
  recordAuditLoggingUsage.mockClear();
  http.registerOnPostAuth.mockClear();
});

describe('#setup', () => {
  it('returns the expected contract', () => {
    const audit = new AuditService(logger);
    expect(
      audit.setup({
        license,
        config,
        logging,
        http,
        getCurrentUser,
        getSpaceId,
        getSID,
        recordAuditLoggingUsage,
      })
    ).toMatchInlineSnapshot(`
      Object {
        "asScoped": [Function],
        "withoutRequest": Object {
          "enabled": true,
          "includeSavedObjectNames": true,
          "log": [Function],
        },
      }
    `);
    audit.stop();
  });

  it('configures logging correctly when using ecs logger', async () => {
    const audit = new AuditService(logger);
    audit.setup({
      license,
      config: {
        enabled: true,
        include_saved_object_names: false,
        appender: {
          type: 'console',
          layout: {
            type: 'pattern',
          },
        },
      },
      logging,
      http,
      getCurrentUser,
      getSpaceId,
      getSID,
      recordAuditLoggingUsage,
    });
    expect(logging.configure).toHaveBeenCalledWith(expect.any(Observable));
    audit.stop();
  });

  it('records feature usage correctly when using ecs logger', async () => {
    const audit = new AuditService(logger);
    audit.setup({
      license: licenseMock.create({
        allowAuditLogging: true,
      }),
      config: {
        enabled: true,
        include_saved_object_names: false,
        appender: {
          type: 'console',
          layout: {
            type: 'pattern',
          },
        },
      },
      logging,
      http,
      getCurrentUser,
      getSpaceId,
      getSID,
      recordAuditLoggingUsage,
    });
    expect(recordAuditLoggingUsage).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(RECORD_USAGE_INTERVAL);
    expect(recordAuditLoggingUsage).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(RECORD_USAGE_INTERVAL);
    expect(recordAuditLoggingUsage).toHaveBeenCalledTimes(3);
    audit.stop();
  });

  it('does not record feature usage when disabled', async () => {
    const audit = new AuditService(logger);
    audit.setup({
      license,
      config: {
        enabled: false,
        include_saved_object_names: false,
        appender: undefined,
      },
      logging,
      http,
      getCurrentUser,
      getSpaceId,
      getSID,
      recordAuditLoggingUsage,
    });
    expect(recordAuditLoggingUsage).not.toHaveBeenCalled();
    jest.advanceTimersByTime(RECORD_USAGE_INTERVAL);
    expect(recordAuditLoggingUsage).not.toHaveBeenCalled();
    jest.advanceTimersByTime(RECORD_USAGE_INTERVAL);
    expect(recordAuditLoggingUsage).not.toHaveBeenCalled();
    audit.stop();
  });

  it('registers post auth hook', () => {
    const audit = new AuditService(logger);
    audit.setup({
      license,
      config,
      logging,
      http,
      getCurrentUser,
      getSpaceId,
      getSID,
      recordAuditLoggingUsage,
    });
    expect(http.registerOnPostAuth).toHaveBeenCalledWith(expect.any(Function));
    audit.stop();
  });
});

describe('#asScoped', () => {
  it('logs event enriched with meta data from request', async () => {
    const audit = new AuditService(logger);
    const auditSetup = audit.setup({
      license,
      config,
      logging,
      http,
      getCurrentUser,
      getSpaceId,
      getSID,
      recordAuditLoggingUsage,
    });
    const request = httpServerMock.createKibanaRequest({
      socket: { remoteAddress: '3.3.3.3' } as Socket,
      headers: {
        'x-forwarded-for': '1.1.1.1, 2.2.2.2',
      },
      kibanaRequestState: {
        requestId: 'REQUEST_ID',
        requestUuid: 'REQUEST_UUID',
        startTime: Date.now(),
      },
    });

    await auditSetup.asScoped(request).log({
      message: 'MESSAGE',
      event: { action: 'ACTION' },
      http: { request: { method: 'GET' } },
    });
    expect(logger.info).toHaveBeenLastCalledWith('MESSAGE', {
      event: { action: 'ACTION' },
      kibana: { space_id: 'default', session_id: 'SESSION_ID' },
      trace: { id: 'REQUEST_ID' },
      client: { ip: '3.3.3.3' },
      http: {
        request: { method: 'GET', headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' } },
      },
      user: { id: 'uid', name: 'jdoe', roles: ['admin'] },
    });
    audit.stop();
  });

  it('logs event enriched with meta data from fake request', async () => {
    const audit = new AuditService(logger);
    const auditSetup = audit.setup({
      license,
      config,
      logging,
      http,
      getCurrentUser,
      getSpaceId: () => undefined,
      getSID: () => Promise.resolve(undefined),
      recordAuditLoggingUsage,
    });

    const fakeRawRequest: FakeRawRequest = {
      headers: {},
    };
    const request = kibanaRequestFactory(fakeRawRequest);

    await auditSetup.asScoped(request).log({
      message: 'MESSAGE',
      event: { action: 'ACTION' },
    });
    expect(logger.info).toHaveBeenLastCalledWith('MESSAGE', {
      client: {
        ip: undefined,
      },
      event: {
        action: 'ACTION',
      },
      http: undefined,
      kibana: {
        session_id: undefined,
        space_id: undefined,
      },
      trace: {
        id: expect.any(String),
      },
      user: {
        id: 'uid',
        name: 'jdoe',
        roles: ['admin'],
      },
    });
    audit.stop();
  });

  it('logs space_id from a fake request that carries a spaceId', async () => {
    const audit = new AuditService(logger);
    const auditSetup = audit.setup({
      license,
      config,
      logging,
      http,
      getCurrentUser,
      // Mirror real wiring (spacesService.getSpaceId) by sourcing the space id
      // directly from the request.
      getSpaceId: (req) => req.spaceId,
      getSID: () => Promise.resolve(undefined),
      recordAuditLoggingUsage,
    });

    const fakeRawRequest: FakeRawRequest = {
      headers: {},
      spaceId: asSpaceId('my-space'),
    };
    const request = kibanaRequestFactory(fakeRawRequest);

    await auditSetup.asScoped(request).log({
      message: 'MESSAGE',
      event: { action: 'ACTION' },
    });
    expect(logger.info).toHaveBeenLastCalledWith(
      'MESSAGE',
      expect.objectContaining({
        kibana: expect.objectContaining({ space_id: 'my-space' }),
      })
    );
    audit.stop();
  });

  it('does not log to audit logger if event matches ignore filter', async () => {
    const audit = new AuditService(logger);
    const auditSetup = audit.setup({
      license,
      config: {
        enabled: true,
        include_saved_object_names: false,
        appender: {
          type: 'console',
          layout: {
            type: 'json',
          },
        },
        ignore_filters: [{ actions: ['ACTION'] }],
      },
      logging,
      http,
      getCurrentUser,
      getSpaceId,
      getSID,
      recordAuditLoggingUsage,
    });
    const request = httpServerMock.createKibanaRequest({
      kibanaRequestState: {
        requestId: 'REQUEST_ID',
        requestUuid: 'REQUEST_UUID',
        startTime: Date.now(),
      },
    });

    await auditSetup.asScoped(request).log({ message: 'MESSAGE', event: { action: 'ACTION' } });
    expect(logger.info).not.toHaveBeenCalled();
    audit.stop();
  });

  it('does not log to audit logger if no event was generated', async () => {
    const audit = new AuditService(logger);
    const auditSetup = audit.setup({
      license,
      config: {
        enabled: true,
        include_saved_object_names: false,
        appender: {
          type: 'console',
          layout: {
            type: 'json',
          },
        },
        ignore_filters: [{ actions: ['ACTION'] }],
      },
      logging,
      http,
      getCurrentUser,
      getSpaceId,
      getSID,
      recordAuditLoggingUsage,
    });
    const request = httpServerMock.createKibanaRequest({
      kibanaRequestState: {
        requestId: 'REQUEST_ID',
        requestUuid: 'REQUEST_UUID',
        startTime: Date.now(),
      },
    });

    await auditSetup.asScoped(request).log(undefined);
    expect(logger.info).not.toHaveBeenCalled();
    audit.stop();
  });

  it('does not log to audit logger if info logging level is disabled', async () => {
    logger.isLevelEnabled.mockReturnValue(false);

    const audit = new AuditService(logger);
    const auditSetup = audit.setup({
      license,
      config,
      logging,
      http,
      getCurrentUser,
      getSpaceId,
      getSID,
      recordAuditLoggingUsage,
    });
    const request = httpServerMock.createKibanaRequest({
      socket: { remoteAddress: '3.3.3.3' } as Socket,
      headers: {
        'x-forwarded-for': '1.1.1.1, 2.2.2.2',
      },
      kibanaRequestState: {
        requestId: 'REQUEST_ID',
        requestUuid: 'REQUEST_UUID',
        startTime: Date.now(),
      },
    });

    await auditSetup.asScoped(request).log({
      message: 'MESSAGE',
      event: { action: 'ACTION' },
      http: { request: { method: 'GET' } },
    });

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.isLevelEnabled).toHaveBeenCalledTimes(1);
    expect(logger.isLevelEnabled).toHaveBeenCalledWith('info');

    audit.stop();
  });
});

describe('#withoutRequest', () => {
  it('logs event without additional meta data', async () => {
    const audit = new AuditService(logger);
    const auditSetup = audit.setup({
      license,
      config,
      logging,
      http,
      getCurrentUser,
      getSpaceId,
      getSID,
      recordAuditLoggingUsage,
    });

    await auditSetup.withoutRequest.log({ message: 'MESSAGE', event: { action: 'ACTION' } });
    expect(logger.info).toHaveBeenCalledWith('MESSAGE', {
      event: { action: 'ACTION' },
    });
    audit.stop();
  });

  it('does not log to audit logger if event matches ignore filter', async () => {
    const audit = new AuditService(logger);
    const auditSetup = audit.setup({
      license,
      config: {
        enabled: true,
        include_saved_object_names: false,
        appender: {
          type: 'console',
          layout: {
            type: 'json',
          },
        },
        ignore_filters: [{ actions: ['ACTION'] }],
      },
      logging,
      http,
      getCurrentUser,
      getSpaceId,
      getSID,
      recordAuditLoggingUsage,
    });

    await auditSetup.withoutRequest.log({ message: 'MESSAGE', event: { action: 'ACTION' } });
    expect(logger.info).not.toHaveBeenCalled();
    audit.stop();
  });

  it('does not log to audit logger if no event was generated', async () => {
    const audit = new AuditService(logger);
    const auditSetup = audit.setup({
      license,
      config: {
        enabled: true,
        include_saved_object_names: false,
        appender: {
          type: 'console',
          layout: {
            type: 'json',
          },
        },
        ignore_filters: [{ actions: ['ACTION'] }],
      },
      logging,
      http,
      getCurrentUser,
      getSpaceId,
      getSID,
      recordAuditLoggingUsage,
    });

    await auditSetup.withoutRequest.log(undefined);
    expect(logger.info).not.toHaveBeenCalled();
    audit.stop();
  });
});

describe('#createLoggingConfig', () => {
  test('sets log level to `info` when audit logging is enabled and appender is defined', async () => {
    const features$ = of({
      allowAuditLogging: true,
    });

    const loggingConfig = await features$
      .pipe(
        createLoggingConfig({
          enabled: true,
          include_saved_object_names: false,
          appender: {
            type: 'console',
            layout: {
              type: 'pattern',
            },
          },
        })
      )
      .toPromise();

    expect(loggingConfig).toMatchInlineSnapshot(`
      Object {
        "appenders": Object {
          "auditTrailAppender": Object {
            "layout": Object {
              "type": "pattern",
            },
            "type": "console",
          },
        },
        "loggers": Array [
          Object {
            "appenders": Array [
              "auditTrailAppender",
            ],
            "level": "info",
            "name": "audit.ecs",
          },
        ],
      }
    `);
  });

  test('sets log level to `off` when audit logging is disabled', async () => {
    const features$ = of({
      allowAuditLogging: true,
    });

    const loggingConfig = await lastValueFrom(
      features$.pipe(
        createLoggingConfig({
          enabled: false,
          include_saved_object_names: false,
          appender: {
            type: 'console',
            layout: {
              type: 'pattern',
            },
          },
        })
      )
    );

    expect(loggingConfig.loggers![0].level).toEqual('off');
  });

  test('sets log level to `off` when license does not allow audit logging', async () => {
    const features$ = of({
      allowAuditLogging: false,
    });

    const loggingConfig = await lastValueFrom(
      features$.pipe(
        createLoggingConfig({
          enabled: true,
          include_saved_object_names: false,
          appender: {
            type: 'console',
            layout: {
              type: 'pattern',
            },
          },
        })
      )
    );

    expect(loggingConfig.loggers![0].level).toEqual('off');
  });

  test('injects audit field renames when using an OTel appender', async () => {
    const features$ = of({ allowAuditLogging: true });

    const loggingConfig = await lastValueFrom(
      features$.pipe(
        createLoggingConfig({
          enabled: true,
          include_saved_object_names: false,
          appender: {
            type: 'otel',
            protocol: 'http',
            url: 'http://collector:4318/v1/logs',
          },
        })
      )
    );

    const appenders = loggingConfig.appenders as Record<string, AppenderConfigType>;
    expect((appenders.auditTrailAppender as OtelAppenderConfig).fieldRenames).toEqual(
      AUDIT_OTEL_FIELD_RENAMES
    );
  });

  test('does not inject field renames for non-OTel appenders', async () => {
    const features$ = of({ allowAuditLogging: true });

    const loggingConfig = await lastValueFrom(
      features$.pipe(
        createLoggingConfig({
          enabled: true,
          include_saved_object_names: false,
          appender: {
            type: 'console',
            layout: { type: 'pattern' },
          },
        })
      )
    );

    const appenders = loggingConfig.appenders as Record<string, AppenderConfigType>;
    expect(appenders.auditTrailAppender).not.toHaveProperty('fieldRenames');
  });

  test('merges user-provided fieldRenames with audit renames; audit renames take precedence on conflict', async () => {
    const features$ = of({ allowAuditLogging: true });

    const loggingConfig = await lastValueFrom(
      features$.pipe(
        createLoggingConfig({
          enabled: true,
          include_saved_object_names: false,
          appender: {
            type: 'otel',
            protocol: 'http',
            url: 'http://collector:4318/v1/logs',
            fieldRenames: {
              'custom.field': 'custom.new_field',
              // User tries to override an audit rename — audit wins.
              'kibana.space_id': 'kibana.space.overridden',
            },
          },
        })
      )
    );

    const appenders = loggingConfig.appenders as Record<string, AppenderConfigType>;
    expect((appenders.auditTrailAppender as OtelAppenderConfig).fieldRenames).toMatchObject({
      'custom.field': 'custom.new_field',
      'kibana.space_id': 'kibana.space.id', // audit rename wins
    });
  });
});

describe('#getForwardedFor', () => {
  it('extracts x-forwarded-for header from request', () => {
    const request = httpServerMock.createKibanaRequest({
      headers: {
        'x-forwarded-for': '1.1.1.1',
      },
    });
    expect(getForwardedFor(request)).toBe('1.1.1.1');
  });

  it('concatenates multiple headers into single string in correct order', () => {
    const request = httpServerMock.createKibanaRequest({
      headers: {
        // @ts-expect-error Headers can be arrays but HAPI mocks are incorrectly typed
        'x-forwarded-for': ['1.1.1.1, 2.2.2.2', '3.3.3.3'],
      },
    });
    expect(getForwardedFor(request)).toBe('1.1.1.1, 2.2.2.2, 3.3.3.3');
  });

  it('returns undefined when header not present', () => {
    const request = httpServerMock.createKibanaRequest();
    expect(getForwardedFor(request)).toBeUndefined();
  });
});

describe('#filterEvent', () => {
  let event: AuditEvent;

  beforeEach(() => {
    event = {
      message: 'this is my audit message',
      event: {
        action: 'http_request',
        category: ['web'],
        type: ['access'],
        outcome: 'success',
      },
      user: {
        name: 'jdoe',
      },
      kibana: {
        space_id: 'default',
      },
    };
  });

  test('keeps event when ignore filters are undefined or empty', () => {
    expect(filterEvent(event, undefined)).toBeTruthy();
    expect(filterEvent(event, [])).toBeTruthy();
  });

  test('filters event correctly when a single match is found per criteria', () => {
    expect(filterEvent(event, [{ actions: ['NO_MATCH'] }])).toBeTruthy();
    expect(filterEvent(event, [{ actions: ['NO_MATCH', 'http_request'] }])).toBeFalsy();
    expect(filterEvent(event, [{ categories: ['NO_MATCH', 'web'] }])).toBeFalsy();
    expect(filterEvent(event, [{ types: ['NO_MATCH', 'access'] }])).toBeFalsy();
    expect(filterEvent(event, [{ outcomes: ['NO_MATCH', 'success'] }])).toBeFalsy();
    expect(filterEvent(event, [{ spaces: ['NO_MATCH', 'default'] }])).toBeFalsy();
    expect(filterEvent(event, [{ users: ['NO_MATCH', 'jdoe'] }])).toBeFalsy();
  });

  test('keeps event when one criteria per rule does not match', () => {
    expect(
      filterEvent(event, [
        {
          actions: ['NO_MATCH'],
          categories: ['web'],
          types: ['access'],
          outcomes: ['success'],
          spaces: ['default'],
          users: ['jdoe'],
        },
        {
          actions: ['http_request'],
          categories: ['NO_MATCH'],
          types: ['access'],
          outcomes: ['success'],
          spaces: ['default'],
          users: ['jdoe'],
        },
        {
          actions: ['http_request'],
          categories: ['web'],
          types: ['NO_MATCH'],
          outcomes: ['success'],
          spaces: ['default'],
          users: ['jdoe'],
        },
        {
          actions: ['http_request'],
          categories: ['web'],
          types: ['access'],
          outcomes: ['NO_MATCH'],
          spaces: ['default'],
          users: ['jdoe'],
        },
        {
          actions: ['http_request'],
          categories: ['web'],
          types: ['access'],
          outcomes: ['success'],
          spaces: ['NO_MATCH'],
          users: ['jdoe'],
        },
        {
          actions: ['http_request'],
          categories: ['web'],
          types: ['access'],
          outcomes: ['success'],
          spaces: ['default'],
          users: ['NO_MATCH'],
        },
      ])
    ).toBeTruthy();
  });

  test('keeps event when one item per category does not match', () => {
    event = {
      message: 'this is my audit message',
      event: {
        action: 'http_request',
        category: ['authentication', 'web'],
        type: ['access'],
        outcome: 'success',
      },
      user: {
        name: 'jdoe',
      },
      kibana: {
        space_id: 'default',
      },
    };

    expect(
      filterEvent(event, [
        {
          actions: ['http_request'],
          categories: ['web', 'NO_MATCH'],
          types: ['access'],
          outcomes: ['success'],
          spaces: ['default'],
          users: ['jdoe'],
        },
      ])
    ).toBeTruthy();
  });

  test('keeps event when one item per type does not match', () => {
    event = {
      message: 'this is my audit message',
      event: {
        action: 'http_request',
        category: ['web'],
        type: ['access', 'user'],
        outcome: 'success',
      },
      user: {
        name: 'jdoe',
      },
      kibana: {
        space_id: 'default',
      },
    };

    expect(
      filterEvent(event, [
        {
          actions: ['http_request'],
          categories: ['web'],
          types: ['access', 'NO_MATCH'],
          outcomes: ['success'],
          spaces: ['default'],
          users: ['jdoe'],
        },
      ])
    ).toBeTruthy();
  });

  test('filters out event when all criteria in a single rule match', () => {
    expect(
      filterEvent(event, [
        {
          actions: ['NO_MATCH'],
          categories: ['NO_MATCH'],
          types: ['NO_MATCH'],
          outcomes: ['NO_MATCH'],
          spaces: ['NO_MATCH'],
          users: ['NO_MATCH'],
        },
        {
          actions: ['http_request'],
          categories: ['web'],
          types: ['access'],
          outcomes: ['success'],
          spaces: ['default'],
          users: ['jdoe'],
        },
      ])
    ).toBeFalsy();
  });

  test('filters out event when all categories match', () => {
    event = {
      message: 'this is my audit message',
      event: {
        action: 'http_request',
        category: ['authentication', 'web'],
        type: ['access'],
        outcome: 'success',
      },
      user: {
        name: 'jdoe',
      },
      kibana: {
        space_id: 'default',
      },
    };

    expect(
      filterEvent(event, [
        {
          actions: ['http_request'],
          categories: ['authentication', 'web'],
          types: ['access'],
          outcomes: ['success'],
          spaces: ['default'],
          users: ['jdoe'],
        },
      ])
    ).toBeFalsy();
  });

  test('filters out event when all types match', () => {
    event = {
      message: 'this is my audit message',
      event: {
        action: 'http_request',
        category: ['web'],
        type: ['access', 'user'],
        outcome: 'success',
      },
      user: {
        name: 'jdoe',
      },
      kibana: {
        space_id: 'default',
      },
    };

    expect(
      filterEvent(event, [
        {
          actions: ['http_request'],
          categories: ['web'],
          types: ['access', 'user'],
          outcomes: ['success'],
          spaces: ['default'],
        },
      ])
    ).toBeFalsy();
  });
});
