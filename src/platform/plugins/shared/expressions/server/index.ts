/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PluginInitializerContext } from '@kbn/core/server';
import type { ExpressionsServerPlugin } from './plugin';

export type { ExpressionsServerSetup, ExpressionsServerStart } from './plugin';

// Kibana Platform.
export type { ExpressionsServerPlugin as Plugin };
export async function plugin(initializerContext: PluginInitializerContext) {
  const { ExpressionsServerPlugin } = await import('./plugin');
  return new ExpressionsServerPlugin(initializerContext);
}

// Static exports.
export type {
  AnyExpressionFunctionDefinition,
  AnyExpressionTypeDefinition,
  ArgumentType,
  Datatable,
  DatatableColumn,
  DatatableColumnType,
  DatatableRow,
  ExecutionContainer,
  ExecutionContext,
  ExecutionParams,
  ExecutionState,
  ExecutorContainer,
  ExecutorState,
  ExpressionAstArgument,
  ExpressionAstExpression,
  ExpressionAstExpressionBuilder,
  ExpressionAstFunction,
  ExpressionAstFunctionBuilder,
  ExpressionAstNode,
  ExpressionFunctionDefinition,
  ExpressionFunctionDefinitions,
  ExpressionImage,
  ExpressionRenderDefinition,
  ExpressionTypeDefinition,
  ExpressionTypeStyle,
  ExpressionValue,
  ExpressionValueBoxed,
  ExpressionValueConverter,
  ExpressionValueError,
  ExpressionValueNum,
  ExpressionValueRender,
  ExpressionValueUnboxed,
  ExpressionValueFilter,
  Font,
  FontLabel,
  FontValue,
  IInterpreterRenderHandlers,
  InterpreterErrorType,
  IRegistry,
  KnownTypeToString,
  PointSeries,
  PointSeriesColumn,
  PointSeriesColumnName,
  PointSeriesColumns,
  PointSeriesRow,
  Range,
  SerializedDatatable,
  Style,
  TypeString,
  TypeToString,
  UnmappedTypeStrings,
  ExpressionValueRender as Render,
} from '../common';
export {
  buildExpression,
  buildExpressionFunction,
  type Execution,
  type Executor,
  ExpressionFunction,
  type ExpressionFunctionParameter,
  ExpressionRenderer,
  type ExpressionRendererRegistry,
  ExpressionType,
  FontStyle,
  FontWeight,
  format,
  formatExpression,
  type FunctionsRegistry,
  isExpressionAstBuilder,
  Overflow,
  parse,
  parseExpression,
  TextAlignment,
  TextDecoration,
  type TypesRegistry,
} from '../common';
