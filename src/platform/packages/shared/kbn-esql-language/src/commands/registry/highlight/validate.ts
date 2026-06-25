/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isMap } from '@elastic/esql';
import type { ESQLAstAllCommands, ESQLAst, ESQLAstHighlightCommand } from '@elastic/esql/types';
import type { ICommandContext, ICommandCallbacks } from '../types';
import { validateCommandArguments } from '../../definitions/utils/validation';
import { validateMap } from '../../definitions/utils/validation/map';
import type { ESQLMessage } from '../../definitions/types';

// `pre_tags`/`post_tags` accept `keyword | keyword[]`; using type=[keyword] still validates
// list values because getExpressionType delegates a list's type to its first element.
const HIGHLIGHT_MAP_DEFINITION =
  "{name='pre_tags', description='HTML tag to insert before highlighted text', type=[keyword]}" +
  "{name='post_tags', description='HTML tag to insert after highlighted text', type=[keyword]}" +
  "{name='number_of_fragments', description='Maximum number of fragments to return', type=[integer]}" +
  "{name='fragment_size', description='Size of each fragment in characters', type=[integer]}" +
  "{name='encoder', description='Encoding for highlighted text', type=[keyword]}" +
  "{name='boundary_scanner', description='How to split fragments', type=[keyword]}" +
  "{name='boundary_scanner_locale', description='Locale for boundary scanning', type=[keyword]}" +
  "{name='boundary_chars', description='Characters used as boundary markers', type=[keyword]}" +
  "{name='boundary_max_scan', description='Maximum characters scanned for a boundary', type=[integer]}" +
  "{name='order', description='Order of fragments', type=[keyword]}" +
  "{name='no_match_size', description='Characters to return when there is no match', type=[integer]}" +
  "{name='max_analyzed_offset', description='Maximum character offset to analyze', type=[integer]}" +
  "{name='phrase_limit', description='Maximum number of phrases to examine', type=[integer]}";

export const validate = (
  command: ESQLAstAllCommands,
  ast: ESQLAst,
  context?: ICommandContext,
  callbacks?: ICommandCallbacks
): ESQLMessage[] => {
  const messages: ESQLMessage[] = [];

  const { namedParameters } = command as ESQLAstHighlightCommand;

  if (namedParameters && !Array.isArray(namedParameters) && isMap(namedParameters)) {
    const mapError = validateMap(namedParameters, HIGHLIGHT_MAP_DEFINITION);
    if (mapError) {
      messages.push(mapError);
    }
  }

  messages.push(...validateCommandArguments(command, ast, context, callbacks));

  return messages;
};
