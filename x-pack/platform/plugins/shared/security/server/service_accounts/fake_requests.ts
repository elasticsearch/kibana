/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FakeRawRequest, Headers, KibanaRequest, Logger } from '@kbn/core/server';
import { kibanaRequestFactory } from '@kbn/core-http-server-utils';
import { brandSpaceId, DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';

import { ServiceAccountTokenExchangeError } from './token_exchange_error';

/**
 * When the ES client reports a 401 for a service-account-bound fake request, a token minted within
 * this window is retried as-is instead of minting again: the failure most likely came from a
 * scoped client still holding the previous token. Also acts as the anti-storm guard — a token
 * that keeps failing right after minting is never re-minted in a tight loop.
 */
export const SERVICE_ACCOUNT_TOKEN_RETRY_REUSE_MS = 10_000;

/**
 * After a transient mint failure, further mint attempts are suppressed
 * for this long so a hot caller loop cannot hammer UIAM with doomed exchange requests.
 */
export const SERVICE_ACCOUNT_MINT_FAILURE_BACKOFF_MS = 5_000;

export interface CreateServiceAccountFakeRequestParams {
  /** The ID of the service account the request should be bound to. */
  serviceAccountId: string;
  /** The space the request is scoped to. Defaults to the default space. */
  spaceId?: string;
}

interface ServiceAccountFakeRequestEntry {
  serviceAccountId: string;
  token: string;
  createdAt: number;
  mintedAt: number;
  /** Single-flight mint: concurrent refreshes await the same exchange instead of stampeding UIAM. */
  inflight?: Promise<string>;
  retryAt?: number;
  nonRetryableError?: Error;
}

/**
 * Mints fake `KibanaRequest`s bound to a service account credential and keeps track of them so the
 * credential can be transparently replaced when it expires. The registry is the only writer of a
 * bound request's `authorization` header: fake-request headers share the `FakeRawRequest.headers`
 * object and are intentionally mutable, so an in-place update is picked up by every subsequent
 * `asScoped(...)` and self-client call.
 *
 * Two invariants that must hold against neighboring request-bound mechanisms:
 *
 * - Service-account-bound requests are mutually exclusive with fake requests marked via
 *   `markExternalUiamCredential` (external, user-created UIAM credentials): external credentials
 *   are user-owned, must not be vouched for with Kibana's client authentication, and can never be
 *   re-minted. Everything in this registry is Kibana-minted and self-healing — the opposite in
 *   both respects.
 * - Unlike the external-credential marker (and `fake_request_enrichment`), this registry must NOT
 *   guard against `authorization` changing after registration: replacing that header is this
 *   registry's very purpose, and it is the sole intended writer.
 *
 * Real inbound requests that happen to carry a service account token (a credential some other
 * service exchanged for itself) are unrelated to this registry: they are never registered, never
 * refreshed, and their credential lifecycle belongs to whoever minted it.
 */
export class ServiceAccountFakeRequests {
  private readonly registry = new WeakMap<KibanaRequest, ServiceAccountFakeRequestEntry>();

  constructor(
    private readonly logger: Logger,
    private readonly mintToken: (serviceAccountId: string) => Promise<string>,
    private readonly requestLifetimeMs: number
  ) {}

  async create({
    serviceAccountId,
    spaceId,
  }: CreateServiceAccountFakeRequestParams): Promise<KibanaRequest> {
    const token = await this.mintToken(serviceAccountId);

    // The lowercase `authorization` key is load-bearing: the ES client derives a fake request's
    // credential by picking exact lowercased keys off its headers, so any other casing would
    // silently strip authentication entirely.
    const headers: Headers = { authorization: `Bearer ${token}` };
    const fakeRawRequest: FakeRawRequest = {
      headers,
      spaceId: brandSpaceId(spaceId ?? DEFAULT_SPACE_ID),
      // The request carries a credential Kibana itself minted. Without this flag the capabilities
      // switcher treats the request as unauthenticated and disables every capability.
      auth: { isAuthenticated: true },
    };

    const request = kibanaRequestFactory(fakeRawRequest);
    const now = Date.now();
    this.registry.set(request, {
      serviceAccountId,
      token,
      createdAt: now,
      mintedAt: now,
    });

    this.logger.debug(`Created a fake request bound to service account ${serviceAccountId}`);
    return request;
  }

  isServiceAccountRequest(request: KibanaRequest): boolean {
    return this.registry.has(request);
  }

  /**
   * Returns a token no older than `maxAgeMs` for the service account bound to this request. When
   * the current token is older, a replacement is minted (single-flight) and the request's
   * `authorization` header is updated in place. Throws when the request is not bound to a service
   * account, when its lease has expired, when minting fails, or while mint failures are being
   * backed off.
   */
  async ensureFreshToken(request: KibanaRequest, maxAgeMs: number): Promise<string> {
    const entry = this.registry.get(request);
    if (!entry) {
      throw new Error('The provided request is not bound to a service account.');
    }

    if (entry.nonRetryableError) {
      throw entry.nonRetryableError;
    }

    this.ensureWithinLifetime(entry);

    if (entry.inflight) {
      return await entry.inflight;
    }

    const now = Date.now();
    if (entry.retryAt !== undefined && now < entry.retryAt) {
      throw new Error(
        'A recent attempt to mint a service account token failed; refusing to retry yet.'
      );
    }

    if (now - entry.mintedAt < maxAgeMs) {
      return entry.token;
    }

    entry.inflight = this.mintToken(entry.serviceAccountId)
      .then((token) => {
        this.ensureWithinLifetime(entry);
        // Registry-owned fake requests share mutable raw headers, so subsequent scoped clients
        // observe this replacement despite KibanaRequest exposing the headers as readonly.
        (request.headers as Record<string, string>).authorization = `Bearer ${token}`;
        entry.token = token;
        entry.mintedAt = Date.now();
        entry.retryAt = undefined;
        this.logger.debug(
          `Replaced the token of a fake request bound to service account ${entry.serviceAccountId}`
        );
        return token;
      })
      .catch((err) => {
        if (err instanceof ServiceAccountTokenExchangeError && err.retryable) {
          entry.retryAt =
            Date.now() + Math.max(SERVICE_ACCOUNT_MINT_FAILURE_BACKOFF_MS, err.retryAfterMs);
        } else {
          entry.nonRetryableError =
            err instanceof Error
              ? err
              : new Error('Service account token exchange failed.', { cause: err });
        }
        this.logger.warn(
          `Failed to replace the token of a fake request bound to service account ${
            entry.serviceAccountId
          } (${entry.nonRetryableError ? 'terminal' : 'retryable'} failure)`
        );
        throw err;
      })
      .finally(() => {
        entry.inflight = undefined;
      });

    return await entry.inflight;
  }

  private ensureWithinLifetime(entry: ServiceAccountFakeRequestEntry): void {
    // Expiry stops replacement; an already-issued token retains its upstream expiration.
    if (Date.now() - entry.createdAt >= this.requestLifetimeMs) {
      this.logger.debug(
        `Refresh lifetime expired for a fake request bound to service account ${entry.serviceAccountId}`
      );
      entry.nonRetryableError = new Error(
        'The lease on this service account bound request has expired; refusing to mint a replacement credential.'
      );
      throw entry.nonRetryableError;
    }
  }
}
