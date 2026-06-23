/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { i18n } from '@kbn/i18n';
import type {
  ESQLAstAllCommands,
  ESQLAstForkCommand,
  ESQLAstQueryExpression,
} from '@elastic/esql/types';
import { withAutoSuggest } from '../../definitions/utils/autocomplete/helpers';
import { newLineAndPipeCompleteItems, getCommandAutocompleteDefinitions } from '../complete_items';
import { pipePrecedesCurrentWord } from '../../definitions/utils/shared';
import type { ICommandCallbacks } from '../types';
import { type ISuggestionItem, type ICommandContext } from '../types';
import { esqlCommandRegistry } from '..';

export async function autocomplete(
  query: string,
  command: ESQLAstAllCommands,
  callbacks?: ICommandCallbacks,
  context?: ICommandContext,
  cursorPosition: number = query.length
): Promise<ISuggestionItem[]> {
  const forkCommand = command as ESQLAstForkCommand;

  const innerText = query.substring(0, cursorPosition);
  if (/FORK\s+$/i.test(innerText)) {
    return [newBranchSuggestion];
  }

  const activeBranch = getActiveBranch(forkCommand);
  const withinActiveBranch =
    activeBranch &&
    activeBranch.location.min <= innerText.length &&
    activeBranch.location.max >= innerText.length;

  if (!withinActiveBranch && /\)\s+$/i.test(innerText)) {
    const suggestions = [newBranchSuggestion];
    if (forkCommand.args.length > 0) {
      suggestions.push(...newLineAndPipeCompleteItems);
    }
    return suggestions;
  }

  // within a branch
  if (activeBranch?.commands.length === 0 || pipePrecedesCurrentWord(innerText)) {
    const forkCommands = esqlCommandRegistry
      .getProcessingCommandNames()
      .filter((cmd) => cmd !== 'fork');

    return getCommandAutocompleteDefinitions(forkCommands);
  }

  const subCommand = activeBranch?.commands[activeBranch.commands.length - 1];

  if (!subCommand) {
    return [];
  }

  const subCommandMethods = esqlCommandRegistry.getCommandMethods(subCommand.name);
  return (
    subCommandMethods?.autocomplete(innerText, subCommand, callbacks, context, cursorPosition) || []
  );
}

const newBranchSuggestion: ISuggestionItem = withAutoSuggest({
  kind: 'Issue',
  label: i18n.translate('kbn-esql-language.esql.suggestions.newBranchLabel', {
    defaultMessage: 'New branch',
  }),
  detail: i18n.translate('kbn-esql-language.esql.suggestions.newBranchDetail', {
    defaultMessage: 'Add a new branch to the fork',
  }),
  text: '($0)',
  asSnippet: true,
});

const getActiveBranch = (command: ESQLAstForkCommand): ESQLAstQueryExpression | undefined => {
  const finalBranch = command.args[command.args.length - 1];

  if (!finalBranch) {
    return;
  }

  return finalBranch.child;
};
