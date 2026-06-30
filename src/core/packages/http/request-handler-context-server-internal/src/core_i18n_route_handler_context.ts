/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import type { TranslateArguments } from '@kbn/i18n';
import type {
  I18nRequestHandlerContext,
  I18nServiceStart,
  RequestI18nClient,
} from '@kbn/core-i18n-server';

/**
 * The {@link I18nRequestHandlerContext} implementation.
 * @internal
 */
export class CoreI18nRouteHandlerContext implements I18nRequestHandlerContext {
  #client?: RequestI18nClient;

  constructor(
    private readonly i18nStart: I18nServiceStart,
    private readonly request: KibanaRequest
  ) {}

  private get client(): RequestI18nClient {
    if (this.#client == null) {
      this.#client = this.i18nStart.asScopedToRequest(this.request);
    }
    return this.#client;
  }

  public getLocale(): Promise<string> {
    return this.client.getLocale();
  }

  public translate(id: string, args: TranslateArguments): Promise<string> {
    return this.client.translate(id, args);
  }

  public formatList(
    type: 'conjunction' | 'disjunction' | 'unit',
    value: string[]
  ): Promise<string> {
    return this.client.formatList(type, value);
  }
}
