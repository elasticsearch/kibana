/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { IUiSettingsClient } from '@kbn/core/server';
import type { ToolAvailabilityResult } from '@kbn/agent-builder-server';
import { assertSignificantEventsAccess } from '../../routes/utils/assert_significant_events_access';
import type { StreamsServer } from '../../types';

export const createSignificantEventsAvailability = ({
  server,
  logger,
}: {
  server: StreamsServer;
  logger: Logger;
}) => ({
  cacheMode: 'space' as const,
  handler: async ({
    uiSettings,
  }: {
    uiSettings: IUiSettingsClient;
  }): Promise<ToolAvailabilityResult> => {
    try {
      await assertSignificantEventsAccess({
        server,
        licensing: server.licensing,
        uiSettingsClient: uiSettings,
      });
      return { status: 'available' };
    } catch (error) {
      if (error instanceof Error) {
        logger.debug(error.stack ?? error.message);
      } else {
        logger.debug(String(error));
      }
      return {
        status: 'unavailable',
        reason:
          error instanceof Error
            ? error.message
            : 'Significant events access is not available in the current context',
      };
    }
  },
});
