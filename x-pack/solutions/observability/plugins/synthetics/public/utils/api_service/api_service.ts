/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isRight } from 'fp-ts/Either';
import { formatErrors } from '@kbn/securitysolution-io-ts-utils';
import { isZod } from '@kbn/zod';
import type { HttpFetchOptions, HttpFetchQuery, HttpSetup } from '@kbn/core/public';
import type { AddInspectorRequest } from '@kbn/observability-shared-plugin/public';
import { FETCH_STATUS } from '@kbn/observability-shared-plugin/public';
import type { InspectorRequestProps } from '@kbn/observability-shared-plugin/public/contexts/inspector/inspector_context';
import { addSpaceIdToPath } from '@kbn/core-spaces-common';
import { kibanaService } from '../kibana_service';
import { formatZodErrors } from '../../../common/runtime_types/zod/format_errors';

type Params = HttpFetchQuery & { version?: string; spaceId?: string };

type FetchOptions = HttpFetchOptions & { asResponse?: true };

class ApiService {
  private static instance: ApiService;
  private _http!: HttpSetup;
  private _addInspectorRequest!: AddInspectorRequest;

  public get http() {
    return this._http;
  }

  public set http(httpSetup: HttpSetup) {
    this._http = httpSetup;
  }

  public get addInspectorRequest() {
    return this._addInspectorRequest;
  }

  public set addInspectorRequest(addInspectorRequest: AddInspectorRequest) {
    this._addInspectorRequest = addInspectorRequest;
  }

  private constructor() {}

  static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }

    return ApiService.instance;
  }

  private parseResponse<T>(response: Awaited<T>, apiUrl: string, decodeType?: any): T {
    if (!decodeType) {
      return response;
    }

    if (isZod(decodeType)) {
      const decoded = decodeType.safeParse(response);
      if (decoded.success) {
        return decoded.data as T;
      }
      // eslint-disable-next-line no-console
      console.error(
        'API %s is not returning expected response, %s for response',
        apiUrl,
        formatZodErrors(decoded.error, { input: response }).toString(),
        apiUrl,
        response
      );
      return response;
    }

    // io-ts path kept until remaining callers migrate (Phase 5).
    const decoded = decodeType.decode(response);
    if (isRight(decoded)) {
      return decoded.right as T;
    }
    // eslint-disable-next-line no-console
    console.error(
      'API %s is not returning expected response, %s for response',
      apiUrl,
      formatErrors(decoded.left).toString(),
      apiUrl,
      response
    );
    return response;
  }

  private getCpsHeaders(): Record<string, string> | undefined {
    const projectRouting = kibanaService.startPlugins?.cps?.cpsManager?.getProjectRouting();
    return projectRouting ? { 'x-project-routing': projectRouting } : undefined;
  }

  private withCpsHeaders(options?: FetchOptions): FetchOptions | undefined {
    const cpsHeaders = this.getCpsHeaders();
    if (!cpsHeaders) {
      return options;
    }
    return {
      ...options,
      headers: {
        ...options?.headers,
        ...cpsHeaders,
      },
    };
  }

  private parseApiUrl(apiUrl: string, spaceId?: string) {
    // `*` is the all-spaces marker used by saved object `namespaces`; it is not
    // a real space ID we can route to, so callers should fall back to the
    // active space rather than rewriting the URL.
    if (spaceId && spaceId !== '*') {
      const basePath = kibanaService.coreSetup.http.basePath;
      // `addSpaceIdToPath` already produces a basePath-only URL (no `/s/<id>`
      // segment) for the default space, so it works for both default and
      // named spaces. Returning here lets us drop the basePath prefix Kibana
      // would otherwise add for the active space, which would mis-route a
      // cross-space request.
      return addSpaceIdToPath(basePath.serverBasePath, spaceId, apiUrl);
    }
    return apiUrl;
  }

  private shouldSkipBasePath(spaceId?: string) {
    // Only opt out of the http client's basePath logic when we have actually
    // rewritten the URL ourselves (i.e. `parseApiUrl` produced a fully
    // qualified path including the basePath).
    return Boolean(spaceId && spaceId !== '*');
  }

  public async get<T>(
    apiUrl: string,
    params: Params = {},
    decodeType?: any,
    options?: FetchOptions
  ) {
    const { version, spaceId, ...queryParams } = params;
    const response = await this._http!.fetch<T>({
      path: this.parseApiUrl(apiUrl, spaceId),
      query: queryParams,
      version,
      ...this.withCpsHeaders(options),
      ...(this.shouldSkipBasePath(spaceId) ? { prependBasePath: false } : {}),
    });

    this.addInspectorRequest?.({
      data: response as InspectorRequestProps,
      status: FETCH_STATUS.SUCCESS,
      loading: false,
    });

    return this.parseResponse(response, apiUrl, decodeType);
  }

  public async post<T>(apiUrl: string, data?: any, decodeType?: any, params: Params = {}) {
    const { version, spaceId, ...queryParams } = params;

    const response = await this._http!.post<T>(this.parseApiUrl(apiUrl, spaceId), {
      method: 'POST',
      body: JSON.stringify(data),
      query: queryParams,
      version,
      ...this.withCpsHeaders(),
      ...(this.shouldSkipBasePath(spaceId) ? { prependBasePath: false } : {}),
    });

    this.addInspectorRequest?.({
      data: response as InspectorRequestProps,
      status: FETCH_STATUS.SUCCESS,
      loading: false,
    });

    return this.parseResponse(response, apiUrl, decodeType);
  }

  public async put<T>(
    apiUrl: string,
    data?: any,
    decodeType?: any,
    params: Params = {},
    options?: FetchOptions
  ) {
    const { version, spaceId, ...queryParams } = params;

    const response = await this._http!.put<T>(this.parseApiUrl(apiUrl, spaceId), {
      method: 'PUT',
      body: JSON.stringify(data),
      query: queryParams,
      version,
      ...this.withCpsHeaders(options),
      ...(this.shouldSkipBasePath(spaceId) ? { prependBasePath: false } : {}),
    });

    return this.parseResponse(response, apiUrl, decodeType);
  }

  public async delete<T>(apiUrl: string, params: Params = {}, data?: any, options?: FetchOptions) {
    const { version, spaceId, ...queryParams } = params;

    const response = await this._http!.delete<T>({
      path: this.parseApiUrl(apiUrl, spaceId),
      query: queryParams,
      body: JSON.stringify(data),
      version,
      ...this.withCpsHeaders(options),
      ...(this.shouldSkipBasePath(spaceId) ? { prependBasePath: false } : {}),
    });

    if (response instanceof Error) {
      throw response;
    }
    return response;
  }
}

export const apiService = ApiService.getInstance();
