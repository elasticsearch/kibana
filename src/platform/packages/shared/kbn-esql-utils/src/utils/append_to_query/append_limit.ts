/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { Parser } from '@elastic/esql';
import { Token } from 'antlr4';

export const appendLimitToQuery = (queryString: string, limit: number) => {
  const { tokens } = Parser.parse(queryString);

  let endOfQuery = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    // Stop if the token is not the end-of-file marker
    // and on the default channel (comments and whitespaces are on the hidden channel)
    if (token.type !== Token.EOF && token.channel === Token.DEFAULT_CHANNEL) {
      endOfQuery = token.stop;
      break;
    }
  }
  const trimmedQuery =
    endOfQuery >= 0 ? queryString.slice(0, endOfQuery + 1) : queryString.trimEnd();

  return `${trimmedQuery} | LIMIT ${limit}`;
};
