/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BuiltInAgentDefinition } from '@kbn/agent-builder-server/agents';
import instructions from './instructions/judge.md.text';
import { SIGNIFICANT_EVENTS_DISCOVERY_TOOL_IDS } from './constants';
import type { StreamsServer } from '../../../types';
import { getSignificantEventsAvailability } from '../../../routes/utils/assert_significant_events_access';

export const SIGEVENTS_JUDGE_AGENT_ID = 'platform.streams.significant-events.discovery.judge';

export const createSigEventsJudgeAgent = ({
  server,
}: {
  server: StreamsServer;
}): BuiltInAgentDefinition =>
  ({
    id: SIGEVENTS_JUDGE_AGENT_ID,
    name: 'Significant Events Discovery Judge',
    description:
      'Reviews proposed discoveries and decides whether to promote, acknowledge, or demote a significant event.',
    labels: ['observability', 'streams', 'significant-events', 'discovery', 'judge'],
    avatar_icon: 'logoElastic',
    availability: {
      cacheMode: 'space',
      handler: async (context) => {
        const availability = await getSignificantEventsAvailability({
          server,
          licensing: server.licensing,
          uiSettingsClient: context.uiSettings,
        });

        return availability.available
          ? { status: 'available' }
          : { status: 'unavailable', reason: availability.reason };
      },
    },
    configuration: {
      instructions,
      tools: [
        {
          tool_ids: [...SIGNIFICANT_EVENTS_DISCOVERY_TOOL_IDS],
        },
      ],
    },
  } as const);
