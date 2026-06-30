/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { merge } from 'lodash';
import type { Observable } from 'rxjs';
import { BehaviorSubject, distinctUntilChanged, skipWhile, Subject, switchMap } from 'rxjs';

import type { HttpStart } from '@kbn/core/public';
import { CURRENT_USER_DATA_PATH } from '@kbn/core-user-profile-browser';
import type {
  UserProfileAPIClient as UserProfileAPIClientType,
  UserProfileBulkGetParams,
  UserProfileGetCurrentParams,
  UserProfileSuggestParams,
} from '@kbn/security-plugin-types-public';
import type { UserProfileData } from '@kbn/user-profile-components';

import type { GetUserProfileResponse, UserProfile } from '../../../common';

export class UserProfileAPIClient implements UserProfileAPIClientType {
  private readonly _cache = new Map<string, Promise<GetUserProfileResponse>>();

  private readonly internalDataUpdates$: Subject<UserProfileData> = new Subject();

  /**
   * Emits event whenever user profile is changed by the user.
   */
  public readonly dataUpdates$: Observable<UserProfileData> =
    this.internalDataUpdates$.asObservable();

  private readonly _userProfile$ = new BehaviorSubject<UserProfileData | null>(null);
  private readonly _enabled$ = new BehaviorSubject(false);
  private readonly _userProfileLoaded$ = new BehaviorSubject(false);

  /** Observable of the current user profile data */
  public readonly userProfile$ = this._userProfile$.asObservable();
  public readonly userProfileLoaded$ = this._userProfileLoaded$
    .asObservable()
    .pipe(distinctUntilChanged());
  public enabled$: Observable<boolean>;

  constructor(private readonly http: HttpStart) {
    this.enabled$ = this.userProfileLoaded$.pipe(
      skipWhile((loaded) => !loaded),
      switchMap(() => this._enabled$.asObservable()),
      distinctUntilChanged()
    );
  }

  public start() {
    this.getCurrent({ dataPath: CURRENT_USER_DATA_PATH }).catch(() => {});
  }

  /**
   * Retrieves the user profile of the current user. If the profile isn't available, e.g. for the anonymous users or
   * users authenticated via authenticating proxies, the `null` value is returned.
   * @param [params] Get current user profile operation parameters.
   * @param params.dataPath By default `getCurrent()` returns user information, but does not return any user data. The
   * optional "dataPath" parameter can be used to return personal data for this user.
   */
  public getCurrent<D extends UserProfileData>(params?: UserProfileGetCurrentParams) {
    if (this.http.anonymousPaths.isAnonymous(window.location.pathname)) {
      this._enabled$.next(false);
      this._userProfileLoaded$.next(true);
      return Promise.reject(new Error('Unable to retrieve user profile for anonymous paths'));
    }

    const key = params?.dataPath ?? '__profile__';

    if (!this._cache.has(key)) {
      const req = this.http
        .get<GetUserProfileResponse<D>>('/internal/security/user_profile', {
          query: { dataPath: params?.dataPath },
        })
        .then((response) => {
          this._userProfile$.next(merge(this._userProfile$.getValue(), response?.data ?? {}));
          this._enabled$.next(true);
          this._userProfileLoaded$.next(true);
          return response;
        })
        .catch((err) => {
          this._cache.delete(key);
          const notFound = err?.response?.status === 404;
          this._enabled$.next(notFound ? false : true);
          this._userProfileLoaded$.next(true);
          return Promise.reject(err);
        });

      this._cache.set(key, req);
    }

    return this._cache.get(key)! as Promise<GetUserProfileResponse<D>>;
  }

  /**
   * Retrieves multiple user profiles by their identifiers.
   * @param params Bulk get operation parameters.
   * @param params.uids List of user profile identifiers.
   * @param params.dataPath By default Elasticsearch returns user information, but does not return any user data. The
   * optional "dataPath" parameter can be used to return personal data for the requested user profiles.
   */
  public bulkGet<D extends UserProfileData>(params: UserProfileBulkGetParams) {
    return this.http.post<Array<UserProfile<D>>>('/internal/security/user_profile/_bulk_get', {
      // Convert `Set` with UIDs to an array to make it serializable.
      body: JSON.stringify({ ...params, uids: [...params.uids] }),
    });
  }

  /**
   * Suggests multiple user profiles by search criteria.
   *
   * Note: This endpoint is not provided out-of-the-box by the platform. You need to expose your own
   * version within your app. An example of how to do this can be found in:
   * `examples/user_profile_examples/server/plugin.ts`
   *
   * @param path Path to your app's suggest endpoint.
   * @param params Suggest operation parameters.
   * @param params.name Query string used to match name-related fields in user profiles. The
   * following fields are treated as name-related: username, full_name and email.
   * @param params.size Desired number of suggestions to return. The default value is 10.
   * @param params.dataPath By default, suggest API returns user information, but does not return
   * any user data. The optional "dataPath" parameter can be used to return personal data for this
   * user (within `kibana` namespace only).
   */
  public suggest<D extends UserProfileData>(path: string, params: UserProfileSuggestParams) {
    return this.http.post<Array<UserProfile<D>>>(path, {
      body: JSON.stringify(params),
    });
  }

  /**
   * Updates user profile data of the current user.
   * @param data Application data to be written (merged with existing data).
   */
  public update<D extends UserProfileData>(data: D) {
    // Optimistic update the user profile Observable.
    const previous = this._userProfile$.getValue();
    this._userProfile$.next(data);

    return this.http
      .post('/internal/security/user_profile/_data', { body: JSON.stringify(data) })
      .then(() => {
        this._cache.clear();
        this.internalDataUpdates$.next(data);
      })
      .catch((err) => {
        // Revert the user profile data to the previous state.
        this._userProfile$.next(previous);
        return Promise.reject(err);
      });
  }

  /**
   * Updates user profile data of the current user.
   * @param data Application data to be written (merged with existing data).
   */
  public partialUpdate<D extends Partial<UserProfileData>>(data: D) {
    const updated = merge(this._userProfile$.getValue(), data);
    return this.update(updated);
  }
}
