/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import type { KibanaResponseFactory, RouteConfigOptions, RouteMethod } from '@kbn/core-http-server';
import type { Logger } from '@kbn/logging';
import { errorResponseSchema } from '@kbn/alerting-v2-schemas';
import { z } from '@kbn/zod/v4';
import { BaseAlertingRoute, type AlertingRouteSchemas } from './base_alerting_route';
import { ALERTING_V2_ERROR_CODES } from '../lib/errors/error_codes';
import type { MockUiSettingsClient } from '../lib/services/settings_service/settings_service.mock';
import { deriveErrorCodeFromStatus } from './derive_error_code';
import { createRouteDependencies } from './test_utils';
import type { computeRouteValidate } from './compute_route_validate';

type ComputedValidate = Exclude<ReturnType<typeof computeRouteValidate>, false>;

class TestRoute extends BaseAlertingRoute {
  static routeOptions: RouteConfigOptions<RouteMethod> = {};
  public static schemas: AlertingRouteSchemas = {};

  protected readonly routeName = 'test route';
  public executeFn = jest.fn();
  public onErrorSpy = jest.fn();

  protected async execute() {
    return this.executeFn();
  }

  protected onError(e: Boom.Boom | Error) {
    const result = this.onErrorSpy(e);

    if (result) {
      return result;
    }

    return super.onError(e);
  }
}

describe('BaseAlertingRoute', () => {
  let response: jest.Mocked<KibanaResponseFactory>;
  let logger: jest.Mocked<Logger>;
  let mockUiSettingsClient: MockUiSettingsClient;
  let route: TestRoute;

  beforeEach(() => {
    const deps = createRouteDependencies();
    response = deps.response;
    logger = deps.logger;
    mockUiSettingsClient = deps.mockUiSettingsClient;
    route = new TestRoute(deps.ctx);
  });

  it('delegates to execute() and returns the result', async () => {
    const expectedResponse = response.ok({ body: { id: '123' } });
    route.executeFn.mockResolvedValue(expectedResponse);

    const result = await route.handle();

    expect(result).toBe(expectedResponse);
    expect(route.executeFn).toHaveBeenCalledTimes(1);
  });

  describe('alerting kill switch', () => {
    it('short-circuits with a 503 ALERTING_DISABLED error when the setting is off', async () => {
      mockUiSettingsClient.get.mockResolvedValue(false);

      await route.handle();

      expect(route.executeFn).not.toHaveBeenCalled();
      expect(response.customError).toHaveBeenCalledWith({
        statusCode: 503,
        body: {
          code: ALERTING_V2_ERROR_CODES.ALERTING_DISABLED,
          error: 'Service Unavailable',
          message: 'Alerting is disabled.',
        },
      });
    });

    it('runs execute() when the setting is on', async () => {
      mockUiSettingsClient.get.mockResolvedValue(true);
      const expectedResponse = response.ok({ body: { id: '123' } });
      route.executeFn.mockResolvedValue(expectedResponse);

      const result = await route.handle();

      expect(result).toBe(expectedResponse);
      expect(route.executeFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('onError', () => {
    it('returns { code, error, message } for plain Boom errors (no data attached)', async () => {
      route.executeFn.mockRejectedValue(Boom.notFound('rule not found'));

      await route.handle();

      expect(response.customError).toHaveBeenCalledWith({
        statusCode: 404,
        body: {
          code: 'NOT_FOUND',
          error: 'Not Found',
          message: 'rule not found',
        },
      });
    });

    it('uses the domain-specific code from boom.data when provided', async () => {
      route.executeFn.mockRejectedValue(
        Boom.notFound('Rule "abc" not found.', { code: 'RULE_NOT_FOUND' })
      );

      await route.handle();

      expect(response.customError).toHaveBeenCalledWith({
        statusCode: 404,
        body: {
          code: 'RULE_NOT_FOUND',
          error: 'Not Found',
          message: 'Rule "abc" not found.',
        },
      });
    });

    it('includes structured details from boom.data when provided', async () => {
      route.executeFn.mockRejectedValue(
        Boom.notFound('Rule "abc" not found.', {
          code: 'RULE_NOT_FOUND',
          details: { rule_id: 'abc' },
        })
      );

      await route.handle();

      expect(response.customError).toHaveBeenCalledWith({
        statusCode: 404,
        body: {
          code: 'RULE_NOT_FOUND',
          error: 'Not Found',
          message: 'Rule "abc" not found.',
          details: { rule_id: 'abc' },
        },
      });
    });

    it('preserves an empty details object when boom.data explicitly attaches one', async () => {
      route.executeFn.mockRejectedValue(
        Boom.badRequest('Invalid input', { code: 'INVALID_INPUT', details: {} })
      );

      await route.handle();

      expect(response.customError).toHaveBeenCalledWith({
        statusCode: 400,
        body: {
          code: 'INVALID_INPUT',
          error: 'Bad Request',
          message: 'Invalid input',
          details: {},
        },
      });
    });

    it('lets a domain-specific code win over the status-derived fallback', async () => {
      route.executeFn.mockRejectedValue(
        Boom.internal('downstream offline', { code: 'DOWNSTREAM_UNAVAILABLE' })
      );

      await route.handle();

      expect(response.customError).toHaveBeenCalledWith({
        statusCode: 500,
        body: {
          code: 'DOWNSTREAM_UNAVAILABLE',
          error: 'Internal Server Error',
          message: 'An internal server error occurred',
        },
      });
    });

    it('derives the code from the status via deriveErrorCodeFromStatus for unusual statuses', async () => {
      route.executeFn.mockRejectedValue(Boom.boomify(new Error('teapot'), { statusCode: 418 }));

      await route.handle();

      expect(response.customError).toHaveBeenCalledWith({
        statusCode: 418,
        body: {
          code: deriveErrorCodeFromStatus(418),
          error: "I'm a teapot",
          message: 'teapot',
        },
      });
    });

    it('boomifies non-Boom errors to 500 with a derived code', async () => {
      route.executeFn.mockRejectedValue(new TypeError('cannot read property'));

      await route.handle();

      expect(response.customError).toHaveBeenCalledWith({
        statusCode: 500,
        body: {
          code: 'INTERNAL_SERVER_ERROR',
          error: 'Internal Server Error',
          message: 'An internal server error occurred',
        },
      });
    });

    it('logs 5xx errors at error level with the original error attached', async () => {
      const cause = new TypeError('boom');
      route.executeFn.mockRejectedValue(cause);

      await route.handle();

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('test route error'), {
        error: cause,
      });
      expect(logger.debug).not.toHaveBeenCalled();
    });

    it('logs 4xx errors at debug level only', async () => {
      route.executeFn.mockRejectedValue(Boom.notFound('rule not found'));

      await route.handle();

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('test route error'));
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe('static options merging', () => {
    afterEach(() => {
      TestRoute.routeOptions = {};
    });

    it('returns default options when no routeOptions are declared', () => {
      expect(TestRoute.options).toEqual({
        access: 'public',
        tags: ['oas-tag:alerting-v2'],
        availability: { stability: 'experimental' },
      });
    });

    it('merges routeOptions with defaults', () => {
      TestRoute.routeOptions = { summary: 'Get a rule' };

      expect(TestRoute.options).toEqual({
        access: 'public',
        tags: ['oas-tag:alerting-v2'],
        availability: { stability: 'experimental' },
        summary: 'Get a rule',
      });
    });

    it('overrides defaults with child values', () => {
      TestRoute.routeOptions = { access: 'internal' };

      expect(TestRoute.options).toEqual({
        access: 'internal',
        tags: ['oas-tag:alerting-v2'],
        availability: { stability: 'experimental' },
      });
    });

    it('concatenates arrays from parent and child', () => {
      TestRoute.routeOptions = { tags: ['extra-tag'] };

      expect(TestRoute.options).toEqual({
        access: 'public',
        tags: ['oas-tag:alerting-v2', 'extra-tag'],
        availability: { stability: 'experimental' },
      });
    });

    it('deep merges nested objects', () => {
      TestRoute.routeOptions = { availability: { since: '1.0' } };

      expect(TestRoute.options).toEqual({
        access: 'public',
        tags: ['oas-tag:alerting-v2'],
        availability: { stability: 'experimental', since: '1.0' },
      });
    });
  });

  describe('static validate getter', () => {
    afterEach(() => {
      TestRoute.schemas = {};
    });

    it('emits the shared 401/403/500/503 responses even when the subclass declares no schemas', () => {
      const validate = TestRoute.validate as ComputedValidate;

      expect(
        Object.keys(validate.response ?? {})
          .map(Number)
          .sort((a, b) => a - b)
      ).toEqual([401, 403, 500, 503]);

      expect(validate.response?.[401]?.body?.()).toEqual(errorResponseSchema);
      expect(validate.response?.[403]?.body?.()).toEqual(errorResponseSchema);
      expect(validate.response?.[500]?.body?.()).toEqual(errorResponseSchema);
      expect(validate.response?.[503]?.body?.()).toEqual(errorResponseSchema);
    });

    it('merges the subclass response schemas with the common ones', () => {
      const okSchemaFactory = jest.fn(() => z.object({ id: z.string() }));

      TestRoute.schemas = {
        response: {
          200: {
            body: okSchemaFactory,
            description: 'Indicates a successful call.',
          },
        },
      };

      const validate = TestRoute.validate as ComputedValidate;

      expect(
        Object.keys(validate.response ?? {})
          .map(Number)
          .sort((a, b) => a - b)
      ).toEqual([200, 401, 403, 500, 503]);

      expect(validate.response?.[200]?.body).toEqual(okSchemaFactory);
    });

    it('lets the subclass override a common status code (e.g. a specialized 500 description)', () => {
      TestRoute.schemas = {
        response: {
          500: {
            description: 'Specialized 500 description for this route.',
          },
        },
      };

      const validate = TestRoute.validate as ComputedValidate;

      expect(validate.response?.[500]?.description).toBe(
        'Specialized 500 description for this route.'
      );
    });

    it('replaces (does not deep-merge) a common response when the subclass declares the same status', () => {
      TestRoute.schemas = {
        response: {
          500: {
            description: 'Specialized 500 description for this route.',
          },
        },
      };

      const validate = TestRoute.validate as ComputedValidate;

      expect(validate.response?.[500]?.body).toBeUndefined();
    });

    it('lets the subclass override a common response body with its own schema', () => {
      const subclassUnauthorizedBody = jest.fn(() => z.object({ reason: z.string() }));

      TestRoute.schemas = {
        response: {
          401: {
            body: subclassUnauthorizedBody,
            description: 'Custom unauthorized payload.',
          },
        },
      };

      const validate = TestRoute.validate as ComputedValidate;

      expect(validate.response?.[401]?.body).toEqual(subclassUnauthorizedBody);
      expect(validate.response?.[401]?.description).toBe('Custom unauthorized payload.');
    });

    it('returns the subclass request schemas correctly', () => {
      TestRoute.schemas = {
        request: {
          params: z.object({ id: z.string() }),
          query: z.object({ page: z.number().optional() }),
          body: z.object({ name: z.string() }),
        },
      };

      const validate = TestRoute.validate as ComputedValidate;

      expect(validate.request?.params).toBeDefined();
      expect(validate.request?.query).toBeDefined();
      expect(validate.request?.body).toBeDefined();
    });
  });
});
