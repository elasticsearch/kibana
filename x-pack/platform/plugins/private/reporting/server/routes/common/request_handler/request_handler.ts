/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import type {
  IKibanaResponse,
  KibanaRequest,
  KibanaResponseFactory,
  Logger,
} from '@kbn/core/server';
import { i18n } from '@kbn/i18n';
import type { BaseParams } from '@kbn/reporting-common/types';
import { cryptoFactory } from '@kbn/reporting-server';
import rison from '@kbn/rison';

import type { RruleSchedule } from '@kbn/task-manager-plugin/server';
import type { RawNotification } from '../../../saved_objects/scheduled_report/schemas/latest';
import { checkParamsVersion } from '../../../lib';
import { type Counters } from '..';
import type { ReportingCore } from '../../..';
import type { ReportingRequestHandlerContext, ReportingUser } from '../../../types';
import { validateJobParams } from './validator';

export const handleUnavailable = (res: KibanaResponseFactory) => {
  return res.custom({ statusCode: 503, body: 'Not Available' });
};

export const ParamsValidation = schema.recordOf(schema.string(), schema.string());
export const QueryValidation = schema.nullable(
  schema.recordOf(schema.string(), schema.maybe(schema.string()))
);
export const BodyValidation = schema.nullable(
  schema.recordOf(schema.string(), schema.maybe(schema.any()))
);

interface ConstructorOpts<
  Params extends typeof ParamsValidation,
  Query extends typeof QueryValidation,
  Body extends typeof BodyValidation
> {
  reporting: ReportingCore;
  user: ReportingUser;
  context: ReportingRequestHandlerContext;
  path: string;
  req: KibanaRequest<TypeOf<Params>, TypeOf<Query>, TypeOf<Body>>;
  res: KibanaResponseFactory;
  logger: Logger;
}

export interface RequestParams {
  exportTypeId: string;
  jobParams: BaseParams;
  id?: string;
  schedule?: RruleSchedule;
  notification?: RawNotification;
}

/**
 * Handles the common parts of requests to generate or schedule a report
 * Serves report job handling in the context of the request to generate the report
 */
export abstract class RequestHandler<
  Params extends typeof ParamsValidation,
  Query extends typeof QueryValidation,
  Body extends typeof BodyValidation,
  Output extends Record<string, any>
> {
  constructor(protected readonly opts: ConstructorOpts<Params, Query, Body>) {}

  public static getValidation() {
    throw new Error('getValidation() must be implemented in a subclass');
  }

  public abstract enqueueJob(params: RequestParams): Promise<Output>;

  public abstract handleRequest(params: RequestParams): Promise<IKibanaResponse>;

  public getJobParams(): BaseParams {
    let jobParamsRison: null | string = null;
    const req = this.opts.req;
    const res = this.opts.res;

    if (req.body) {
      const { jobParams: jobParamsPayload } = req.body;
      jobParamsRison = jobParamsPayload ? jobParamsPayload : null;
    } else if (req.query?.jobParams) {
      const { jobParams: queryJobParams } = req.query;
      if (queryJobParams) {
        jobParamsRison = queryJobParams;
      } else {
        jobParamsRison = null;
      }
    }

    if (!jobParamsRison) {
      throw res.customError({
        statusCode: 400,
        body: 'A jobParams RISON string is required in the querystring or POST body',
      });
    }

    let jobParams;

    try {
      jobParams = rison.decode(jobParamsRison) as BaseParams | null;
      if (!jobParams) {
        throw res.customError({
          statusCode: 400,
          body: 'Missing jobParams!',
        });
      }
    } catch (err) {
      throw res.customError({
        statusCode: 400,
        body: `invalid rison: ${jobParamsRison}`,
      });
    }
    try {
      jobParams = validateJobParams(jobParams) as BaseParams;
    } catch (err) {
      this.opts.logger.error(`Job param validation failed: ${err.message}`, {
        error: { stack_trace: err.stack },
      });
      throw res.customError({
        statusCode: 400,
        body: `invalid params: ${err.message}`,
      });
    }

    return jobParams;
  }

  protected async createJob(exportTypeId: string, jobParams: BaseParams) {
    const exportType = this.opts.reporting.getExportTypesRegistry().getById(exportTypeId);

    if (exportType == null) {
      throw new Error(`Export type ${exportTypeId} does not exist in the registry!`);
    }

    if (!exportType.createJob) {
      throw new Error(`Export type ${exportTypeId} is not a valid instance!`);
    }

    // 1. Ensure the incoming params have a version field (should be set by the UI)
    const version = checkParamsVersion(
      jobParams,
      this.opts.logger,
      this.opts.reporting.getKibanaPackageInfo().version
    );

    // 2. Create a payload object by calling exportType.createJob(), and adding some automatic parameters
    const job = await exportType.createJob(jobParams, this.opts.context, this.opts.req);

    return { job, version, jobType: exportType.jobType, name: exportType.name };
  }

  protected async checkLicense(exportTypeId: string): Promise<IKibanaResponse | null> {
    const { reporting, context, res } = this.opts;

    // ensure the async dependencies are loaded
    if (!context.reporting) {
      return handleUnavailable(res);
    }

    const licenseInfo = await reporting.getLicenseInfo();
    const licenseResults = licenseInfo[exportTypeId];

    if (!licenseResults) {
      return res.badRequest({ body: `Invalid export-type of ${exportTypeId}` });
    }

    if (!licenseResults.enableLinks) {
      return res.forbidden({ body: licenseResults.message });
    }

    return null;
  }

  protected async encryptHeaders() {
    const { encryptionKey } = this.opts.reporting.getConfig();
    const crypto = cryptoFactory(encryptionKey);
    return await crypto.encrypt(this.opts.req.headers);
  }

  protected handleError(err: Error | Boom.Boom, counters?: Counters, jobtype?: string) {
    this.opts.logger.error(err);

    if (err instanceof Boom.Boom) {
      const statusCode = err.output.statusCode;
      counters?.errorCounter(jobtype, statusCode);

      return this.opts.res.customError({
        statusCode,
        body: err.output.payload.message,
      });
    }

    counters?.errorCounter(jobtype, 500);

    return this.opts.res.customError({
      statusCode: 500,
      body:
        err?.message ||
        i18n.translate('xpack.reporting.errorHandler.unknownError', {
          defaultMessage: 'Unknown error',
        }),
    });
  }
}
