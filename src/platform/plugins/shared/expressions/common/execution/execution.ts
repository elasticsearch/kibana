/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import type { Logger } from '@kbn/logging';
import { isPromise } from '@kbn/std';
import type { ObservableLike, UnwrapObservable } from '@kbn/utility-types';
import { keys, last as lastOf, mapValues, reduce, zipObject } from 'lodash';
import type { Subscription } from 'rxjs';
import {
  catchError,
  combineLatest,
  defer,
  finalize,
  from,
  identity,
  isObservable,
  last,
  map,
  Observable,
  of,
  pluck,
  ReplaySubject,
  shareReplay,
  switchMap,
  takeWhile,
  tap,
  throwError,
  timer,
} from 'rxjs';
import { AbortReason } from '@kbn/kibana-utils-plugin/common';
import { AbortError, calculateObjectHash, now } from '@kbn/kibana-utils-plugin/common';
import type { Adapters } from '@kbn/inspector-plugin/common';
import type { Executor } from '../executor';
import type { ExecutionContainer } from './container';
import { createExecutionContainer } from './container';
import { createError } from '../util';
import type { ExpressionValueError } from '../expression_types/specs/error';
import { isExpressionValueError } from '../expression_types/specs/error';
import type {
  ExpressionAstArgument,
  ExpressionAstExpression,
  ExpressionAstFunction,
  ExpressionAstNode,
} from '../ast';
import { formatExpression, parse, parseExpression } from '../ast';
import type { DefaultInspectorAdapters, ExecutionContext } from './types';
import type { Datatable } from '../expression_types';
import { getType } from '../expression_types';
import type { ExpressionFunction, ExpressionFunctionParameter } from '../expression_functions';
import { getByAlias } from '../util/get_by_alias';
import { ExecutionContract } from './execution_contract';
import type { ExpressionExecutionParams } from '../service';
import { createDefaultInspectorAdapters } from '../util/create_default_inspector_adapters';

type UnwrapReturnType<Function extends (...args: any[]) => unknown> =
  ReturnType<Function> extends ObservableLike<unknown>
    ? UnwrapObservable<ReturnType<Function>>
    : Awaited<ReturnType<Function>>;

export interface FunctionCacheItem {
  value: unknown;
  time: number;
  sideEffectFn?: () => void;
}
/**
 * The result returned after an expression function execution.
 */
export interface ExecutionResult<Output> {
  /**
   * Partial result flag.
   */
  partial: boolean;

  /**
   * The expression function result.
   */
  result: Output;
}

const maxCacheSize = 1000;

const createAbortErrorValue = () =>
  createError({
    message: 'The expression was aborted.',
    name: 'AbortError',
  });

function markPartial<T>() {
  return (source: Observable<T>) =>
    new Observable<ExecutionResult<T>>((subscriber) => {
      let latest: ExecutionResult<T> | undefined;

      subscriber.add(
        source.subscribe({
          next: (result) => {
            latest = { result, partial: true };
            subscriber.next(latest);
          },
          error: (error) => subscriber.error(error),
          complete: () => {
            if (latest) {
              latest.partial = false;
            }

            subscriber.complete();
          },
        })
      );

      subscriber.add(() => {
        latest = undefined;
      });
    });
}

/**
 * RxJS' `throttle` operator does not emit the last value immediately when the source observable is completed.
 * Instead, it waits for the next throttle period to emit that.
 * It might cause delays until we get the final value, even though it is already there.
 * @see https://github.com/ReactiveX/rxjs/blob/master/src/internal/operators/throttle.ts#L121
 */
function throttle<T>(timeout: number) {
  return (source: Observable<T>): Observable<T> =>
    new Observable((subscriber) => {
      let latest: T | undefined;
      let hasValue = false;

      const emit = () => {
        if (hasValue) {
          subscriber.next(latest!);
          hasValue = false;
          latest = undefined;
        }
      };

      let throttled: Subscription | undefined;
      const timer$ = timer(0, timeout).pipe(
        takeWhile(() => hasValue),
        finalize(() => {
          subscriber.remove(throttled!);
          throttled = undefined;
        })
      );

      subscriber.add(
        source.subscribe({
          next: (value) => {
            latest = value;
            hasValue = true;

            if (!throttled) {
              throttled = timer$.subscribe(emit);
              subscriber.add(throttled);
            }
          },
          error: (error) => subscriber.error(error),
          complete: () => {
            emit();
            subscriber.complete();
          },
        })
      );

      subscriber.add(() => {
        hasValue = false;
        latest = undefined;
      });
    });
}

function takeUntilAborted<T>(signal: AbortSignal) {
  return (source: Observable<T>) =>
    new Observable<T>((subscriber) => {
      const throwAbortError = (e?: Event) => {
        const reason = (e?.target as AbortSignal)?.reason;
        // For CANCELED, let the chain continue so partial results can flow through.
        if (reason !== AbortReason.CANCELED) {
          subscriber.error(new AbortError());
        }
      };

      subscriber.add(source.subscribe(subscriber));
      subscriber.add(() => signal.removeEventListener('abort', throwAbortError));

      signal.addEventListener('abort', throwAbortError);
      if (signal.aborted) {
        throwAbortError();
      }
    });
}

export interface ExecutionParams {
  executor: Executor;
  ast?: ExpressionAstExpression;
  expression?: string;
  params: ExpressionExecutionParams;
}

export class Execution<
  Input = unknown,
  Output = unknown,
  InspectorAdapters extends Adapters = ExpressionExecutionParams['inspectorAdapters'] extends object
    ? ExpressionExecutionParams['inspectorAdapters']
    : DefaultInspectorAdapters
> {
  /**
   * Dynamic state of the execution.
   */
  public readonly state: ExecutionContainer<ExecutionResult<Output | ExpressionValueError>>;

  /**
   * Initial input of the execution.
   *
   * N.B. It is initialized to `null` rather than `undefined` for legacy reasons,
   * because in legacy interpreter it was set to `null` by default.
   */
  public input = null as unknown as Input;

  /**
   * Input of the started execution.
   */
  private input$ = new ReplaySubject<Input>(1);

  /**
   * Execution context - object that allows to do side-effects. Context is passed
   * to every function.
   */
  public readonly context: ExecutionContext<InspectorAdapters>;

  /**
   * AbortController to cancel this Execution.
   */
  private readonly abortController = new AbortController();

  /**
   * Whether .start() method has been called.
   */
  private hasStarted: boolean = false;

  /**
   * Future that tracks result or error of this execution.
   */
  public readonly result: Observable<ExecutionResult<Output | ExpressionValueError>>;

  /**
   * Keeping track of any child executions
   * Needed to cancel child executions in case parent execution is canceled
   * @internal
   */
  private readonly childExecutions: Execution[] = [];
  private cacheTimeout: number = 30000;

  /**
   * Contract is a public representation of `Execution` instances. Contract we
   * can return to other plugins for their consumption.
   */
  public readonly contract: ExecutionContract<Input, Output, InspectorAdapters>;

  public readonly expression: string;

  public get inspectorAdapters(): InspectorAdapters {
    return this.context.inspectorAdapters;
  }

  constructor(
    public readonly execution: ExecutionParams,
    private readonly logger?: Logger,
    private readonly functionCache: Map<string, FunctionCacheItem> = new Map()
  ) {
    const { executor } = execution;

    this.contract = new ExecutionContract<Input, Output, InspectorAdapters>(this);

    if (!execution.ast && !execution.expression) {
      throw new TypeError('Execution params should contain at least .ast or .expression key.');
    } else if (execution.ast && execution.expression) {
      throw new TypeError('Execution params cannot contain both .ast and .expression key.');
    }

    this.expression = execution.expression || formatExpression(execution.ast!);
    const ast = execution.ast || parseExpression(this.expression);

    this.state = createExecutionContainer({
      ...executor.state,
      state: 'not-started',
      ast,
    });

    const inspectorAdapters =
      (execution.params.inspectorAdapters as InspectorAdapters) || createDefaultInspectorAdapters();

    this.context = {
      getSearchContext: () => this.execution.params.searchContext || {},
      getSearchSessionId: () => execution.params.searchSessionId,
      getKibanaRequest: execution.params.kibanaRequest
        ? () => execution.params.kibanaRequest!
        : undefined,
      variables: execution.params.variables || {},
      allowCache: this.execution.params.allowCache,
      types: executor.getTypes(),
      abortSignal: this.abortController.signal,
      inspectorAdapters,
      logDatatable: (name: string, datatable: Datatable) => {
        inspectorAdapters.tables[name] = datatable;
      },
      isSyncColorsEnabled: () => execution.params.syncColors!,
      isSyncCursorEnabled: () => execution.params.syncCursor!,
      isSyncTooltipsEnabled: () => execution.params.syncTooltips!,
      ...execution.executor.context,
      getExecutionContext: () => execution.params.executionContext,
    };

    // Cancel children when this execution is aborted.
    // Uses queueMicrotask so the parent's error path completes before child
    // errors can re-enter the parent's chain.
    this.abortController.signal.addEventListener('abort', () => {
      queueMicrotask(() => {
        this.childExecutions.forEach((child) => child.cancel(this.abortController.signal.reason));
      });
    });

    this.result = this.input$.pipe(
      switchMap((input) =>
        this.invokeChain<Output>(this.state.get().ast.chain, input).pipe(
          takeUntilAborted(this.abortController.signal),
          markPartial(),
          this.execution.params.partial && this.execution.params.throttle
            ? throttle(this.execution.params.throttle)
            : identity
        )
      ),
      catchError((error) => {
        if (this.abortController.signal.aborted) {
          return of({ result: createAbortErrorValue(), partial: false });
        }

        return throwError(error);
      }),
      tap({
        next: (result) => {
          this.context.inspectorAdapters.expression?.logAST(this.state.get().ast);
          this.state.transitions.setResult(result);
        },
        error: (error) => this.state.transitions.setError(error),
      }),
      shareReplay(1)
    );
  }

  /**
   * Stop execution of expression.
   */
  cancel(reason?: AbortReason) {
    this.abortController.abort(reason);
  }

  /**
   * Call this method to start execution.
   *
   * N.B. `input` is initialized to `null` rather than `undefined` for legacy reasons,
   * because in legacy interpreter it was set to `null` by default.
   */
  start(
    input = null as unknown as Input,
    isSubExpression?: boolean
  ): Observable<ExecutionResult<Output | ExpressionValueError>> {
    if (this.hasStarted) throw new Error('Execution already started.');
    this.hasStarted = true;
    this.input = input;
    this.state.transitions.start();

    if (!isSubExpression) {
      this.context.inspectorAdapters.requests?.reset();
    }

    if (isObservable(input)) {
      (input as Observable<Input>).subscribe(this.input$);
    } else if (isPromise(input)) {
      from(input).subscribe(this.input$);
    } else {
      of(input).subscribe(this.input$);
    }

    return this.result;
  }

  invokeChain<ChainOutput = unknown>(
    [head, ...tail]: ExpressionAstFunction[],
    input: unknown
  ): Observable<ChainOutput | ExpressionValueError> {
    if (!head) {
      return of(input as ChainOutput);
    }

    return defer(() => {
      const { function: fnName, arguments: fnArgs } = head;
      const fn = getByAlias(this.state.get().functions, fnName, this.execution.params.namespace);

      if (!fn) {
        throw createError({
          name: 'fn not found',
          message: i18n.translate('expressions.execution.functionNotFound', {
            defaultMessage: `Function {fnName} could not be found.`,
            values: {
              fnName,
            },
          }),
        });
      }

      if (fn.disabled) {
        throw createError({
          name: 'fn is disabled',
          message: i18n.translate('expressions.execution.functionDisabled', {
            defaultMessage: `Function {fnName} is disabled.`,
            values: {
              fnName,
            },
          }),
        });
      }

      if (fn.deprecated) {
        this.logger?.warn(`Function '${fnName}' is deprecated`);
      }

      if (this.execution.params.debug) {
        head.debug = {
          input,
          args: {},
          duration: 0,
          fn: fn.name,
          success: true,
        };
      }

      const timeStart = this.execution.params.debug ? now() : 0;

      // `resolveArgs` returns an object because the arguments themselves might
      // actually have `then` or `subscribe` methods which would be treated as a `Promise`
      // or an `Observable` accordingly.
      return this.resolveArgs(fn, input, fnArgs).pipe(
        switchMap((resolvedArgs) => {
          const args$ = isExpressionValueError(resolvedArgs)
            ? throwError(resolvedArgs.error)
            : of(resolvedArgs);

          return args$.pipe(
            tap((args) => this.execution.params.debug && Object.assign(head.debug ?? {}, { args })),
            switchMap((args) => this.invokeFunction(fn, input, args)),
            this.execution.params.partial ? identity : last(),
            switchMap((output) => (getType(output) === 'error' ? throwError(output) : of(output))),
            tap(
              (output) => this.execution.params.debug && Object.assign(head.debug ?? {}, { output })
            ),
            switchMap((output) => this.invokeChain<ChainOutput>(tail, output)),
            catchError((rawError) => {
              const error = createError(rawError);
              error.error.message = `[${fnName}] > ${error.error.message}`;

              if (this.execution.params.debug) {
                Object.assign(head.debug ?? {}, { error, rawError, success: false });
              }

              return of(error);
            })
          );
        }),
        finalize(() => {
          if (this.execution.params.debug) {
            Object.assign(head.debug ?? {}, { duration: now() - timeStart });
          }
        })
      );
    }).pipe(catchError((error) => of(error)));
  }

  invokeFunction<Fn extends ExpressionFunction>(
    fn: Fn,
    input: unknown,
    args: Record<string, unknown>
  ): Observable<UnwrapReturnType<Fn['fn']>> {
    let hash: string | undefined;
    let lastValue: unknown;
    let completionFlag = false;

    return of(input)
      .pipe(
        map((currentInput) => this.cast(currentInput, fn.inputTypes)),
        switchMap((normalizedInput) => {
          const {
            hash: fnHash,
            value: cachedValue,
            valid: cacheValid,
          } = this.#canUseCachedResult(fn, normalizedInput, args);
          hash = fnHash;
          if (cacheValid) {
            cachedValue.sideEffectFn?.();
            return of(cachedValue.value);
          }
          const output = fn.fn(normalizedInput, args, this.context);

          return of(output);
        }),
        switchMap((fnResult) => {
          return (
            isObservable(fnResult) ? fnResult : from(isPromise(fnResult) ? fnResult : [fnResult])
          ) as Observable<UnwrapReturnType<Fn['fn']>>;
        }),
        map((output) => {
          // Validate that the function returned the type it said it would.
          // This isn't required, but it keeps function developers honest.
          const returnType = getType(output);
          const expectedType = fn.type;
          if (expectedType && returnType !== expectedType) {
            throw new Error(
              `Function '${fn.name}' should return '${expectedType}',` +
                ` actually returned '${returnType}'`
            );
          }

          // Validate the function output against the type definition's validate function.
          const type = this.context.types[fn.type];
          if (type && type.validate) {
            try {
              type.validate(output);
            } catch (e) {
              throw new Error(`Output of '${fn.name}' is not a valid type '${fn.type}': ${e}`);
            }
          }

          lastValue = output;

          return output;
        }),
        finalize(() => {
          if (completionFlag && hash) {
            const sideEffectResult = this.#getSideEffectFn(fn, args);
            while (this.functionCache.size >= maxCacheSize) {
              // @ts-expect-error upgrade typescript v5.9.3
              this.functionCache.delete(this.functionCache.keys().next().value);
            }
            this.functionCache.set(hash, {
              value: lastValue,
              time: Date.now(),
              sideEffectFn: sideEffectResult,
            });
          }
        })
      )
      .pipe(
        tap({
          complete: () => (completionFlag = true), // Set flag true only on successful completion
        })
      );
  }

  public cast<Type = unknown>(value: unknown, toTypeNames?: string[]): Type {
    // If you don't give us anything to cast to, you'll get your input back
    if (!toTypeNames?.length) {
      return value as Type;
    }

    // No need to cast if node is already one of the valid types
    const fromTypeName = getType(value);
    if (toTypeNames.includes(fromTypeName)) {
      return value as Type;
    }

    const { types } = this.state.get();
    const fromTypeDef = types[fromTypeName];

    for (const toTypeName of toTypeNames) {
      // First check if the current type can cast to this type
      if (fromTypeDef?.castsTo(toTypeName)) {
        return fromTypeDef.to(value, toTypeName, types);
      }

      // If that isn't possible, check if this type can cast from the current type
      const toTypeDef = types[toTypeName];
      if (toTypeDef?.castsFrom(fromTypeName)) {
        return toTypeDef.from(value, types);
      }
    }

    throw createError({
      name: 'invalid value',
      message: `Can not cast '${fromTypeName}' to any of '${toTypeNames.join(', ')}'`,
    });
  }

  validate<Type = unknown>(value: Type, argDef: ExpressionFunctionParameter<Type>): void {
    if (argDef.options?.length && !argDef.options.includes(value)) {
      const message = `Value '${value}' is not among the allowed options for argument '${
        argDef.name
      }': '${argDef.options.join("', '")}'`;

      if (argDef.strict) {
        throw createError({
          message,
          name: 'invalid argument',
        });
      }

      this.logger?.warn(message);
    }
  }

  // Processes the multi-valued AST argument values into arguments that can be passed to the function
  resolveArgs<Fn extends ExpressionFunction>(
    fnDef: Fn,
    input: unknown,
    argAsts: Record<string, ExpressionAstArgument[]>
  ): Observable<Record<string, unknown> | ExpressionValueError> {
    return defer(() => {
      const { args: argDefs } = fnDef;

      // Use the non-alias name from the argument definition
      const dealiasedArgAsts = reduce(
        argAsts,
        (acc, argAst, argName) => {
          const argDef = getByAlias(argDefs, argName);
          if (!argDef) {
            throw createError({
              name: 'unknown argument',
              message: `Unknown argument '${argName}' passed to function '${fnDef.name}'`,
            });
          }
          if (argDef.deprecated && !acc[argDef.name]) {
            this.logger?.warn(`Argument '${argName}' is deprecated in function '${fnDef.name}'`);
          }
          acc[argDef.name] = (acc[argDef.name] || []).concat(argAst);
          return acc;
        },
        {} as Record<string, ExpressionAstArgument[]>
      );

      // Check for missing required arguments.
      for (const { default: argDefault, name, required } of Object.values(argDefs)) {
        if (!(name in dealiasedArgAsts) && typeof argDefault !== 'undefined') {
          dealiasedArgAsts[name] = [parse(argDefault as string, 'argument')];
        }

        if (!required || name in dealiasedArgAsts) {
          continue;
        }

        throw createError({
          name: 'missing argument',
          message: `${fnDef.name} requires the "${name}" argument`,
        });
      }

      // Create the functions to resolve the argument ASTs into values
      // These are what are passed to the actual functions if you opt out of resolving
      const resolveArgFns = mapValues(dealiasedArgAsts, (asts, argName) =>
        asts.map(
          (item) =>
            (subInput = input) =>
              this.interpret(item, subInput).pipe(
                pluck('result'),
                switchMap((output) => {
                  if (isExpressionValueError(output)) {
                    return of(output);
                  }

                  return of(output).pipe(
                    map((value) => this.cast(value, argDefs[argName].types)),
                    tap((value) => this.validate(value, argDefs[argName])),
                    catchError((error) => of(error))
                  );
                })
              )
        )
      );

      const argNames = keys(resolveArgFns);

      if (!argNames.length) {
        return from([{}]);
      }

      return combineLatest(
        argNames.map((argName) => {
          const interpretFns = resolveArgFns[argName];

          // `combineLatest` does not emit a value on an empty collection
          // @see https://github.com/ReactiveX/RxSwift/issues/1879
          if (!interpretFns.length) {
            return of([]);
          }

          return argDefs[argName].resolve
            ? combineLatest(interpretFns.map((fn) => fn())).pipe(
                map((values) => values.find(isExpressionValueError) ?? values)
              )
            : of(interpretFns);
        })
      ).pipe(
        map(
          (values) =>
            values.find(isExpressionValueError) ??
            mapValues(
              // Return an object here because the arguments themselves might actually have a 'then'
              // function which would be treated as a promise
              zipObject(argNames, values as unknown[][]),
              // Just return the last unless the argument definition allows multiple
              (argValues, argName) => (argDefs[argName].multi ? argValues : lastOf(argValues))
            )
        )
      );
    }).pipe(catchError((error) => of(error)));
  }

  interpret<T>(ast: ExpressionAstNode, input: T): Observable<ExecutionResult<unknown>> {
    switch (getType(ast)) {
      case 'expression':
        const execution = this.execution.executor.createExecution(ast as ExpressionAstExpression, {
          ...this.execution.params,
          variables: this.context.variables,
        });
        this.childExecutions.push(execution);
        return execution.start(input, true);
      case 'string':
      case 'number':
      case 'null':
      case 'boolean':
        return of({ result: ast, partial: false });
      default:
        return throwError(new Error(`Unknown AST object: ${JSON.stringify(ast)}`));
    }
  }

  #canUseCachedResult<Fn extends ExpressionFunction>(
    fn: Fn,
    input: unknown,
    args: Record<string, unknown>
  ):
    | { hash: string; value: FunctionCacheItem; valid: boolean }
    | { hash: string | undefined; value: undefined; valid: false } {
    if (!fn.allowCache || !this.context.allowCache) {
      return { hash: undefined, value: undefined, valid: false };
    }
    const hash = calculateObjectHash([fn.name, input, args, this.context.getSearchContext()]);

    const cached = this.functionCache.get(hash);
    if (hash && cached) {
      return {
        hash,
        value: cached,
        valid: Boolean(cached && Date.now() - cached.time < this.cacheTimeout),
      };
    }
    return {
      hash,
      value: undefined,
      valid: false,
    };
  }

  #getSideEffectFn<Fn extends ExpressionFunction>(
    fn: Fn,
    args: Record<string, unknown>
  ): undefined | (() => void) {
    if (!fn.allowCache || typeof fn.allowCache === 'boolean') {
      return undefined;
    }
    return fn.allowCache.withSideEffects?.(args, this.context);
  }
}
