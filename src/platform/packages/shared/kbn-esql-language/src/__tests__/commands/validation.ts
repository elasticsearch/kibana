/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Parser } from '@elastic/esql';
import type { ESQLCommand } from '@elastic/esql/types';
import type { ESQLMessage } from '../../commands/definitions/types';
import type { ESQLColumnData } from '../../commands/registry/types';
import { mockContext } from './context_fixtures';
/**
 * This function is used to assert that a query produces the expected errors.
 *
 * @param query The query to test
 * @param expectedErrors The expected error messages or warnings
 * @param context The context to use for validation
 * @param commandName The name of the command to test
 */
export const expectErrors = (
  query: string,
  expectedErrors: string[],
  context = mockContext,
  commandName: string,
  validate: (
    arg0: ESQLCommand,
    arg1: ESQLCommand[],
    arg2: {
      columns: Map<string, ESQLColumnData>;
    }
  ) => ESQLMessage[]
) => {
  const { root } = Parser.parse(query);
  const command = root.commands.find((cmd) => cmd.name === commandName.toLowerCase());
  if (!command) {
    throw new Error(`${commandName.toUpperCase()} command not found in the parsed query`);
  }
  const result = validate(command, root.commands, context);

  const errors: string[] = [];
  result.forEach((error) => {
    errors.push(error.text);
  });
  expect(errors).toEqual(expectedErrors);
};
