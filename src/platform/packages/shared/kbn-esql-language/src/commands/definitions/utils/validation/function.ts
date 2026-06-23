/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { LicenseType } from '@kbn/licensing-types';
import {
  isColumn,
  isFunctionExpression,
  isIdentifier,
  isInlineCast,
  isParamLiteral,
} from '@elastic/esql';
import type {
  ESQLAst,
  ESQLAstAllCommands,
  ESQLAstItem,
  ESQLColumn,
  ESQLFunction,
  ESQLIdentifier,
} from '@elastic/esql/types';
import type { PromQLFunction } from '@elastic/esql';
import { errors, getFunctionDefinition } from '..';
import { isTypeConversionFunction } from '../functions';
import { FunctionDefinitionTypes } from '../../../../..';
import { getLocationInfo } from '../../../registry/location';
import { isTimeseriesSourceCommand } from '../timeseries_check';
import { Location } from '../../../registry/types';
import type { ICommandCallbacks, ICommandContext } from '../../../registry/types';
import type {
  ESQLMessage,
  FunctionDefinition,
  PromQLFunctionDefinition,
  PromQLFunctionParamType,
  PromQLSignature,
  SupportedDataType,
} from '../../types';
import { resolveArgumentTypes } from '../expressions';
import { getMatchingSignatures, getMaxMinNumberOfParams } from '../signatures';
import { ColumnValidator } from './column';

export function validateFunction({
  fn,
  parentCommand,
  ast,
  context,
  callbacks,
}: {
  fn: ESQLFunction;
  parentCommand: ESQLAstAllCommands;
  ast: ESQLAst;
  context: ICommandContext;
  callbacks: ICommandCallbacks;
}): ESQLMessage[] {
  const validator = new FunctionValidator(fn, parentCommand, ast, context, callbacks);

  validator.validate();

  return validator.messages;
}

class FunctionValidator {
  private readonly definition: FunctionDefinition | undefined;
  private readonly argTypes: (SupportedDataType | 'unknown')[] = [];
  private readonly argLiteralsMask: boolean[] = [];
  private readonly _messages: ESQLMessage[] = [];

  constructor(
    private readonly fn: ESQLFunction,
    private readonly parentCommand: ESQLAstAllCommands,
    private readonly ast: ESQLAst,
    private readonly context: ICommandContext,
    private readonly callbacks: ICommandCallbacks,
    private readonly parentAggFunction: string | undefined = undefined
  ) {
    this.definition = getFunctionDefinition(fn.name);

    const resolved = resolveArgumentTypes(this.fn.args, {
      columns: this.context.columns,
      unmappedFieldsStrategy: this.context.unmappedFieldsStrategy,
    });

    this.argTypes = resolved.argTypes;
    this.argLiteralsMask = resolved.literalMask;
  }

  /**
   * Runs validation checks on the function. Once validation is complete,
   * any errors found will be available in this.messages.
   */
  public validate(): void {
    if (this.definition && !this.licenseOk(this.definition.license)) {
      this.report(errors.licenseRequired(this.fn, this.definition.license!));
    }

    const nestedErrors = this.validateNestedFunctions();

    // if one or more child functions produced errors, report and stop validation
    if (nestedErrors.length) {
      this.report(...nestedErrors);
      return;
    }

    // skip validation for functions with names defined by a parameter
    // e.g. "... | EVAL ??param(..args)"
    if (isParamLiteral(this.fn.operator)) {
      return;
    }

    if (!this.definition) {
      this.report(errors.unknownFunction(this.fn));
      return;
    }

    if (this.parentAggFunction && this.definition.type === FunctionDefinitionTypes.AGG) {
      this.report(errors.nestedAggFunction(this.fn, this.parentAggFunction));
      return;
    }

    // Return early so the source-incompatibility error takes priority over the generic
    // "not allowed here" check below — the location may technically match, but the function
    // is invalid regardless because the pipeline source is TS.
    if (isTimeseriesSourceCommand(this.ast) && this.definition.tsdbCompatible === false) {
      this.report(errors.tsdbIncompatibleFunction(this.fn));
      return;
    }

    if (!this.allowedHere) {
      this.report(errors.functionNotAllowedHere(this.fn, this.location.displayName));
    }

    if (!this.hasValidArity) {
      this.report(errors.wrongNumberArgs(this.fn, this.definition));
      return;
    }

    this.validateArguments();
  }

  /** Resolves the `hint.kind` at a given positional index across all signatures. */
  private hintKindAt(position: number): string | undefined {
    for (const sig of this.definition?.signatures ?? []) {
      const kind = sig.params[position]?.hint?.kind;
      if (kind !== undefined) return kind;
    }
    return undefined;
  }

  private expectsAggregationAt(position: number): boolean {
    return this.hintKindAt(position) === 'aggregation';
  }

  private validateAggregationArg(arg: ESQLAstItem, rawArg: ESQLAstItem): void {
    const isAggCall =
      isFunctionExpression(arg) &&
      getFunctionDefinition(arg.name)?.type === FunctionDefinitionTypes.AGG;

    if (!isAggCall) {
      const location = Array.isArray(rawArg) ? this.fn.location : rawArg.location;
      this.report(errors.expectedAggregationArgument(this.fn, location));
    }

    if (isFunctionExpression(arg)) {
      const child = new FunctionValidator(
        arg,
        this.parentCommand,
        this.ast,
        this.context,
        this.callbacks
      );
      child.validate();
      this.report(...child.messages);
    }
  }

  /**
   * Validates the function arguments against the function definition
   */
  private validateArguments(): void {
    if (!this.definition) {
      return;
    }

    const S = getMatchingSignatures(
      this.definition.signatures,
      this.argTypes,
      this.argLiteralsMask,
      true
    );

    if (!S.length) {
      this.report(errors.noMatchingCallSignature(this.fn, this.definition, this.argTypes));
      return;
    }

    if (this.licenseOk(this.definition.license) && !S.some((sig) => this.licenseOk(sig.license))) {
      // The function itself is allowed at this license level, but none of the matching signatures are
      this.report(errors.licenseRequiredForSignature(this.fn, S[0]));
    }

    // Validate column arguments
    const columnsToValidate: Array<ESQLColumn | ESQLIdentifier> = [];
    const flatArgs = this.fn.args.flat();
    const skipUnsupportedOrConflictingColumnValidation = isTypeConversionFunction(
      this.definition.name
    );
    for (let i = 0; i < flatArgs.length; i++) {
      const arg = flatArgs[i];
      if (
        (isColumn(arg) || isIdentifier(arg)) &&
        !(this.definition.name === '=' && i === 0) && // don't validate left-hand side of assignment
        !(this.definition.name === 'as' && i === 1) // don't validate right-hand side of AS
      ) {
        columnsToValidate.push(arg);
      }
    }

    const columnMessages = columnsToValidate.flatMap((arg) => {
      return new ColumnValidator(arg, this.context, this.parentCommand.name, {
        skipUnsupportedOrConflictingColumnValidation,
      }).validate();
    });

    this.report(...columnMessages);
  }

  /**
   * Reports one or more validation messages
   */
  private report(...messages: ESQLMessage[]): void {
    this._messages.push(...messages);
  }

  public get messages(): ESQLMessage[] {
    return this._messages;
  }

  /**
   * Validates the nested functions within the current function.
   *
   * Positions marked `hint.kind === 'aggregation'` are handled
   * by `validateAggregationArg` and reported inline.
   * All other positions use the legacy path where nested-agg / license errors
   * collect in `nestedErrors` and short-circuit further parent validation.
   */
  private validateNestedFunctions(): ESQLMessage[] {
    const nestedErrors: ESQLMessage[] = [];

    const parentAggFunction = this.parentAggFunction
      ? this.parentAggFunction
      : this.definition?.type === FunctionDefinitionTypes.AGG
      ? this.definition?.name
      : undefined;

    const flatArgs = this.fn.args.flat();
    for (let i = 0; i < flatArgs.length; i++) {
      const rawArg = flatArgs[i];
      const arg = removeInlineCasts(rawArg);

      if (this.expectsAggregationAt(i)) {
        this.validateAggregationArg(arg, rawArg);
        continue;
      }

      if (isFunctionExpression(arg)) {
        const validator = new FunctionValidator(
          arg,
          this.parentCommand,
          this.ast,
          this.context,
          this.callbacks,
          parentAggFunction
        );
        validator.validate();
        nestedErrors.push(...validator.messages);
      }

      if (nestedErrors.length) {
        return nestedErrors;
      }
    }
    return nestedErrors;
  }

  /**
   * Checks if the current license level is sufficient the given license requirement
   */
  private licenseOk(license: LicenseType | undefined): boolean {
    const hasMinimumLicenseRequired = this.callbacks.hasMinimumLicenseRequired;
    if (hasMinimumLicenseRequired && license) {
      return hasMinimumLicenseRequired(license as LicenseType);
    }
    return true;
  }

  /**
   * Checks if the function is available in the current context
   */
  private get allowedHere(): boolean {
    const locationId = this.location.id;

    if (this.definition?.locationsAvailable.includes(locationId)) {
      return true;
    }

    // TIME_SERIES_AGG functions are also allowed at the top level of STATS
    // (not just nested inside agg functions) when the source command is TS
    if (
      this.definition?.locationsAvailable.includes(Location.STATS_TIMESERIES) &&
      locationId === Location.STATS &&
      isTimeseriesSourceCommand(this.ast)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Gets information about the location of the current function
   */
  private get location(): { displayName: string; id: Location } {
    return getLocationInfo(this.fn, this.parentCommand, this.ast, !!this.parentAggFunction);
  }

  /**
   * Checks if the function has a valid number of arguments
   */
  private get hasValidArity(): boolean {
    const { min, max } = getMaxMinNumberOfParams(this.definition!.signatures);
    const arity = this.fn.args.length;
    return arity >= min && arity <= max;
  }
}

function removeInlineCasts(arg: ESQLAstItem): ESQLAstItem {
  if (isInlineCast(arg)) {
    return removeInlineCasts(arg.value);
  }
  return arg;
}

// ----------------------------------------------------------------------------
// PromQL
// ----------------------------------------------------------------------------

/* Checks if the argument count is within the allowed min..max range. */
export function getPromqlFunctionArityCheck(
  fn: PromQLFunction,
  definition: PromQLFunctionDefinition
): { expected: string; actual: number } | null {
  if (fn.incomplete) {
    return null;
  }

  const minArgs = Math.min(
    ...definition.signatures.map(
      (sig) => sig.minParams ?? sig.params.filter(({ optional }) => !optional).length
    )
  );
  const maxArgs = Math.max(...definition.signatures.map(({ params }) => params.length));

  if (fn.args.length < minArgs || fn.args.length > maxArgs) {
    const expected = minArgs === maxArgs ? `${minArgs}` : `${minArgs}..${maxArgs}`;

    return { expected, actual: fn.args.length };
  }

  return null;
}

/* Treats instant_vector as compatible with range_vector (implicit range selector). */
function isPromqlParamTypeCompatible(
  expected: PromQLFunctionParamType,
  actual: PromQLFunctionParamType
): boolean {
  return expected === actual || (expected === 'range_vector' && actual === 'instant_vector');
}

/* Filters signatures compatible by arity and argument types. */
export function getPromqlMatchingSignatures(
  signatures: PromQLSignature[],
  argTypes: (PromQLFunctionParamType | undefined)[]
): PromQLSignature[] {
  if (argTypes.some((argType) => argType === undefined)) {
    return signatures;
  }

  const matchingArity = filterByMatchingArity(signatures, argTypes.length);

  return matchingArity.filter(({ params }) =>
    argTypes.every(
      (argType, idx) =>
        params[idx]?.type && argType && isPromqlParamTypeCompatible(params[idx]!.type, argType)
    )
  );
}

/* Finds the first argument position where the type does not match the signature. */
export function getPromqlSignatureMismatch(
  signatures: PromQLSignature[],
  argTypes: (PromQLFunctionParamType | undefined)[],
  argCount: number
): { required: string; mismatchIdx: number } | null {
  const matchingArity = filterByMatchingArity(signatures, argCount);

  if (matchingArity.length === 0) {
    return null;
  }

  const { params: refParams } = matchingArity[0];
  const required = refParams
    .slice(0, argCount)
    .map(({ name, type }) => `${name}=${type}`)
    .join(', ');
  const mismatchIdx = argTypes.findIndex(
    (argType, idx) =>
      !refParams[idx]?.type ||
      !argType ||
      !isPromqlParamTypeCompatible(refParams[idx]!.type, argType)
  );

  return mismatchIdx >= 0 ? { required, mismatchIdx } : null;
}

/* Filters signatures whose required/max param count includes argCount. */
function filterByMatchingArity(signatures: PromQLSignature[], argCount: number): PromQLSignature[] {
  return signatures.filter(
    (sig) =>
      argCount >= (sig.minParams ?? sig.params.filter(({ optional }) => !optional).length) &&
      argCount <= sig.params.length
  );
}
