/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Builder, Parser, WrappingPrettyPrinter, isIntegerLiteral } from '@elastic/esql';

/**
 * Caps an ES|QL query at `limit` rows: a trailing `LIMIT N` becomes `LIMIT min(N, limit)`, otherwise
 * `| LIMIT limit` is appended. A query the bundled parser rejects still gets a raw `| LIMIT`
 * appended, so Elasticsearch never runs it uncapped; invalid queries still fail there.
 */
export const applyLimit = (query: string, limit: number): string => {
  const { root, errors } = Parser.parse(query);
  if (errors.length > 0) {
    return `${query.trimEnd()}\n| LIMIT ${limit}`;
  }

  const lastCommand = root.commands[root.commands.length - 1];
  const lastArg = lastCommand?.args[0];

  if (lastCommand?.name === 'limit' && isIntegerLiteral(lastArg)) {
    lastCommand.args[0] = Builder.expression.literal.integer(
      Math.min(Number(lastArg.value), limit)
    );
  } else {
    root.commands.push(
      Builder.command({ name: 'limit', args: [Builder.expression.literal.integer(limit)] })
    );
  }

  return WrappingPrettyPrinter.print(root, { wrap: 80, pipeTab: '' });
};
