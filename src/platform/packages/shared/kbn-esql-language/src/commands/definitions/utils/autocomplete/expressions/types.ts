/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ESQLVariableType } from '@kbn/esql-types';
import type { ESQLAstAllCommands, ESQLSingleAstItem } from '@elastic/esql/types';
import type {
  ICommandCallbacks,
  ICommandContext,
  ISuggestionItem,
  Location,
} from '../../../../registry/types';
import type {
  FunctionDefinition,
  FunctionDefinitionTypes,
  FunctionParameter,
  FunctionParameterType,
  ParameterHint,
  Signature,
  SupportedDataType,
} from '../../../types';
import type { ExpressionPosition } from './position';

export type PreferredExpressionType = SupportedDataType | 'any';

export interface SuggestForExpressionParams {
  query: string;
  expressionRoot?: ESQLSingleAstItem;
  command: ESQLAstAllCommands;
  cursorPosition: number;
  location: Location;
  context?: ICommandContext;
  callbacks?: ICommandCallbacks;
  options?: ExpressionContextOptions;
}

export interface ExpressionContext {
  query: string;
  cursorPosition: number;
  innerText: string;
  expressionRoot?: ESQLSingleAstItem;
  position?: ExpressionPosition;
  location: Location;
  command: ESQLAstAllCommands;
  context?: ICommandContext;
  callbacks?: ICommandCallbacks;
  options: ExpressionContextOptions;
}

export interface ExpressionContextOptions {
  functionParameterContext?: FunctionParameterContext; // Set when cursor is inside a function arg; drives param-aware types, commas, and enum values
  preferredExpressionType?: PreferredExpressionType | PreferredExpressionType[]; // Expected return type(s) for the whole expression; filters/ranks operators and operands (e.g., boolean in WHERE)
  addSpaceAfterFirstField?: boolean; // Whether to append a space after inserting the first field of a top-level expression
  ignoredColumnsForEmptyExpression?: string[]; // Field names to exclude when suggesting for an empty expression
  isCursorFollowedByComma?: boolean; // Computed from the remaining query to avoid inserting an extra comma after the cursor
  isCursorFollowedByParens?: boolean; // Computed from the remaining query to avoid inserting an extra closing paren after the cursor
  suggestFields?: boolean; // Allow field/column suggestions when not inside a function parameter
  suggestFunctions?: boolean; // Allow function suggestions when not inside a function parameter
  controlType?: ESQLVariableType; // Type of control variable (??/?) to suggest in empty expressions
  addSpaceAfterOperator?: boolean; // Add a space after inserting operands or functions that follow an operator
  openSuggestions?: boolean; // Reopen the suggestions popover after applying a completion
  allowSubquery?: boolean; // Whether this expression context can suggest subquery operands
  getFunctionsToIgnore?: (
    functionParameterContext?: FunctionParameterContext
  ) => { names: string[]; allowedInsideFunctions?: Record<string, string[]> } | undefined; // Function suggestion exclusions, static or parameter-aware
  parentFunctionNames?: string[]; // Internal loop-prevention stack built by in-function recursion to hide the current parent from suggestions
}

export interface FunctionParameterContext {
  // Resolved signatures: validSignatures if non-empty, else functionDefinition.signatures
  signatures: Signature[];
  paramDefinitions: FunctionParameter[];
  // Flag to suggest comma after function parameters when more mandatory args exist
  hasMoreMandatoryArgs: boolean;
  // Function definition for function-specific parameter handling (e.g., CASE function)
  functionDefinition?: FunctionDefinition;
  firstArgumentType?: SupportedDataType | 'unknown';
  // Type of first value in repeating signatures, used to enforce type homogeneity
  firstValueType?: SupportedDataType | 'unknown';
  currentParameterIndex: number;
  validSignatures?: Signature[];
}

export interface PartialOperatorDetection {
  operatorName: string;
  textBeforeCursor?: string;
}

export interface ParamDefinition {
  type: FunctionParameterType;
  hint?: ParameterHint;
  fieldsOnly?: boolean;
  name?: string;
}

export interface FunctionDef {
  name: string;
  type: FunctionDefinitionTypes;
  signatures?: Array<{
    params: Array<{ type: FunctionParameterType; name?: string }>;
    minParams?: number;
    returnType?: string;
  }>;
}

export interface ExpressionComputedMetadata {
  innerText: string;
  position: ExpressionPosition;
  expressionType: SupportedDataType | 'unknown';
  isComplete: boolean;
  insideFunction: boolean;
}

export interface SuggestForExpressionResult {
  suggestions: ISuggestionItem[];
  computed: ExpressionComputedMetadata;
}
