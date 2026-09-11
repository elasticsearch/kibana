/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { Skills } from './menus/skills';
import { Sml } from './menus/sml';
import type { CommandDefinition } from './types';
import { CommandId } from './types';

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

export const useAvailableCommandDefinitions = (): readonly CommandDefinition[] =>
  sortedCommandDefinitions;
