/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import axios from 'axios';
import type { AxiosResponse } from 'axios';
import type { Logger } from '@kbn/core/server';
import type { ActionsConfigurationUtilities } from '../../actions_config';
import { request } from '../axios_utils';
import { RelayRequestError } from './relay_error';
import type {
  RelayBinding,
  RelayBindingsPage,
  RelayCallbackResponse,
  RelayClaimResponse,
  RelayClientContract,
  RelayInstallRequest,
  RelayInstallResponse,
  RelayListBindingsOptions,
  RelayTriggerInput,
  RelayTriggerResponse,
} from './types';

export interface RelayClientOptions {
  baseUrl: string;
  configurationUtilities: ActionsConfigurationUtilities;
  logger: Logger;
}

/** Largest page size the Relay accepts on its cursor-paginated list endpoints. */
const RELAY_MAX_PAGE_LIMIT = 200;

interface RelayErrorResponse {
  message?: string;
}

/** Raw shape of the cursor-paginated bindings list response body. */
interface RelayBindingsListResponse {
  bindings?: RelayBinding[];
  next_cursor?: string;
}

/** Raw shape of the `POST /v1/slack/trigger` acknowledgement body. */
interface RelayTriggerResponseBody {
  ref?: string;
  tenant_key?: string;
  channel?: string;
}

export class RelayClient implements RelayClientContract {
  private readonly axios = axios.create();
  private readonly baseUrl: URL;
  private readonly configurationUtilities: ActionsConfigurationUtilities;
  private readonly logger: Logger;

  constructor({ baseUrl, configurationUtilities, logger }: RelayClientOptions) {
    this.baseUrl = new URL(baseUrl);
    this.configurationUtilities = configurationUtilities;
    this.logger = logger;
  }

  async startInstall(body: RelayInstallRequest): Promise<RelayInstallResponse> {
    const response = await this.post('/v1/slack/install', body);
    return response.data as RelayInstallResponse;
  }

  async fetchClaim(claimId: string): Promise<RelayClaimResponse> {
    const response = await this.post('/v1/slack/install/claim', { claim_id: claimId });

    if (response.status === 202) {
      return { status: 'pending' };
    }

    const claim = response.data as { tenant_key?: string };
    return { status: 'complete', tenant_key: claim.tenant_key };
  }

  /** Unbind a single workspace binding identified by its tenant key. */
  async unbind(tenantKey: string): Promise<void> {
    await this.post('/v1/slack/uninstall', { tenant_key: tenantKey });
  }

  /**
   * Fetch a single page of the calling deployment's own SUB (channel-scoped) bindings for a
   * given Slack workspace tenant — the "connected channels" inventory. Each entry carries its
   * persisted display snapshot (`display_name`, `visibility`). Returns the page's items plus
   * the Relay's opaque `next_cursor` (as `nextCursor`); pass it back via `options.cursor` to
   * read the next page.
   */
  async listBindings(
    tenantKey: string,
    options: RelayListBindingsOptions = {}
  ): Promise<RelayBindingsPage> {
    const query = new URLSearchParams({
      limit: String(options.limit ?? RELAY_MAX_PAGE_LIMIT),
    });
    if (options.cursor) {
      query.set('cursor', options.cursor);
    }

    const response = await this.get(
      `/v1/slack/tenants/${encodeURIComponent(tenantKey)}/bindings?${query.toString()}`
    );
    const body = response.data as RelayBindingsListResponse | undefined;

    if (body?.bindings === undefined) {
      return { bindings: [], nextCursor: body?.next_cursor };
    }

    if (!Array.isArray(body.bindings)) {
      throw new RelayRequestError(
        `/v1/slack/tenants/${encodeURIComponent(tenantKey)}/bindings`,
        response.status,
        'Relay invalid response format missing expected `bindings` array'
      );
    }

    const bindings: RelayBinding[] = body.bindings.map(
      ({ scope_type, scope_id, display_name, visibility }) => ({
        scope_type,
        scope_id,
        display_name,
        visibility,
      })
    );

    return { bindings, nextCursor: body?.next_cursor };
  }

  /** Claim an unclaimed channel (put-if-absent). The caller must hold a registration for the tenant. */
  async bind(tenantKey: string, channelId: string): Promise<void> {
    await this.put(
      `/v1/slack/tenants/${encodeURIComponent(tenantKey)}/bindings/${encodeURIComponent(
        channelId
      )}/bind`,
      {}
    );
  }

  /** Release a channel binding owned by this deployment. */
  async unbindChannel(tenantKey: string, channelId: string): Promise<void> {
    await this.del(
      `/v1/slack/tenants/${encodeURIComponent(tenantKey)}/bindings/${encodeURIComponent(
        channelId
      )}/unbind`
    );
  }

  /** Post to a bound channel. One this deployment does not own is rejected with a 403, not delivered. */
  async trigger({
    tenantKey,
    channel,
    message,
    threadTs,
  }: RelayTriggerInput): Promise<RelayTriggerResponse> {
    const response = await this.post('/v1/slack/trigger', {
      tenant_key: tenantKey,
      channel,
      message,
      ...(threadTs ? { thread_ts: threadTs } : {}),
    });

    const body = response.data as RelayTriggerResponseBody | undefined;
    if (typeof body?.ref !== 'string' || body.ref.length === 0) {
      throw new RelayRequestError(
        '/v1/slack/trigger',
        response.status,
        'Relay invalid response format missing expected `ref`'
      );
    }
    return {
      ref: body.ref,
      tenantKey: body.tenant_key ?? tenantKey,
      channel: typeof body.channel === 'string' && body.channel.length > 0 ? body.channel : channel,
    };
  }

  isRelayOrigin(url: string): boolean {
    try {
      return new URL(url).origin === this.baseUrl.origin;
    } catch {
      return false;
    }
  }

  async postCallback(
    url: string,
    body: unknown,
    signal: AbortSignal
  ): Promise<RelayCallbackResponse> {
    if (!this.isRelayOrigin(url)) {
      throw new Error('Callback URL does not match the configured Relay origin');
    }

    const response = await this.sendRequest(url, body, 'post', signal);
    return { status: response.status };
  }

  private async post(path: string, body: unknown): Promise<AxiosResponse> {
    return this.send(path, 'post', body);
  }

  private async put(path: string, body: unknown): Promise<AxiosResponse> {
    return this.send(path, 'put', body);
  }

  private async del(path: string): Promise<AxiosResponse> {
    return this.send(path, 'delete');
  }

  private async get(path: string): Promise<AxiosResponse> {
    return this.send(path, 'get');
  }

  private async send(
    path: string,
    method: 'get' | 'post' | 'put' | 'delete',
    data?: unknown
  ): Promise<AxiosResponse> {
    const response = await this.sendRequest(new URL(path, this.baseUrl).toString(), data, method);
    if (response.status >= 200 && response.status < 300) {
      return response;
    }

    const relayMessage = (response.data as RelayErrorResponse | undefined)?.message;
    throw new RelayRequestError(path, response.status, relayMessage);
  }

  private sendRequest(
    url: string,
    data: unknown,
    method: 'get' | 'post' | 'put' | 'delete' = 'post',
    signal?: AbortSignal
  ): Promise<AxiosResponse> {
    return request({
      axios: this.axios,
      url,
      method,
      data,
      headers: { 'Content-Type': 'application/json' },
      configurationUtilities: this.configurationUtilities,
      sslOverrides: this.configurationUtilities.getRelaySSLSettings(),
      logger: this.logger,
      signal,
      maxRedirects: 0,
      validateStatus: () => true,
    });
  }
}
