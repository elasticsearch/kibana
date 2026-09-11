/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Observable, Subscription } from 'rxjs';
import { BehaviorSubject, delay, filter, map, shareReplay, Subject } from 'rxjs';
import { defaults } from 'lodash';
import type { SerializableRecord, UnwrapObservable } from '@kbn/utility-types';
import type { Adapters } from '@kbn/inspector-plugin/public';
import { AbortReason } from '@kbn/kibana-utils-plugin/common';
import type { IExpressionLoaderParams } from './types';
import type { ExpressionAstExpression } from '../common';
import type { ExecutionContract } from '../common/execution/execution_contract';

import { ExpressionRenderHandler } from './render';
import { getExpressionsService } from './services';

type Data = unknown;

export class ExpressionLoader {
  data$: ReturnType<ExecutionContract['getData']>;
  update$: ExpressionRenderHandler['update$'];
  render$: ExpressionRenderHandler['render$'];
  events$: ExpressionRenderHandler['events$'];
  loading$: Observable<void>;

  private execution: ExecutionContract | undefined;
  private renderHandler: ExpressionRenderHandler;
  private dataSubject: Subject<UnwrapObservable<ExpressionLoader['data$']>>;
  private loadingSubject: Subject<boolean>;
  private data: Data;
  private params: IExpressionLoaderParams = {};
  private subscription?: Subscription;

  constructor(
    element: HTMLElement,
    expression?: string | ExpressionAstExpression,
    params?: IExpressionLoaderParams
  ) {
    this.dataSubject = new Subject();
    this.data$ = this.dataSubject.asObservable();

    this.loadingSubject = new BehaviorSubject<boolean>(false);
    // loading is a "hot" observable,
    // as loading$ could emit straight away in the constructor
    // and we want to notify subscribers about it, but all subscriptions will happen later
    this.loading$ = this.loadingSubject.asObservable().pipe(
      shareReplay(1),
      filter((_) => _ === true),
      map(() => void 0)
    );

    this.renderHandler = new ExpressionRenderHandler(element, {
      interactive: params?.interactive,
      onRenderError: params && params.onRenderError,
      renderMode: params?.renderMode,
      syncColors: params?.syncColors,
      syncTooltips: params?.syncTooltips,
      syncCursor: params?.syncCursor,
      hasCompatibleActions: params?.hasCompatibleActions,
      getCompatibleCellValueActions: params?.getCompatibleCellValueActions,
      executionContext: params?.executionContext,
    });
    this.render$ = this.renderHandler.render$;
    this.update$ = this.renderHandler.update$;
    this.events$ = this.renderHandler.events$;

    this.update$.subscribe((value) => {
      if (value) {
        const { newExpression, newParams } = value;
        this.update(newExpression, newParams);
      }
    });

    this.data$.subscribe(({ result }) => {
      this.render(result);
    });

    this.render$.subscribe(() => {
      this.loadingSubject.next(false);
    });

    this.setParams(params);

    if (expression && !params?.abortController?.signal.aborted) {
      this.loadingSubject.next(true);
      this.loadData(expression, this.params);
    }
  }

  destroy() {
    this.dataSubject.complete();
    this.loadingSubject.complete();
    this.renderHandler.destroy();
    this.cancel(AbortReason.CLEANUP);
    this.subscription?.unsubscribe();
  }

  cancel(reason?: AbortReason) {
    this.execution?.cancel(reason);
  }

  getExpression(): string | undefined {
    return this.execution?.getExpression();
  }

  getAst(): ExpressionAstExpression | undefined {
    return this.execution?.getAst();
  }

  getElement(): HTMLElement {
    return this.renderHandler.getElement();
  }

  inspect(): Adapters | undefined {
    return this.execution?.inspect() as Adapters;
  }

  update(expression?: string | ExpressionAstExpression, params?: IExpressionLoaderParams): void {
    this.setParams(params);

    if (params?.abortController?.signal.aborted) {
      return;
    }

    this.loadingSubject.next(true);
    if (expression) {
      this.loadData(expression, this.params);
    } else if (this.data) {
      this.render(this.data);
    }
  }

  private loadData = (
    expression: string | ExpressionAstExpression,
    params: IExpressionLoaderParams
  ) => {
    this.subscription?.unsubscribe();
    if (this.execution && this.execution.isPending) {
      this.execution.cancel(AbortReason.REPLACED);
    }
    this.setParams(params);
    this.execution = getExpressionsService().execute(expression, params.context, {
      searchContext: params.searchContext,
      variables: params.variables || {},
      inspectorAdapters: params.inspectorAdapters,
      searchSessionId: params.searchSessionId,
      debug: params.debug,
      syncColors: params.syncColors,
      syncCursor: params?.syncCursor,
      syncTooltips: params.syncTooltips,
      executionContext: params.executionContext,
      partial: params.partial,
      throttle: params.throttle,
      allowCache: params.allowCache,
    });
    this.subscription = this.execution
      .getData()
      // delaying until the next tick since we execute the expression in the constructor
      .pipe(delay(0))
      .subscribe((value) => this.dataSubject.next(value));
  };

  private render(data: Data): void {
    this.renderHandler.render(data as SerializableRecord, this.params.uiState);
  }

  private setParams(params?: IExpressionLoaderParams) {
    if (!params || !Object.keys(params).length) {
      return;
    }

    if (params.searchContext) {
      this.params.searchContext = defaults(
        {},
        params.searchContext,
        this.params.searchContext || {}
      );
    }
    if (params.uiState && this.params) {
      this.params.uiState = params.uiState;
    }
    if (params.variables && this.params) {
      this.params.variables = params.variables;
    }
    if (params.searchSessionId && this.params) {
      this.params.searchSessionId = params.searchSessionId;
    }
    this.params.syncColors = params.syncColors;
    this.params.syncCursor = params.syncCursor;
    this.params.syncTooltips = params.syncTooltips;
    this.params.debug = Boolean(params.debug);
    this.params.partial = Boolean(params.partial);
    this.params.throttle = Number(params.throttle ?? 1000);
    this.params.allowCache = params.allowCache;

    this.params.inspectorAdapters = (params.inspectorAdapters ||
      this.execution?.inspect()) as Adapters;

    this.params.executionContext = params.executionContext;
  }
}

export type IExpressionLoader = (
  element: HTMLElement,
  expression?: string | ExpressionAstExpression,
  params?: IExpressionLoaderParams
) => Promise<ExpressionLoader>;

export const loader: IExpressionLoader = async (element, expression?, params?) => {
  return new ExpressionLoader(element, expression, params);
};
