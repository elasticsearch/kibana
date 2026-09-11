/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { CharStreams, CommonTokenStream } from 'antlr4';

import EqlLexer from './parser/eql_lexer';
import EqlParser from './parser/eql_parser';
import { CollectingErrorListener } from './error_listener';

export interface AgentConditionSyntaxError {
  /** 1-based line number reported by ANTLR. */
  line: number;
  /** 0-based column number reported by ANTLR. Monaco consumers add +1. */
  column: number;
  message: string;
}

/**
 * Validate an Elastic Agent condition expression for syntax errors.
 *
 * Returns an empty array for valid expressions or for empty/whitespace/undefined
 * input (the agent treats an absent `condition` as "no condition" — this matches).
 */
export const validateAgentConditionExpression = (
  expression: string | undefined
): AgentConditionSyntaxError[] => {
  if (typeof expression !== 'string' || !expression.trim()) return [];

  const listener = new CollectingErrorListener();

  const inputStream = CharStreams.fromString(expression);
  const lexer = new EqlLexer(inputStream);
  // Remove default std error output
  lexer.removeErrorListeners();
  lexer.addErrorListener(listener);

  const tokenStream = new CommonTokenStream(lexer);
  const parser = new EqlParser(tokenStream);
  // Remove default std error output
  parser.removeErrorListeners();
  parser.addErrorListener(listener);

  parser.expList();

  return listener.getErrors();
};
