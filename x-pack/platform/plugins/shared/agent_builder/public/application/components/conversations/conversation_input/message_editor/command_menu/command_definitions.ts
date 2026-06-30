/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import { Skills } from './menus/skills';
import { Sml } from './menus/sml';
import type { CommandDefinition } from './types';
import { CommandId } from './types';
import { useContextEngineEnabled } from '../../../../../hooks/use_context_engine_enabled';
import { useExperimentalFeatures } from '../../../../../hooks/use_experimental_features';

const semanticKnowledgeCommandName = i18n.translate(
  'xpack.agentBuilder.conversationInput.commandMenu.semanticKnowledgeCommandName',
  { defaultMessage: 'Semantic knowledge' }
);

// When adding a new command, also add its data prefetch hook to use_command_menu_prefetch.ts
const COMMAND_DEFINITIONS: readonly CommandDefinition[] = [
  { id: CommandId.Skill, scheme: 'skill', sequence: '/', name: 'Skill', menuComponent: Skills },
  {
    id: CommandId.Sml,
    scheme: 'sml',
    sequence: '@',
    name: semanticKnowledgeCommandName,
    menuComponent: Sml,
    experimental: true,
  },
];

// Sorted once at module load — longest sequence first for greedy matching
export const sortedCommandDefinitions = Array.from(COMMAND_DEFINITIONS).sort(
  (a, b) => b.sequence.length - a.sequence.length
);

export const getCommandDefinition = (commandId: string) => {
  const commandDefinition = sortedCommandDefinitions.find((c) => c.id === commandId);
  return commandDefinition;
};

export const getCommandDefinitionByScheme = (scheme: string) => {
  const commandDefinition = sortedCommandDefinitions.find((c) => c.scheme === scheme);
  return commandDefinition;
};

/**
 * Returns the list of command definitions available based on feature flags.
 * The `/` skill command is always available (GA).
 * The `@` SML command lives inside Agent Builder, so it requires both the
 * Agent Builder experimental flag and the dedicated Context Engine flag.
 */
export const useAvailableCommandDefinitions = (): readonly CommandDefinition[] => {
  const isContextEngineEnabled = useContextEngineEnabled();
  const isExperimentalEnabled = useExperimentalFeatures();
  const isSmlEnabled = isContextEngineEnabled && isExperimentalEnabled;

  return useMemo(() => {
    if (isSmlEnabled) {
      return sortedCommandDefinitions;
    }
    return sortedCommandDefinitions.filter((c) => !c.experimental);
  }, [isSmlEnabled]);
};
