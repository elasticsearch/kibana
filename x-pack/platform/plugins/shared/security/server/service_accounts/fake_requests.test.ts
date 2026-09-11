/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock, loggingSystemMock } from '@kbn/core/server/mocks';
import type { Logger } from '@kbn/logging';

import {
  SERVICE_ACCOUNT_MINT_FAILURE_BACKOFF_MS,
  ServiceAccountFakeRequests,
} from './fake_requests';
import { ServiceAccountTokenExchangeError } from './token_exchange_error';

// Arbitrary freshness window for exercising `ensureFreshToken`; the production value is the
// 401-retry reuse window, but the method is policy-agnostic and takes it as a parameter.
const MAX_AGE_MS = 30_000;
const REQUEST_LIFETIME_MS = 10 * 60 * 1000;

describe('ServiceAccountFakeRequests', () => {
  let logger: Logger;
  let mintToken: jest.Mock<Promise<string>, [string]>;
  let fakeRequests: ServiceAccountFakeRequests;

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));

    logger = loggingSystemMock.create().get('service-accounts');
    let counter = 0;
    mintToken = jest.fn().mockImplementation(async () => `essu_token_${++counter}`);
    fakeRequests = new ServiceAccountFakeRequests(logger, mintToken, REQUEST_LIFETIME_MS);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('#create', () => {
    it('mints a token and binds it to a fake request with a lowercase `authorization` header', async () => {
      const request = await fakeRequests.create({ serviceAccountId: 'sa-id' });

      expect(mintToken).toHaveBeenCalledTimes(1);
      expect(mintToken).toHaveBeenCalledWith('sa-id');
      expect(request.isFakeRequest).toBe(true);
      // The exact lowercase key is load-bearing for the ES client's fake-request header filtering.
      expect(Object.keys(request.headers)).toEqual(['authorization']);
      expect(request.headers.authorization).toBe('Bearer essu_token_1');
      expect(fakeRequests.isServiceAccountRequest(request)).toBe(true);
    });

    it('marks the request as authenticated so capabilities are not force-disabled', async () => {
      const request = await fakeRequests.create({ serviceAccountId: 'sa-id' });
      expect(request.auth.isAuthenticated).toBe(true);
    });

    it('scopes the request to the provided space, defaulting to the default space', async () => {
      const scoped = await fakeRequests.create({ serviceAccountId: 'sa-id', spaceId: 'marketing' });
      expect(scoped.spaceId).toBe('marketing');

      const unscoped = await fakeRequests.create({ serviceAccountId: 'sa-id' });
      expect(unscoped.spaceId).toBe('default');
    });

    it('propagates mint failures', async () => {
      mintToken.mockRejectedValueOnce(new Error('exchange failed'));
      await expect(fakeRequests.create({ serviceAccountId: 'sa-id' })).rejects.toThrowError(
        'exchange failed'
      );
    });
  });

  describe('#isServiceAccountRequest', () => {
    it('returns false for requests it did not mint', () => {
      expect(fakeRequests.isServiceAccountRequest(httpServerMock.createKibanaRequest())).toBe(
        false
      );
      expect(fakeRequests.isServiceAccountRequest(httpServerMock.createFakeKibanaRequest({}))).toBe(
        false
      );
    });
  });

  describe('#ensureFreshToken', () => {
    it('throws for requests it did not mint', async () => {
      await expect(
        fakeRequests.ensureFreshToken(httpServerMock.createFakeKibanaRequest({}), 0)
      ).rejects.toThrowError('The provided request is not bound to a service account.');
      expect(mintToken).not.toHaveBeenCalled();
    });

    it('returns the current token without minting while it is fresh', async () => {
      const request = await fakeRequests.create({ serviceAccountId: 'sa-id' });
      mintToken.mockClear();

      jest.advanceTimersByTime(MAX_AGE_MS - 1);
      await expect(fakeRequests.ensureFreshToken(request, MAX_AGE_MS)).resolves.toBe(
        'essu_token_1'
      );
      expect(mintToken).not.toHaveBeenCalled();
      expect(request.headers.authorization).toBe('Bearer essu_token_1');
    });

    it('mints a replacement and updates the request header in place once stale', async () => {
      const request = await fakeRequests.create({ serviceAccountId: 'sa-id' });
      mintToken.mockClear();

      jest.advanceTimersByTime(MAX_AGE_MS);
      await expect(fakeRequests.ensureFreshToken(request, MAX_AGE_MS)).resolves.toBe(
        'essu_token_2'
      );

      expect(mintToken).toHaveBeenCalledTimes(1);
      expect(mintToken).toHaveBeenCalledWith('sa-id');
      expect(request.headers.authorization).toBe('Bearer essu_token_2');
    });

    it('deduplicates concurrent refreshes into a single mint', async () => {
      const request = await fakeRequests.create({ serviceAccountId: 'sa-id' });
      mintToken.mockClear();

      let resolveMint!: (token: string) => void;
      mintToken.mockImplementationOnce(
        () => new Promise<string>((resolve) => (resolveMint = resolve))
      );

      jest.advanceTimersByTime(MAX_AGE_MS);
      const first = fakeRequests.ensureFreshToken(request, MAX_AGE_MS);
      const second = fakeRequests.ensureFreshToken(request, MAX_AGE_MS);

      resolveMint('essu_token_shared');

      await expect(first).resolves.toBe('essu_token_shared');
      await expect(second).resolves.toBe('essu_token_shared');
      expect(mintToken).toHaveBeenCalledTimes(1);
      expect(request.headers.authorization).toBe('Bearer essu_token_shared');
    });

    it('backs off after a failed mint, then allows a new attempt', async () => {
      const request = await fakeRequests.create({ serviceAccountId: 'sa-id' });
      mintToken.mockClear();
      const error = new ServiceAccountTokenExchangeError(new Error('exchange failed'), true);
      mintToken.mockRejectedValueOnce(error);

      jest.advanceTimersByTime(MAX_AGE_MS);
      await expect(fakeRequests.ensureFreshToken(request, MAX_AGE_MS)).rejects.toBe(error);

      // Within the backoff window, no mint attempt is made.
      await expect(fakeRequests.ensureFreshToken(request, MAX_AGE_MS)).rejects.toThrowError(
        'A recent attempt to mint a service account token failed; refusing to retry yet.'
      );
      expect(mintToken).toHaveBeenCalledTimes(1);

      // Once the backoff elapses, minting resumes.
      jest.advanceTimersByTime(SERVICE_ACCOUNT_MINT_FAILURE_BACKOFF_MS);
      await expect(fakeRequests.ensureFreshToken(request, MAX_AGE_MS)).resolves.toBe(
        'essu_token_2'
      );
      expect(request.headers.authorization).toBe('Bearer essu_token_2');
    });

    it('the failed mint stays failed for callers awaiting the same in-flight mint', async () => {
      const request = await fakeRequests.create({ serviceAccountId: 'sa-id' });
      mintToken.mockClear();

      let rejectMint!: (err: Error) => void;
      mintToken.mockImplementationOnce(
        () => new Promise<string>((resolve, reject) => (rejectMint = reject))
      );

      jest.advanceTimersByTime(MAX_AGE_MS);
      const first = fakeRequests.ensureFreshToken(request, MAX_AGE_MS);
      const second = fakeRequests.ensureFreshToken(request, MAX_AGE_MS);

      rejectMint(new Error('exchange failed'));

      await expect(first).rejects.toThrowError('exchange failed');
      await expect(second).rejects.toThrowError('exchange failed');
      expect(mintToken).toHaveBeenCalledTimes(1);
      // The stale token is left in place, but this request can no longer refresh.
      expect(request.headers.authorization).toBe('Bearer essu_token_1');
    });

    it('fails closed without minting once the default lease has expired', async () => {
      const request = await fakeRequests.create({ serviceAccountId: 'sa-id' });
      mintToken.mockClear();

      jest.advanceTimersByTime(REQUEST_LIFETIME_MS + 1);

      await expect(fakeRequests.ensureFreshToken(request, MAX_AGE_MS)).rejects.toThrowError(
        'The lease on this service account bound request has expired; refusing to mint a replacement credential.'
      );
      expect(mintToken).not.toHaveBeenCalled();
      // The request rides out its current (long-dead) token; nothing is replaced.
      expect(request.headers.authorization).toBe('Bearer essu_token_1');
    });

    it('honors a configured registry lifetime', async () => {
      fakeRequests = new ServiceAccountFakeRequests(logger, mintToken, 1_000);
      const request = await fakeRequests.create({
        serviceAccountId: 'sa-id',
      });
      mintToken.mockClear();

      jest.advanceTimersByTime(1_001);

      await expect(fakeRequests.ensureFreshToken(request, 0)).rejects.toThrowError(
        'The lease on this service account bound request has expired; refusing to mint a replacement credential.'
      );
      expect(mintToken).not.toHaveBeenCalled();
    });

    it('still refreshes just before the lease boundary', async () => {
      const request = await fakeRequests.create({
        serviceAccountId: 'sa-id',
      });
      mintToken.mockClear();

      jest.advanceTimersByTime(REQUEST_LIFETIME_MS - 1);

      await expect(fakeRequests.ensureFreshToken(request, MAX_AGE_MS)).resolves.toBe(
        'essu_token_2'
      );
      expect(mintToken).toHaveBeenCalledTimes(1);
    });
    it('rejects at the exact lifetime boundary even when the token is fresh', async () => {
      const request = await fakeRequests.create({ serviceAccountId: 'sa-id' });
      jest.advanceTimersByTime(REQUEST_LIFETIME_MS);
      await expect(fakeRequests.ensureFreshToken(request, Infinity)).rejects.toThrow('lease');
      expect(mintToken).toHaveBeenCalledTimes(1);
    });

    it('does not install a token when the lifetime expires during the exchange', async () => {
      const request = await fakeRequests.create({ serviceAccountId: 'sa-id' });
      let resolveMint: (token: string) => void = jest.fn();
      mintToken.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveMint = resolve;
          })
      );
      jest.advanceTimersByTime(REQUEST_LIFETIME_MS - 1);
      const first = fakeRequests.ensureFreshToken(request, 0);
      const second = fakeRequests.ensureFreshToken(request, 0);
      jest.advanceTimersByTime(1);
      resolveMint('late-token');
      await expect(first).rejects.toThrow('lease');
      await expect(second).rejects.toThrow('lease');
      expect(request.headers.authorization).toBe('Bearer essu_token_1');
      await expect(fakeRequests.ensureFreshToken(request, 0)).rejects.toThrow('lease');
      expect(mintToken).toHaveBeenCalledTimes(2);
    });

    it.each([
      new ServiceAccountTokenExchangeError(new Error('revoked'), false),
      new Error('unclassified failure'),
    ])('retains terminal failure and never returns a cached token: %s', async (error) => {
      const request = await fakeRequests.create({ serviceAccountId: 'sa-id' });
      mintToken.mockRejectedValueOnce(error);
      await expect(fakeRequests.ensureFreshToken(request, 0)).rejects.toBe(error);
      await expect(fakeRequests.ensureFreshToken(request, Infinity)).rejects.toBe(error);
      jest.advanceTimersByTime(SERVICE_ACCOUNT_MINT_FAILURE_BACKOFF_MS);
      await expect(fakeRequests.ensureFreshToken(request, 0)).rejects.toBe(error);
      expect(mintToken).toHaveBeenCalledTimes(2);
      const otherRequest = await fakeRequests.create({ serviceAccountId: 'sa-id' });
      await expect(fakeRequests.ensureFreshToken(otherRequest, MAX_AGE_MS)).resolves.toBe(
        'essu_token_2'
      );
    });

    it('honors a longer retry delay without returning the cached token during backoff', async () => {
      const request = await fakeRequests.create({ serviceAccountId: 'sa-id' });
      const error = new ServiceAccountTokenExchangeError(new Error('throttled'), true, 20_000);
      mintToken.mockRejectedValueOnce(error);
      await expect(fakeRequests.ensureFreshToken(request, 0)).rejects.toBe(error);
      jest.advanceTimersByTime(19_999);
      await expect(fakeRequests.ensureFreshToken(request, MAX_AGE_MS)).rejects.toThrow(
        'refusing to retry yet'
      );
      expect(mintToken).toHaveBeenCalledTimes(2);
      jest.advanceTimersByTime(1);
      await expect(fakeRequests.ensureFreshToken(request, 0)).resolves.toBe('essu_token_2');
    });

    it('logs the account ID without logging tokens or upstream error contents', async () => {
      const request = await fakeRequests.create({ serviceAccountId: 'sa-id' });
      await fakeRequests.ensureFreshToken(request, 0);
      mintToken.mockRejectedValueOnce(new Error('secret-token'));
      await expect(fakeRequests.ensureFreshToken(request, 0)).rejects.toThrow('secret-token');
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('sa-id'));
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('sa-id'));
      for (const call of [
        ...jest.mocked(logger.debug).mock.calls,
        ...jest.mocked(logger.warn).mock.calls,
      ]) {
        expect(String(call[0])).not.toMatch(/essu_token|secret-token/);
      }
    });
  });
});
