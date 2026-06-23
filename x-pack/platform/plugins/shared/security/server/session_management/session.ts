/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Crypto } from '@elastic/node-crypto';
import nodeCrypto from '@elastic/node-crypto';
import { createHash, randomBytes } from 'crypto';
import { promisify } from 'util';

import type { KibanaRequest, Logger, SessionStorageSetOptions } from '@kbn/core/server';
import type { AuditServiceSetup } from '@kbn/security-plugin-types-server';
import type { PublicMethodsOf } from '@kbn/utility-types';

import type { SessionCookie } from './session_cookie';
import {
  SessionConcurrencyLimitError,
  SessionErrorReason,
  SessionExpiredError,
  SessionMissingError,
  SessionUnexpectedError,
} from './session_errors';
import type { SessionIndex, SessionIndexValue } from './session_index';
import type { AuthenticationProvider } from '../../common';
import { userSessionConcurrentLimitLogoutEvent } from '../audit';
import type { ConfigType } from '../config';

/**
 * The shape of the value that represents user's session information.
 */
export interface SessionValue<TState = unknown> {
  /**
   * Unique session ID.
   */
  sid: string;

  /**
   * Username this session belongs. It's defined only if session is authenticated, otherwise session
   * is considered unauthenticated (e.g. intermediate session used during SSO handshake).
   */
  username?: string;

  /**
   * Name and type of the provider this session belongs to.
   */
  provider: AuthenticationProvider;

  /**
   * The Unix time in ms when the session should be considered expired. If `null`, session will stay
   * active until the browser is closed.
   */
  idleTimeoutExpiration: number | null;

  /**
   * The Unix time in ms which is the max total lifespan of the session. If `null`, session expire
   * time can be extended indefinitely.
   */
  lifespanExpiration: number | null;

  /**
   * The Unix time in ms which is the time when the session was initially created. The value can also be 0 indicating
   * the migrated session that was created before `createdAt` field was introduced.
   */
  createdAt: number;

  /**
   * Session value that is fed to the authentication provider. The shape is unknown upfront and
   * entirely determined by the authentication provider that owns the current session.
   */
  state: TState;

  /**
   * Unique identifier of the user profile, if any. Not all users that have session will have an associated user
   * profile, e.g. anonymous users won't have it.
   */
  userProfileId?: string;

  /**
   * Indicates whether user acknowledged access agreement or not.
   */
  accessAgreementAcknowledged?: boolean;

  /**
   * Additional information about the session value.
   */
  metadata: { index: SessionIndexValue };
}

export interface SessionOptions {
  readonly logger: Logger;
  readonly sessionIndex: PublicMethodsOf<SessionIndex>;
  readonly sessionCookie: PublicMethodsOf<SessionCookie>;
  readonly config: Pick<ConfigType, 'encryptionKey' | 'session'>;
  readonly audit: AuditServiceSetup;
}

export interface SessionValueContentToEncrypt {
  username?: string;
  userProfileId?: string;
  state: unknown;
}

/**
 * Filter provided for the `Session.invalidate` method that determines which session values should
 * be invalidated. It can have three possible types:
 *   - `all` means that all existing active and inactive sessions should be invalidated.
 *   - `current` means that session associated with the current request should be invalidated.
 *   - `query` means that only sessions that match specified query should be invalidated.
 */
export type InvalidateSessionsFilter =
  | { match: 'all' }
  | { match: 'current' }
  | { match: 'query'; query: { provider: { type: string; name?: string }; username?: string } };

/**
 * The SIDs and AAD must be unpredictable to prevent guessing attacks, where an attacker is able to
 * guess or predict the ID of a valid session through statistical analysis techniques. That's why we
 * generate SIDs and AAD using a secure PRNG and current OWASP guidance suggests a minimum of 16
 * bytes (128 bits), but to be on the safe side we decided to use 32 bytes (256 bits).
 */
const SID_BYTE_LENGTH = 32;
const AAD_BYTE_LENGTH = 32;

/**
 * Returns last 10 characters of the session identifier. Referring to the specific session by its identifier is useful
 * for logging and debugging purposes, but we cannot include full session ID in logs because of the security reasons.
 * @param sid Full user session id
 */
export function getPrintableSessionId(sid: string) {
  return sid.slice(-10);
}

export class Session {
  /**
   * Used to encrypt and decrypt portion of the session value using configured encryption key.
   */
  private readonly crypto: Crypto;

  /**
   * Dedicated logger for session invalidation events, allowing them to be managed
   * independently of general session logs.
   */
  private readonly invalidationLogger: Logger;

  /**
   * Promise-based version of the NodeJS native `randomBytes`.
   */
  private readonly randomBytes = promisify(randomBytes);

  constructor(private readonly options: Readonly<SessionOptions>) {
    this.crypto = nodeCrypto({ encryptionKey: this.options.config.encryptionKey });
    this.invalidationLogger = this.options.logger.get('invalidation');
  }

  /**
   * Extracts session id for the specified request.
   * @param request Request instance to get session value for.
   */
  async getSID(request: KibanaRequest) {
    const sessionCookieValue = await this.options.sessionCookie.get(request);
    if (sessionCookieValue) {
      return sessionCookieValue.sid;
    }
  }

  /**
   * Extracts session value for the specified request. Under the hood it can clear session if it is
   * invalid or created by the legacy versions of Kibana.
   * @param request Request instance to get session value for.
   */
  async get(request: KibanaRequest) {
    const sessionCookieValue = await this.options.sessionCookie.get(request);
    if (!sessionCookieValue) {
      return { error: new SessionMissingError(), value: null };
    }

    const sessionLogger = this.getLoggerForSID(sessionCookieValue.sid);
    const now = Date.now();
    const idleExpired =
      sessionCookieValue.idleTimeoutExpiration && sessionCookieValue.idleTimeoutExpiration < now;
    const lifespanExpired =
      sessionCookieValue.lifespanExpiration && sessionCookieValue.lifespanExpiration < now;

    if (idleExpired || lifespanExpired) {
      sessionLogger.debug('Session has expired and will be invalidated.');
      this.invalidationLogger.debug(
        `Invalidating session: ${lifespanExpired ? 'lifespan' : 'idle'} timeout expired.`
      );
      await this.invalidate(request, { match: 'current' });
      // Prefer lifespan if both expired (lifespan is the hard limit)
      const reason = lifespanExpired
        ? SessionErrorReason.SESSION_LIFESPAN_TIMEOUT
        : SessionErrorReason.SESSION_IDLE_TIMEOUT;
      return { error: new SessionExpiredError(reason), value: null };
    }

    const sessionIndexValue = await this.options.sessionIndex.get(sessionCookieValue.sid);
    if (!sessionIndexValue) {
      sessionLogger.debug(
        'Session value is not available in the index, session cookie will be invalidated.'
      );
      await this.options.sessionCookie.clear(request);
      return { error: new SessionUnexpectedError(), value: null };
    }

    let decryptedContent: SessionValueContentToEncrypt;
    try {
      decryptedContent = JSON.parse(
        (await this.crypto.decrypt(sessionIndexValue.content, sessionCookieValue.aad)) as string
      );
    } catch (err) {
      sessionLogger.warn(
        `Unable to decrypt session content, session will be invalidated: ${err.message}`
      );
      this.invalidationLogger.warn('Invalidating session: content decryption failed.');
      await this.invalidate(request, { match: 'current' });
      return { error: new SessionUnexpectedError(), value: null };
    }

    // The only reason why we check if the session is within the concurrent session limit _after_ decryption
    // is to record decrypted username and profile id in the audit logs.
    const isSessionWithinConcurrentSessionLimit =
      await this.options.sessionIndex.isWithinConcurrentSessionLimit(sessionIndexValue);
    if (!isSessionWithinConcurrentSessionLimit) {
      this.options.audit.asScoped(request).log(
        userSessionConcurrentLimitLogoutEvent({
          username: decryptedContent.username,
          userProfileId: decryptedContent.userProfileId,
          provider: sessionIndexValue.provider,
        })
      );

      sessionLogger.warn(
        'Session is outside the concurrent session limit and will be invalidated.'
      );
      this.invalidationLogger.warn('Invalidating session: concurrent session limit exceeded.');
      await this.invalidate(request, { match: 'current' });
      return { error: new SessionConcurrencyLimitError(), value: null };
    }

    return {
      error: null,
      value: {
        ...Session.sessionIndexValueToSessionValue(sessionIndexValue, decryptedContent),
        // Unlike session index, session cookie contains the most up-to-date idle timeout expiration.
        idleTimeoutExpiration: sessionCookieValue.idleTimeoutExpiration,
      },
    };
  }

  /**
   * Creates new session document in the session index encrypting sensitive state.
   * @param request Request instance to create session value for.
   * @param sessionValue Session value parameters.
   * @param stateCookieOptions Options to change the associated session cookie's properties
   */
  async create(
    request: KibanaRequest,
    sessionValue: Readonly<
      Omit<
        SessionValue,
        'sid' | 'idleTimeoutExpiration' | 'lifespanExpiration' | 'createdAt' | 'metadata'
      >
    >,
    stateCookieOptions?: SessionStorageSetOptions
  ) {
    const [sid, aad] = await Promise.all([
      this.randomBytes(SID_BYTE_LENGTH).then((sidBuffer) => sidBuffer.toString('base64')),
      this.randomBytes(AAD_BYTE_LENGTH).then((aadBuffer) => aadBuffer.toString('base64')),
    ]);

    const sessionLogger = this.getLoggerForSID(sid);
    sessionLogger.debug('Creating a new session.');

    const sessionExpirationInfo = this.calculateExpiry(sessionValue.provider);
    const { username, userProfileId, state, ...publicSessionValue } = sessionValue;

    // First try to store session in the index and only then in the cookie to make sure cookie is
    // only updated if server side session is created successfully.
    const sessionIndexValue = await this.options.sessionIndex.create({
      ...publicSessionValue,
      ...sessionExpirationInfo,
      sid,
      createdAt: Date.now(),
      usernameHash: username && Session.getUsernameHash(username),
      content: await this.crypto.encrypt(JSON.stringify({ username, userProfileId, state }), aad),
    });

    await this.options.sessionCookie.set(
      request,
      { ...sessionExpirationInfo, sid, aad },
      stateCookieOptions
    );

    sessionLogger.debug('Successfully created a new session.');

    return Session.sessionIndexValueToSessionValue(sessionIndexValue, {
      username,
      userProfileId,
      state,
    });
  }

  /**
   * Updates session value for the specified request.
   * @param request Request instance to set session value for.
   * @param sessionValue Session value parameters.
   */
  async update(request: KibanaRequest, sessionValue: Readonly<SessionValue>) {
    const sessionCookieValue = await this.options.sessionCookie.get(request);
    const sessionLogger = this.getLoggerForSID(sessionValue.sid);
    if (!sessionCookieValue) {
      sessionLogger.warn('Session cannot be updated since it does not exist.');
      return null;
    }

    const sessionExpirationInfo = this.calculateExpiry(
      sessionValue.provider,
      sessionCookieValue.lifespanExpiration
    );
    // We filter out the `createdAt` field and rely on the one stored in `metadata.index` since it isn't
    // supposed to be updated after it was initially set during creation.
    const { username, userProfileId, state, metadata, createdAt, ...publicSessionInfo } =
      sessionValue;

    // First try to store session in the index and only then in the cookie to make sure cookie is
    // only updated if server side session is created successfully.
    const sessionIndexValue = await this.options.sessionIndex.update({
      ...sessionValue.metadata.index,
      ...publicSessionInfo,
      ...sessionExpirationInfo,
      usernameHash: username && Session.getUsernameHash(username),
      content: await this.crypto.encrypt(
        JSON.stringify({ username, userProfileId, state }),
        sessionCookieValue.aad
      ),
    });

    // Session may be already invalidated by another concurrent request, in this case we should
    // clear cookie for the request as well.
    if (sessionIndexValue === null) {
      sessionLogger.warn('Session cannot be updated as it has been invalidated already.');
      await this.options.sessionCookie.clear(request);
      return null;
    }

    await this.options.sessionCookie.set(request, {
      ...sessionCookieValue,
      ...sessionExpirationInfo,
    });

    sessionLogger.debug('Successfully updated existing session.');

    return Session.sessionIndexValueToSessionValue(sessionIndexValue, {
      username,
      userProfileId,
      state,
    });
  }

  /**
   * Extends existing session.
   * @param request Request instance to set session value for.
   * @param sessionValue Session value parameters.
   */
  async extend(request: KibanaRequest, sessionValue: Readonly<SessionValue>) {
    const sessionCookieValue = await this.options.sessionCookie.get(request);
    const sessionLogger = this.getLoggerForSID(sessionValue.sid);
    if (!sessionCookieValue) {
      sessionLogger.warn('Session cannot be extended since it does not exist.');
      return null;
    }

    // We calculate actual expiration values based on the information extracted from the portion of
    // the session value that is stored in the cookie since it always contains the most recent value.
    const sessionExpirationInfo = this.calculateExpiry(
      sessionValue.provider,
      sessionCookieValue.lifespanExpiration
    );
    if (
      sessionExpirationInfo.idleTimeoutExpiration === sessionValue.idleTimeoutExpiration &&
      sessionExpirationInfo.lifespanExpiration === sessionValue.lifespanExpiration
    ) {
      return sessionValue;
    }

    // Session index updates are costly and should be minimized, but these are the cases when we
    // should update session index:
    let updateSessionIndex = false;
    if (
      (sessionExpirationInfo.idleTimeoutExpiration === null &&
        sessionValue.idleTimeoutExpiration !== null) ||
      (sessionExpirationInfo.idleTimeoutExpiration !== null &&
        sessionValue.idleTimeoutExpiration === null)
    ) {
      // 1. If idle timeout wasn't configured when session was initially created and is configured
      // now or vice versa.
      sessionLogger.debug(
        'Session idle timeout configuration has changed, session index will be updated.'
      );
      updateSessionIndex = true;
    } else if (
      (sessionExpirationInfo.lifespanExpiration === null &&
        sessionValue.lifespanExpiration !== null) ||
      (sessionExpirationInfo.lifespanExpiration !== null &&
        sessionValue.lifespanExpiration === null)
    ) {
      // 2. If lifespan wasn't configured when session was initially created and is configured now
      // or vice versa.
      sessionLogger.debug(
        'Session lifespan configuration has changed, session index will be updated.'
      );
      updateSessionIndex = true;
    } else {
      // The timeout after which we update index is two times longer than configured idle timeout
      // since index updates are costly and we want to minimize them.
      const { idleTimeout } = this.options.config.session.getExpirationTimeouts(
        sessionValue.provider
      );
      if (
        idleTimeout !== null &&
        idleTimeout.asMilliseconds() * 2 <
          sessionExpirationInfo.idleTimeoutExpiration! -
            sessionValue.metadata.index.idleTimeoutExpiration!
      ) {
        // 3. If idle timeout was updated a while ago.
        sessionLogger.debug(
          'Session idle timeout stored in the index is too old and will be updated.'
        );
        updateSessionIndex = true;
      }
    }

    // First try to store session in the index and only then in the cookie to make sure cookie is
    // only updated if server side session is created successfully.
    if (updateSessionIndex) {
      const sessionIndexValue = await this.options.sessionIndex.update({
        ...sessionValue.metadata.index,
        ...sessionExpirationInfo,
      });

      // Session may be already invalidated by another concurrent request, in this case we should
      // clear cookie for the request as well.
      if (sessionIndexValue === null) {
        sessionLogger.warn('Session cannot be extended as it has been invalidated already.');
        await this.options.sessionCookie.clear(request);
        return null;
      }

      sessionValue.metadata.index = sessionIndexValue;
    }

    await this.options.sessionCookie.set(request, {
      ...sessionCookieValue,
      ...sessionExpirationInfo,
    });

    sessionLogger.debug('Successfully extended existing session.');

    return { ...sessionValue, ...sessionExpirationInfo } as Readonly<SessionValue>;
  }

  /**
   * Invalidates sessions that match the specified filter.
   * @param request Request instance initiated invalidation.
   * @param filter Filter that narrows down the list of the sessions that should be invalidated.
   */
  async invalidate(request: KibanaRequest, filter: InvalidateSessionsFilter) {
    // We don't require request to have the associated session, but nevertheless we still want to
    // log the SID if session is available.
    const sessionCookieValue = await this.options.sessionCookie.get(request);
    const sessionLogger = this.getLoggerForSID(sessionCookieValue?.sid);

    // We clear session cookie only when the current session should be invalidated since it's the
    // only case when this action is explicitly and unequivocally requested. This behavior doesn't
    // introduce any risk since even if the current session has been affected the session cookie
    // will be automatically invalidated as soon as client attempts to re-use it due to missing
    // underlying session index value.
    let invalidateIndexValueFilter;
    if (filter.match === 'current') {
      if (!sessionCookieValue) {
        return;
      }

      sessionLogger.debug('Invalidating current session.');
      await this.options.sessionCookie.clear(request);
      invalidateIndexValueFilter = { match: 'sid' as 'sid', sid: sessionCookieValue.sid };
    } else if (filter.match === 'all') {
      sessionLogger.debug('Invalidating all sessions.');
      invalidateIndexValueFilter = filter;
    } else {
      sessionLogger.debug(
        () =>
          `Invalidating sessions that match query: ${JSON.stringify(
            filter.query.username ? { ...filter.query, username: '[REDACTED]' } : filter.query
          )}.`
      );
      invalidateIndexValueFilter = filter.query.username
        ? {
            ...filter,
            query: {
              provider: filter.query.provider,
              usernameHash: Session.getUsernameHash(filter.query.username),
            },
          }
        : filter;
    }

    const invalidatedCount = await this.options.sessionIndex.invalidate(invalidateIndexValueFilter);
    sessionLogger.debug(`Successfully invalidated ${invalidatedCount} session(s).`);
    return invalidatedCount;
  }

  private calculateExpiry(
    provider: AuthenticationProvider,
    currentLifespanExpiration?: number | null
  ): { idleTimeoutExpiration: number | null; lifespanExpiration: number | null } {
    const now = Date.now();
    const { idleTimeout, lifespan } = this.options.config.session.getExpirationTimeouts(provider);

    // if we are renewing an existing session, use its `lifespanExpiration` -- otherwise, set this value
    // based on the configured server `lifespan`.
    // note, if the server had a `lifespan` set and then removes it, remove `lifespanExpiration` on renewed sessions
    // also, if the server did not have a `lifespan` set and then adds it, add `lifespanExpiration` on renewed sessions
    const lifespanExpiration =
      currentLifespanExpiration && lifespan
        ? currentLifespanExpiration
        : lifespan && now + lifespan.asMilliseconds();
    const idleTimeoutExpiration = idleTimeout && now + idleTimeout.asMilliseconds();

    return { idleTimeoutExpiration, lifespanExpiration };
  }

  /**
   * Converts value retrieved from the index to the value returned to the API consumers.
   * @param sessionIndexValue The value returned from the index.
   * @param decryptedContent Decrypted session value content.
   */
  private static sessionIndexValueToSessionValue(
    sessionIndexValue: Readonly<SessionIndexValue>,
    { username, userProfileId, state }: SessionValueContentToEncrypt
  ): Readonly<SessionValue> {
    // Extract values that are specific to session index value.
    const { usernameHash, content, ...publicSessionValue } = sessionIndexValue;
    return {
      ...publicSessionValue,
      username,
      userProfileId,
      state,
      // If the session was created before `createdAt` field was introduced, we set it to 0.
      createdAt: publicSessionValue.createdAt ?? 0,
      metadata: { index: sessionIndexValue },
    };
  }

  /**
   * Creates logger scoped to a specified session ID.
   * @param [sid] Session ID to create logger for.
   */
  private getLoggerForSID(sid?: string) {
    return this.options.logger.get(sid ? getPrintableSessionId(sid) : 'no_session');
  }

  /**
   * Generates a sha3-256 hash for the specified `username`. The hash is intended to be stored in
   * the session index to allow querying user specific sessions and don't expose the original
   * `username` at the same time.
   * @param username Username string to generate hash for.
   */
  private static getUsernameHash(username: string) {
    return createHash('sha3-256').update(username).digest('hex');
  }
}
