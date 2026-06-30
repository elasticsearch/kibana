/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { StartServicesAccessor } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';
import type { SecuritySolutionPluginStartDependencies } from '../../../plugin_contract';

export const GET_USER_DATA_INVENTORY_INLINE_TOOL_ID = 'security.get_user_data_inventory';

export const getUserDataInventorySchema = z.object({}).strict();

interface GetUserDataInventoryToolDeps {
  getStartServices: StartServicesAccessor<SecuritySolutionPluginStartDependencies>;
  logger: Logger;
}

export const createGetUserDataInventoryTool = ({
  getStartServices,
  logger,
}: GetUserDataInventoryToolDeps): BuiltinSkillBoundedTool<typeof getUserDataInventorySchema> => ({
  id: GET_USER_DATA_INVENTORY_INLINE_TOOL_ID,
  type: ToolType.builtin,
  description:
    'Returns Fleet integrations currently installed in this deployment. ' +
    'Each entry has a `package` field with the package name (e.g. "endpoint", "windows", "okta", "aws").',
  schema: getUserDataInventorySchema,
  handler: async (_input, { request }) => {
    try {
      const [, startPlugins] = await getStartServices();
      const { fleet } = startPlugins;

      if (!fleet) {
        logger.warn(
          'get_user_data_inventory: Fleet plugin is unavailable, returning empty inventory'
        );
        return {
          results: [
            {
              type: ToolResultType.other,
              data: { integrations: [] },
            },
          ],
        };
      }

      const packages = await fleet.packageService.asScoped(request).getPackages();
      const integrations = packages
        .filter((pkg) => pkg.status === 'installed')
        .map((pkg) => ({ package: pkg.name }));

      return {
        results: [
          {
            type: ToolResultType.other,
            data: { integrations },
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`get_user_data_inventory: Fleet API call failed: ${message}`);
      return {
        results: [
          {
            type: ToolResultType.error,
            data: {
              message: `Failed to fetch user data inventory: ${message}`,
            },
          },
        ],
      };
    }
  },
});
