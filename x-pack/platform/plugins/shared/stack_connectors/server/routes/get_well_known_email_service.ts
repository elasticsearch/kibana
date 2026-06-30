/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type {
  IRouter,
  RequestHandlerContext,
  KibanaRequest,
  IKibanaResponse,
  KibanaResponseFactory,
} from '@kbn/core/server';
import nodemailerGetService from 'nodemailer/lib/well-known';
import type SMTPConnection from 'nodemailer/lib/smtp-connection';
import type { AwsSesConfig } from '@kbn/actions-plugin/server/types';
import { AdditionalEmailServices, INTERNAL_BASE_STACK_CONNECTORS_API_PATH } from '../../common';
import { ELASTIC_CLOUD_SERVICE } from '../connector_types/email';

const paramSchema = schema.object({
  service: schema.string({ maxLength: 100 }),
});

export const getWellKnownEmailServiceRoute = (router: IRouter, awsSesConfig: AwsSesConfig) => {
  router.get(
    {
      path: `${INTERNAL_BASE_STACK_CONNECTORS_API_PATH}/_email_config/{service}`,
      security: {
        authz: {
          enabled: false,
          reason:
            'This route is opted out from authorization as returning SMTP connection details does not require any.',
        },
      },
      validate: {
        params: paramSchema,
      },
      options: {
        access: 'internal',
      },
    },
    handler
  );

  async function handler(
    ctx: RequestHandlerContext,
    req: KibanaRequest<{ service: string }, unknown, unknown>,
    res: KibanaResponseFactory
  ): Promise<IKibanaResponse> {
    const { service } = req.params;

    let response: SMTPConnection.Options = {};
    if (service === AdditionalEmailServices.ELASTIC_CLOUD) {
      response = ELASTIC_CLOUD_SERVICE;
    } else if (awsSesConfig && service === AdditionalEmailServices.AWS_SES) {
      response = {
        host: awsSesConfig.host,
        port: awsSesConfig.port,
        secure: true,
      };
    } else {
      const serviceEntry = nodemailerGetService(service);
      if (serviceEntry) {
        response = {
          host: serviceEntry.host,
          port: serviceEntry.port,
          secure: serviceEntry.secure,
        };
      }
    }

    return res.ok({
      body: response,
    });
  }
};
