/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { BehaviorSubject } from 'rxjs';
import type { InternalHttpSetup } from '@kbn/core-http-browser-internal';

import type { UiSettingsRuntimeState } from '@kbn/core-ui-settings-browser';
import type { UiSettingsScope } from '@kbn/core-ui-settings-common';

export interface UiSettingsApiResponse {
  settings: UiSettingsRuntimeState;
}

export interface ValidationApiResponse {
  valid: boolean;
  errorMessage?: string;
}

interface Changes {
  values: {
    [key: string]: any;
  };

  callback(error?: Error, response?: UiSettingsApiResponse): void;
}

const NOOP_CHANGES = {
  values: {},
  callback: () => {
    // noop
  },
};

export class UiSettingsApi {
  private pendingChanges?: Changes;
  private sendInProgress = false;

  private readonly loadingCount$ = new BehaviorSubject(0);

  constructor(private readonly http: InternalHttpSetup) {}

  /**
   * Adds a key+value that will be sent to the server ASAP. If a request is
   * already in progress it will wait until the previous request is complete
   * before sending the next request
   */
  public batchSet(key: string, value: any) {
    return new Promise<UiSettingsApiResponse>((resolve, reject) => {
      const prev = this.pendingChanges || NOOP_CHANGES;

      this.pendingChanges = {
        values: {
          ...prev.values,
          [key]: value,
        },

        callback(error, resp) {
          prev.callback(error, resp);

          if (error) {
            reject(error);
          } else {
            resolve(resp!);
          }
        },
      };

      this.flushPendingChanges('namespace');
    });
  }

  public batchSetGlobal(key: string, value: any) {
    return new Promise<UiSettingsApiResponse>((resolve, reject) => {
      const prev = this.pendingChanges || NOOP_CHANGES;

      this.pendingChanges = {
        values: {
          ...prev.values,
          [key]: value,
        },

        callback(error, resp) {
          prev.callback(error, resp);

          if (error) {
            reject(error);
          } else {
            resolve(resp!);
          }
        },
      };

      this.flushPendingChanges('global');
    });
  }

  /**
   * Sends a validation request to the server for the provided key+value pair.
   */
  public async validate(key: string, value: any): Promise<ValidationApiResponse> {
    return await this.sendRequest('POST', `/internal/kibana/settings/${key}/validate`, {
      value,
    });
  }

  /**
   * Gets an observable that notifies subscribers of the current number of active requests
   */
  public getLoadingCount$() {
    return this.loadingCount$.asObservable();
  }

  /**
   * Prepares the uiSettings API to be discarded
   */
  public stop() {
    this.loadingCount$.complete();
  }

  /**
   * Report back if there are pending changes waiting to be sent.
   */
  public hasPendingChanges() {
    return !!(this.pendingChanges && this.sendInProgress);
  }

  /**
   * If there are changes that need to be sent to the server and there is not already a
   * request in progress, this method will start a request sending those changes. Once
   * the request is complete `flushPendingChanges()` will be called again, and if the
   * prerequisites are still true (because changes were queued while the request was in
   * progress) then another request will be started until all pending changes have been
   * sent to the server.
   */
  private async flushPendingChanges(scope: UiSettingsScope) {
    if (!this.pendingChanges) {
      return;
    }

    if (this.sendInProgress) {
      return;
    }

    const changes = this.pendingChanges;
    this.pendingChanges = undefined;

    try {
      this.sendInProgress = true;
      const path =
        scope === 'namespace' ? '/internal/kibana/settings' : '/internal/kibana/global_settings';
      changes.callback(
        undefined,
        await this.sendRequest('POST', path, {
          changes: changes.values,
        })
      );
    } catch (error) {
      changes.callback(error);
    } finally {
      this.sendInProgress = false;
      this.flushPendingChanges(scope);
    }
  }

  /**
   * Calls window.fetch() with the proper headers and error handling logic.
   */
  private async sendRequest(method: string, path: string, body: any): Promise<any> {
    try {
      this.loadingCount$.next(this.loadingCount$.getValue() + 1);

      return await this.http.fetch(path, {
        method,
        body: JSON.stringify(body),
        headers: {
          accept: 'application/json',
        },
      });
    } catch (err) {
      if (err.response) {
        if (err.response.status === 400) {
          throw new Error(err.body.message);
        }
        if (err.response.status > 400) {
          throw new Error(`Request failed with status code: ${err.response.status}`);
        }
      }
      throw err;
    } finally {
      this.loadingCount$.next(this.loadingCount$.getValue() - 1);
    }
  }
}
