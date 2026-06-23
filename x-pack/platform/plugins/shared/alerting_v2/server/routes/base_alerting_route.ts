/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import type { IKibanaResponse, RouteConfigOptions, RouteMethod } from '@kbn/core-http-server';
import type { RouteHandler } from '@kbn/core-di-server';
import { errorResponseSchema, type ErrorResponse } from '@kbn/alerting-v2-schemas';
import { injectable } from 'inversify';
import { ALERTING_V2_ENABLED_SETTING_ID } from '@kbn/alerting-v2-constants';
import { ALERTING_V2_ERROR_CODES } from '../lib/errors/error_codes';
import type { AlertingRouteContext } from './alerting_route_context';
import { deepMergeRouteOptions } from './deep_merge_route_options';
import { deriveErrorCodeFromStatus } from './derive_error_code';
import { computeRouteValidate, type AlertingRouteSchemas } from './compute_route_validate';

/**
 * Re-exported so route authors keep a single import surface
 * (`./base_alerting_route`) for the abstract class and the schemas contract
 * they need to extend it.
 */
export type { AlertingRouteSchemas } from './compute_route_validate';

/**
 * Structured context attached to `Boom` errors via `Boom.<method>(msg, data)`
 * — surfaced to clients on the response body as `code` / `details`.
 *
 * `code`    — stable, machine-readable identifier (e.g. `RULE_NOT_FOUND`).
 * `details` — arbitrary structured context (resource id, validation issues).
 */
export interface AlertingBoomData {
  code?: string;
  details?: Record<string, unknown>;
}

@injectable()
export abstract class BaseAlertingRoute implements RouteHandler {
  protected static readonly defaultOptions: RouteConfigOptions<RouteMethod> = {
    access: 'public',
    tags: ['oas-tag:alerting-v2'],
    availability: { stability: 'experimental' },
  };

  protected static readonly routeOptions: RouteConfigOptions<RouteMethod> = {};

  public static get options(): RouteConfigOptions<RouteMethod> {
    return deepMergeRouteOptions(BaseAlertingRoute.defaultOptions, this.routeOptions);
  }

  /**
   * Error responses every route can emit, merged into each
   * subclass's declared `schemas.response` by the `validate` getter so the
   * generated OAS captures them consistently. Subclass-declared status
   * codes take precedence. A route can specialize, say, `500` with a more
   * specific description and the merge keeps the override.
   *
   * Intentionally limited to truly universal codes:
   *   401 — request was not authenticated (Kibana core enforces auth).
   *   403 — request lacks the route's `requiredPrivileges`.
   *   500 — any uncaught throw boomifies to 500.
   *   503 — alerting is administratively disabled (kill switch).
   *
   * Route-specific codes (400 / 404 / 409 / …) belong on each subclass.
   */
  protected static readonly commonResponses: NonNullable<AlertingRouteSchemas['response']> = {
    401: {
      body: () => errorResponseSchema,
      description: 'Indicates the request was not authenticated.',
    },
    403: {
      body: () => errorResponseSchema,
      description:
        'Indicates the user does not have the required privileges to perform the request.',
    },
    500: {
      body: () => errorResponseSchema,
      description: 'Indicates an unexpected server-side error.',
    },
    503: {
      body: () => errorResponseSchema,
      description:
        'Indicates the alerting engine is disabled by the `alerting:v2:enabled` advanced setting.',
    },
  };

  /**
   * Subclasses declare raw Zod request schemas and response descriptors here.
   * The `validate` static getter below delegates to `computeRouteValidate`
   * which wraps the request schemas with `buildRouteValidationWithZod` so
   * each route stays declarative.
   */
  protected static schemas: AlertingRouteSchemas = {};

  public static get validate() {
    const merged: AlertingRouteSchemas = {
      ...this.schemas,
      response: {
        ...this.commonResponses,
        ...(this.schemas.response ?? {}),
      },
    };
    return computeRouteValidate(merged);
  }

  protected abstract readonly routeName: string;

  constructor(protected readonly ctx: AlertingRouteContext) {}

  async handle(): Promise<IKibanaResponse> {
    try {
      await this.assertAlertingEnabled();
      return await this.execute();
    } catch (e) {
      return this.onError(e);
    }
  }

  protected abstract execute(): Promise<IKibanaResponse>;

  /**
   * Global kill switch for the alerting v2 HTTP surface.
   *
   * Reads the `alerting:v2:enabled` advanced setting and short-circuits with
   * a 503 `ALERTING_DISABLED` error before any route-specific work runs
   * when the operator has turned the engine off.
   */
  private async assertAlertingEnabled(): Promise<void> {
    const enabled = await this.ctx.settings.get(ALERTING_V2_ENABLED_SETTING_ID);

    if (!enabled) {
      throw Boom.serverUnavailable('Alerting is disabled.', {
        code: ALERTING_V2_ERROR_CODES.ALERTING_DISABLED,
      });
    }
  }

  protected onError(e: Boom.Boom | Error): IKibanaResponse {
    const boom = Boom.isBoom(e) ? e : Boom.boomify(e);

    if (boom.output.statusCode >= 500) {
      this.ctx.logger.error(`${this.routeName} error: ${boom.message}`, { error: e });
    } else {
      this.ctx.logger.debug(`${this.routeName} error: ${boom.message}`);
    }

    const data = (boom.data ?? undefined) as AlertingBoomData | undefined;
    const code = data?.code ?? deriveErrorCodeFromStatus(boom.output.statusCode);
    const payload = boom.output.payload;

    const body: ErrorResponse = {
      code,
      error: payload.error,
      message: payload.message,
      ...(data?.details ? { details: data.details } : {}),
    };

    return this.ctx.response.customError({
      statusCode: boom.output.statusCode,
      body,
    });
  }
}
