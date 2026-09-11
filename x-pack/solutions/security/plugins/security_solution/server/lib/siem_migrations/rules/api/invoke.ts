/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IKibanaResponse, Logger } from '@kbn/core/server';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { z } from '@kbn/zod/v4';
import { SIEM_RULE_MIGRATION_INVOKE_PATH } from '../../../../../common/siem_migrations/constants';
import type { SecuritySolutionPluginRouter } from '../../../../types';
import { authz } from './util/authz';
import { withLicense } from '../../common/api/util/with_license';
import type { MigrateRuleConfig } from '../task/agent/types';
import type { RuleMigrationTaskInput } from '../task/rule_migrations_task_runner';
import {
  OriginalRuleVendorEnum,
  type OriginalRuleVendor,
} from '../../../../../common/siem_migrations/model/rule_migration.gen';

const REQUEST_TIMEOUT = 3 * 60 * 1000; // 3 min — rules migration ~60s typical

const requestBodyValidation = buildRouteValidationWithZod(
  z.object({
    connector_id: z.string().max(512),
    input: z.object({
      id: z.string().max(512),
      original_rule: z.record(z.string().max(256), z.unknown()),
      resources: z.record(z.string().max(256), z.array(z.unknown())).optional().default({}),
    }),
    config: z
      .object({
        configurable: z.object({ skipPrebuiltRulesMatching: z.boolean() }).optional(),
      })
      .optional(),
  })
);

export const registerSiemRuleMigrationsInvokeRoute = (
  router: SecuritySolutionPluginRouter,
  logger: Logger
) => {
  router.versioned
    .post({
      path: SIEM_RULE_MIGRATION_INVOKE_PATH,
      access: 'internal',
      security: { authz },
      options: { timeout: { idleSocket: REQUEST_TIMEOUT } },
    })
    .addVersion(
      { version: '1', validate: { request: { body: requestBodyValidation } } },
      withLicense(async (context, req, res): Promise<IKibanaResponse> => {
        const { connector_id: connectorId, input, config } = req.body;
        try {
          const abortController = new AbortController();
          req.events.aborted$.subscribe(() => abortController.abort());

          const securitySolutionContext = await context.securitySolution;
          const ruleMigrationsClient = securitySolutionContext.siemMigrations.getRulesClient();

          const rawVendor = String(input.original_rule.vendor ?? 'splunk');
          if (!Object.hasOwn(OriginalRuleVendorEnum, rawVendor)) {
            return res.badRequest({ body: `Unknown vendor: ${rawVendor}` });
          }
          const vendor = rawVendor as OriginalRuleVendor;
          const invoker = await ruleMigrationsClient.task.createInvoker(connectorId, {
            abortController,
            vendor,
          });
          const output = await invoker.execute(
            input as unknown as RuleMigrationTaskInput,
            config as unknown as MigrateRuleConfig
          );

          return res.ok({ body: { output } });
        } catch (err) {
          logger.error(err);
          return res.customError({ body: err.message, statusCode: err.statusCode ?? 500 });
        }
      })
    );
};
