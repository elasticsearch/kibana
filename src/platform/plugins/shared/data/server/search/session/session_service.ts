/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { notFound } from '@hapi/boom';
import { fromKueryExpression, nodeBuilder } from '@kbn/es-query';
import type {
  CoreSetup,
  CoreStart,
  KibanaRequest,
  Logger,
  SavedObject,
  SavedObjectsClientContract,
  SavedObjectsFindOptions,
  ElasticsearchClient,
} from '@kbn/core/server';
import type { AuthenticatedUser } from '@kbn/core/server';
import { isSavedObjectErrorResult } from '@kbn/core-saved-objects-server';
import { defer } from '@kbn/kibana-utils-plugin/common';
import type { IKibanaSearchRequest, ISearchOptions } from '@kbn/search-types';
import { debounce } from 'lodash';
import { i18n } from '@kbn/i18n';
import type {
  SearchSessionRequestInfo,
  SearchSessionSavedObjectAttributes,
  SearchSessionsFindResponse,
  SearchSessionStatusesResponse,
  SearchSessionStatusResponse,
} from '../../../common';
import { ENHANCED_ES_SEARCH_STRATEGY, SEARCH_SESSION_TYPE, SearchStatus } from '../../../common';
import type { ISearchSessionService } from '../..';
import { NoSearchIdInSessionError } from '../..';
import { strategyToString } from '../../../common';
import type { ConfigSchema, SearchSessionsConfigSchema } from '../../config';
import { getSessionStatus } from './status/get_session_status';
import { updateSessionStatus } from './status/update_session_status';
import type { SessionStatus } from './types';
import {
  registerSearchSessionEBTManagerAnalytics,
  SearchSessionEBTManager,
  type ISearchSessionEBTManager,
} from './ebt_manager';

export interface SearchSessionDependencies {
  savedObjectsClient: SavedObjectsClientContract;
}

export interface SearchSessionStatusDependencies extends SearchSessionDependencies {
  asCurrentUserElasticsearchClient: ElasticsearchClient;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface SetupDependencies {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface StartDependencies {}

/**
 * Used to batch requests that add searches into the session saved object
 */
const DEBOUNCE_TRACK_ID_WAIT = 1000;
const DEBOUNCE_TRACK_ID_MAX_WAIT = 5000;
interface TrackIdQueueEntry {
  deps: SearchSessionDependencies;
  user: AuthenticatedUser | null;
  sessionId: string;
  resolve: () => void;
  reject: (reason?: unknown) => void;

  searchInfo: SearchSessionRequestInfo;
  requestHash: string;
  skipRealmCheck: boolean;
}

export class SearchSessionService implements ISearchSessionService {
  private sessionConfig: SearchSessionsConfigSchema;
  private setupCompleted = false;
  private searchSessionEBTManager?: ISearchSessionEBTManager;

  constructor(
    private readonly logger: Logger,
    private readonly config: ConfigSchema,
    private readonly version: string
  ) {
    this.sessionConfig = this.config.search.sessions;
  }

  public setup(core: CoreSetup, deps: SetupDependencies) {
    this.setupCompleted = true;
    registerSearchSessionEBTManagerAnalytics(core);
    this.searchSessionEBTManager = new SearchSessionEBTManager(
      core.analytics.reportEvent,
      this.logger
    );
  }

  public start(core: CoreStart, deps: StartDependencies) {
    if (!this.setupCompleted)
      throw new Error('SearchSessionService setup() must be called before start()');
  }

  public stop() {}

  public save = async (
    deps: SearchSessionDependencies,
    user: AuthenticatedUser | null,
    sessionId: string,
    {
      name,
      appId,
      locatorId,
      initialState = {},
      restoreState = {},
    }: Partial<SearchSessionSavedObjectAttributes>
  ) => {
    if (!this.sessionConfig.enabled) throw new Error('Search sessions are disabled');
    if (!name) throw new Error('Name is required');
    if (!appId) throw new Error('AppId is required');
    if (!locatorId) throw new Error('locatorId is required');

    return this.create(deps, user, sessionId, {
      name,
      appId,
      locatorId,
      initialState,
      restoreState,
    });
  };

  private create = (
    { savedObjectsClient }: SearchSessionDependencies,
    user: AuthenticatedUser | null,
    sessionId: string,
    attributes: Partial<SearchSessionSavedObjectAttributes>
  ) => {
    this.logger.debug(`SearchSessionService: create | ${sessionId}`);

    const realmType = user?.authentication_realm.type;
    const realmName = user?.authentication_realm.name;
    const username = user?.username;

    return savedObjectsClient.create<SearchSessionSavedObjectAttributes>(
      SEARCH_SESSION_TYPE,
      {
        sessionId,
        expires: new Date(
          Date.now() + this.sessionConfig.defaultExpiration.asMilliseconds()
        ).toISOString(),
        created: new Date().toISOString(),
        idMapping: {},
        version: this.version,
        realmType,
        realmName,
        username,
        ...attributes,
      },
      { id: sessionId }
    );
  };

  public get = async (
    { savedObjectsClient }: SearchSessionDependencies,
    user: AuthenticatedUser | null,
    sessionId: string,
    skipRealmCheck: boolean = false
  ) => {
    this.logger.debug(`get | ${sessionId}`);
    const session = await savedObjectsClient.get<SearchSessionSavedObjectAttributes>(
      SEARCH_SESSION_TYPE,
      sessionId
    );

    this.throwOnUserConflict(user, session, skipRealmCheck);

    return session;
  };

  public find = async (
    { savedObjectsClient, asCurrentUserElasticsearchClient }: SearchSessionStatusDependencies,
    user: AuthenticatedUser | null,
    options: Omit<SavedObjectsFindOptions, 'type'>
  ): Promise<SearchSessionsFindResponse> => {
    const userFilters =
      user === null
        ? []
        : [
            nodeBuilder.is(
              `${SEARCH_SESSION_TYPE}.attributes.realmType`,
              `${user.authentication_realm.type}`
            ),
            nodeBuilder.is(
              `${SEARCH_SESSION_TYPE}.attributes.realmName`,
              `${user.authentication_realm.name}`
            ),
            nodeBuilder.is(`${SEARCH_SESSION_TYPE}.attributes.username`, `${user.username}`),
          ];
    const filterKueryNode =
      typeof options.filter === 'string' ? fromKueryExpression(options.filter) : options.filter;
    const filter = nodeBuilder.and(userFilters.concat(filterKueryNode ?? []));
    const findResponse = await savedObjectsClient.find<SearchSessionSavedObjectAttributes>({
      ...options,
      filter,
      type: SEARCH_SESSION_TYPE,
    });

    const sessionStatuses = await Promise.all(
      findResponse.saved_objects.map(async (so) => {
        const status = await getSessionStatus(
          {
            esClient: asCurrentUserElasticsearchClient,
          },
          so.attributes,
          { preferCachedStatus: true }
        );
        return { ...status, id: so.id };
      })
    );

    return {
      ...findResponse,
      statuses: this.mapSessionStatusesToResponse(sessionStatuses),
    };
  };

  public update = async (
    deps: SearchSessionDependencies,
    user: AuthenticatedUser | null,
    sessionId: string,
    attributes: Partial<SearchSessionSavedObjectAttributes>,
    skipRealmCheck: boolean = false
  ) => {
    this.logger.debug(`SearchSessionService: update | ${sessionId}`);
    if (!this.sessionConfig.enabled) throw new Error('Search sessions are disabled');
    await this.get(deps, user, sessionId, skipRealmCheck); // Verify correct user
    return deps.savedObjectsClient.update<SearchSessionSavedObjectAttributes>(
      SEARCH_SESSION_TYPE,
      sessionId,
      {
        ...attributes,
      },
      { retryOnConflict: this.sessionConfig.maxUpdateRetries }
    );
  };

  public async extend(
    deps: SearchSessionDependencies,
    user: AuthenticatedUser | null,
    sessionId: string,
    expires: Date
  ) {
    this.logger.debug(`SearchSessionService: extend | ${sessionId}`);
    return this.update(deps, user, sessionId, { expires: expires.toISOString() });
  }

  public cancel = async (
    deps: SearchSessionDependencies,
    user: AuthenticatedUser | null,
    sessionId: string
  ) => {
    this.logger.debug(`SearchSessionService: cancel | ${sessionId}`);
    return this.update(deps, user, sessionId, {
      isCanceled: true,
    });
  };

  public delete = async (
    deps: SearchSessionDependencies,
    user: AuthenticatedUser | null,
    sessionId: string
  ) => {
    if (!this.sessionConfig.enabled) throw new Error('Search sessions are disabled');
    this.logger.debug(`SearchSessionService: delete | ${sessionId}`);
    await this.get(deps, user, sessionId); // Verify correct user
    return deps.savedObjectsClient.delete(SEARCH_SESSION_TYPE, sessionId);
  };

  /**
   * Used to batch requests that add searches into the session saved object
   * Requests are grouped and executed per sessionId
   * @internal
   */
  private readonly trackIdBatchQueueMap = new Map<
    string /* sessionId */,
    { queue: TrackIdQueueEntry[]; scheduleProcessQueue: () => void }
  >();

  /**
   * Tracks the given search request/search ID in the saved session.
   * Instead of updating search-session saved object immediately, it debounces and batches updates internally,
   * to reduce number of saved object updates and reduce a chance of running over update retries limit
   * @internal
   */
  public trackId = async (
    deps: SearchSessionDependencies,
    user: AuthenticatedUser | null,
    searchId: string,
    options: ISearchOptions,
    skipRealmCheck: boolean = false
  ) => {
    const { sessionId, strategy = ENHANCED_ES_SEARCH_STRATEGY, requestHash } = options;
    if (!this.sessionConfig.enabled || !sessionId || !searchId) return;
    if (!requestHash) {
      this.logger.error(
        `SearchSessionService: trackId | Missing requestHash | sessionId: "${sessionId}" | searchId:"${searchId}"`
      );
      return;
    }

    this.logger.debug(
      `SearchSessionService: trackId | sessionId: "${sessionId}" | searchId:"${searchId}" | requestHash: "${requestHash}"`
    );

    const searchInfo: SearchSessionRequestInfo = {
      id: searchId,
      strategy: strategyToString(strategy),
    };

    if (!this.trackIdBatchQueueMap.has(sessionId)) {
      this.trackIdBatchQueueMap.set(sessionId, {
        queue: [],
        scheduleProcessQueue: debounce(
          () => {
            const queue = this.trackIdBatchQueueMap.get(sessionId)?.queue ?? [];
            if (queue.length === 0) return;
            this.trackIdBatchQueueMap.delete(sessionId);
            const batchedIdMapping = queue.reduce<SearchSessionSavedObjectAttributes['idMapping']>(
              (res, next) => {
                res[next.requestHash] = next.searchInfo;
                return res;
              },
              {}
            );
            this.update(
              queue[0].deps,
              queue[0].user,
              sessionId,
              { idMapping: batchedIdMapping },
              queue[0].skipRealmCheck
            )
              .then(() => {
                queue.forEach((q) => q.resolve());
              })
              .catch((e) => {
                queue.forEach((q) => q.reject(e));
              });
          },
          DEBOUNCE_TRACK_ID_WAIT,
          { maxWait: DEBOUNCE_TRACK_ID_MAX_WAIT }
        ),
      });
    }

    const deferred = defer<void>();
    const { queue, scheduleProcessQueue } = this.trackIdBatchQueueMap.get(sessionId)!;
    queue.push({
      deps,
      sessionId,
      searchInfo,
      requestHash,
      resolve: deferred.resolve,
      reject: deferred.reject,
      user,
      skipRealmCheck,
    });

    scheduleProcessQueue();

    return deferred.promise;
  };

  public async getSearchIdMapping(
    deps: SearchSessionDependencies,
    user: AuthenticatedUser | null,
    sessionId: string
  ) {
    const searchSession = await this.get(deps, user, sessionId);

    const searchIdMapping = new Map<string, string>();
    Object.values(searchSession.attributes.idMapping).forEach((requestInfo) => {
      searchIdMapping.set(requestInfo.id, requestInfo.strategy);
    });
    return searchIdMapping;
  }

  public async status(
    deps: SearchSessionStatusDependencies,
    user: AuthenticatedUser | null,
    sessionId: string
  ): Promise<SearchSessionStatusResponse> {
    this.logger.debug(`SearchSessionService: status | ${sessionId}`);
    const session = await this.get(deps, user, sessionId);

    const sessionStatus = await getSessionStatus(
      {
        esClient: deps.asCurrentUserElasticsearchClient,
      },
      session.attributes,
      { preferCachedStatus: true }
    );

    return this.mapSessionStatusToResponse(sessionStatus);
  }

  public async updateStatuses(
    deps: SearchSessionStatusDependencies,
    user: AuthenticatedUser | null,
    sessionIds: string[]
  ): Promise<SearchSessionStatusesResponse> {
    this.logger.debug(`SearchSessionService: updateStatus | ${sessionIds}`);
    const sessions = await this.bulkGet(deps, user, sessionIds);

    const sessionStatuses = await Promise.all(
      sessions.map(async (so) => {
        const status = await updateSessionStatus(
          {
            esClient: deps.asCurrentUserElasticsearchClient,
            savedObjectsClient: deps.savedObjectsClient,
            searchSessionEBTManager: this.searchSessionEBTManager,
          },
          so
        );
        return { ...status, id: so.id };
      })
    );

    const sessionsData: SearchSessionStatusesResponse['sessions'] = {};
    sessions.forEach((session) => {
      sessionsData[session.id] = {
        name: session.attributes.name,
        restoreState: session.attributes.restoreState,
        locatorId: session.attributes.locatorId,
        appId: session.attributes.appId,
      };
    });

    return { statuses: this.mapSessionStatusesToResponse(sessionStatuses), sessions: sessionsData };
  }

  private bulkGet = async (
    { savedObjectsClient }: SearchSessionDependencies,
    user: AuthenticatedUser | null,
    sessionIds: string[]
  ) => {
    this.logger.debug(`bulkGet | ${sessionIds}`);
    const sessions = await savedObjectsClient.bulkGet<SearchSessionSavedObjectAttributes>(
      sessionIds.map((id) => ({ id, type: SEARCH_SESSION_TYPE }))
    );
    const filteredSessions = sessions.saved_objects.filter(
      (session) => !isSavedObjectErrorResult(session)
    );
    filteredSessions.forEach((session) => this.throwOnUserConflict(user, session));
    return filteredSessions;
  };

  /**
   * Look up an existing search ID that matches the given request in the given session so that the
   * request can continue rather than restart.
   * @internal
   */
  public getId = async (
    deps: SearchSessionDependencies,
    user: AuthenticatedUser | null,
    searchRequest: IKibanaSearchRequest,
    { sessionId, isStored, isRestore, requestHash }: ISearchOptions,
    skipRealmCheck: boolean = false
  ) => {
    if (!this.sessionConfig.enabled) {
      throw new Error('Background search is disabled');
    } else if (!sessionId) {
      throw new Error('Session ID is required');
    } else if (!isStored) {
      throw new Error('Cannot get search ID from a search that is not stored');
    } else if (!isRestore) {
      throw new Error('Get search ID is only supported when restoring a background search');
    } else if (!requestHash) {
      throw new Error('Request hash is required to get search ID from session');
    }

    const session = await this.get(deps, user, sessionId, skipRealmCheck);
    if (!Object.hasOwn(session.attributes.idMapping, requestHash)) {
      this.logger.debug(`SearchSessionService: getId | ${sessionId} | ${requestHash} not found`);
      this.logger.error(
        `SearchSessionService: getId not found search with params: ${JSON.stringify(
          searchRequest.params
        )}`
      );
      throw new NoSearchIdInSessionError();
    }
    this.logger.debug(`SearchSessionService: getId | ${sessionId} | ${requestHash}`);

    return session.attributes.idMapping[requestHash].id;
  };

  public asScopedProvider = ({ security, savedObjects, elasticsearch }: CoreStart) => {
    return (request: KibanaRequest) => {
      const user = security.authc.getCurrentUser(request) ?? null;
      const savedObjectsClient = savedObjects.getScopedClient(request, {
        includedHiddenTypes: [SEARCH_SESSION_TYPE],
      });

      const asCurrentUserElasticsearchClient = elasticsearch.client.asScoped(request).asCurrentUser;

      const deps = {
        savedObjectsClient,
        asCurrentUserElasticsearchClient,
      };
      return {
        getId: this.getId.bind(this, deps, user),
        trackId: this.trackId.bind(this, deps, user),
        getSearchIdMapping: this.getSearchIdMapping.bind(this, deps, user),
        save: this.save.bind(this, deps, user),
        get: this.get.bind(this, deps, user),
        find: this.find.bind(this, deps, user),
        update: this.update.bind(this, deps, user),
        extend: this.extend.bind(this, deps, user),
        cancel: this.cancel.bind(this, deps, user),
        delete: this.delete.bind(this, deps, user),
        status: this.status.bind(this, deps, user),
        updateStatuses: this.updateStatuses.bind(this, deps, user),
        getConfig: () => this.config.search.sessions,
      };
    };
  };

  private throwOnUserConflict = (
    user: AuthenticatedUser | null,
    session?: SavedObject<SearchSessionSavedObjectAttributes>,
    skipRealmCheck: boolean = false
  ) => {
    if (user === null || !session) return;

    if (skipRealmCheck) {
      this.logger.debug(
        `Skipping realm check for user ${user.username} when accessing search session ${session.attributes.sessionId}.`
      );
    }

    let matchesUser = true;

    if (user.username !== session.attributes.username) {
      matchesUser = false;
    }

    if (
      !skipRealmCheck &&
      (user.authentication_realm.type !== session.attributes.realmType ||
        user.authentication_realm.name !== session.attributes.realmName)
    ) {
      matchesUser = false;
    }

    if (!matchesUser) {
      this.logger.debug(
        `User ${user.username} has no access to search session ${session.attributes.sessionId}`
      );
      throw notFound();
    }
  };

  private mapSessionStatusesToResponse(
    sessionStatuses: Array<SessionStatus & { id: string }>
  ): SearchSessionStatusesResponse['statuses'] {
    const statuses: Record<string, SearchSessionStatusResponse> = {};

    sessionStatuses.forEach((sessionStatus) => {
      statuses[sessionStatus.id] = this.mapSessionStatusToResponse(sessionStatus);
    });

    return statuses;
  }

  private mapSessionStatusToResponse(sessionStatus: SessionStatus): SearchSessionStatusResponse {
    const erroresSearches = sessionStatus.searchStatuses?.filter(
      (search) => search.status === SearchStatus.ERROR && search.error
    );

    return {
      status: sessionStatus.status,
      errors: erroresSearches?.map((search) => this.mapSearchError(search.id, search.error!)) || [],
    };
  }

  private mapSearchError(searchId: string, error: NonNullable<SearchSessionRequestInfo['error']>) {
    if (error.message)
      return i18n.translate('data.search.statusThrow', {
        defaultMessage: `Search status for search with id {searchId} threw an error {message} (statusCode: {errorCode})`,
        values: {
          message: error.message,
          errorCode: error.code,
          searchId,
        },
      });

    return i18n.translate('data.search.statusError', {
      defaultMessage: `Search {searchId} completed with a {errorCode} status`,
      values: { searchId, errorCode: error.code },
    });
  }
}
