/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentBuilderPluginStart } from '@kbn/agent-builder-server';
import type { Logger } from '@kbn/core/server';
import type { MemoryToolsOptions } from '../tools/memory';
import { createSigEventsMemorySkill } from './significant_events_memory_skill';
import {
  createMemorySynthesisSkill,
  createMemoryConsolidationSkill,
  createConversationScraperSkill,
} from './memory';

const MEMORY_SKILL_FACTORIES = [
  { id: 'significant-events-memory', create: createSigEventsMemorySkill },
  { id: 'streams-memory-synthesis', create: createMemorySynthesisSkill },
  { id: 'streams-memory-consolidation', create: createMemoryConsolidationSkill },
  { id: 'streams-conversation-scraper', create: createConversationScraperSkill },
] as const;

export const registerStreamsMemoryAgentBuilder = async ({
  agentBuilder,
  memoryToolsOptions,
  logger,
  isMemoryEnabled,
}: {
  agentBuilder: AgentBuilderPluginStart;
  memoryToolsOptions: MemoryToolsOptions;
  logger: Logger;
  isMemoryEnabled: () => Promise<boolean>;
}): Promise<{
  onMemoryEnabled: () => Promise<void>;
}> => {
  let memorySkillsRegistered = false;

  const ensureMemorySkillsRegistered = async () => {
    if (memorySkillsRegistered || !(await isMemoryEnabled())) {
      return;
    }

    const results = await Promise.allSettled(
      MEMORY_SKILL_FACTORIES.map(async ({ id, create }) => {
        await agentBuilder.skills.register(create(memoryToolsOptions));
        return id;
      })
    );

    const registered: string[] = [];
    const failed: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const skillId = MEMORY_SKILL_FACTORIES[i].id;
      if (result.status === 'fulfilled') {
        registered.push(skillId);
      } else {
        failed.push(skillId);
        logger.error(
          `Failed to register streams memory skill "${skillId}": ${
            result.reason instanceof Error ? result.reason.message : String(result.reason)
          }`
        );
      }
    }

    if (registered.length === MEMORY_SKILL_FACTORIES.length) {
      memorySkillsRegistered = true;
      logger.info(
        'Streams memory skills registered (streams.significantEventsMemoryEnabled is enabled)'
      );
    } else {
      logger.warn(
        `Streams memory skills partially registered (${registered.length}/${MEMORY_SKILL_FACTORIES.length}). ` +
          `Registered: [${registered.join(', ')}]. Failed: [${failed.join(', ')}].`
      );
    }
  };

  await ensureMemorySkillsRegistered();

  return {
    onMemoryEnabled: ensureMemorySkillsRegistered,
  };
};
