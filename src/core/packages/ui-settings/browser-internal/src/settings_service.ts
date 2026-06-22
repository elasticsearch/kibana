/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Subject } from 'rxjs';

import type { InternalInjectedMetadataSetup } from '@kbn/core-injected-metadata-browser-internal';
import type { InternalHttpSetup } from '@kbn/core-http-browser-internal';
import type { SettingsStart, SettingsSetup } from '@kbn/core-ui-settings-browser';
import { UiSettingsApi } from './ui_settings_api';
import { UiSettingsClient } from './ui_settings_client';
import { UiSettingsGlobalClient } from './ui_settings_global_client';
import { UiSettingsMetadataClient } from './ui_settings_metadata_client';

export interface SettingsServiceDeps {
  http: InternalHttpSetup;
  injectedMetadata: InternalInjectedMetadataSetup;
}

/** @internal */
export class SettingsService {
  private uiSettingsApi?: UiSettingsApi;
  private uiSettingsClient?: UiSettingsClient;
  private uiSettingsGlobalClient?: UiSettingsGlobalClient;
  private metadataClient?: UiSettingsMetadataClient;
  private done$ = new Subject();

  public setup({ http, injectedMetadata }: SettingsServiceDeps): SettingsSetup {
    this.uiSettingsApi = new UiSettingsApi(http);
    http.addLoadingCountSource(this.uiSettingsApi.getLoadingCount$());

    // TODO: Migrate away from legacyMetadata https://github.com/elastic/kibana/issues/22779
    const legacyMetadata = injectedMetadata.getLegacyMetadata();

    this.uiSettingsClient = new UiSettingsClient({
      api: this.uiSettingsApi,
      defaults: legacyMetadata.uiSettings.defaults,
      initialSettings: legacyMetadata.uiSettings.user,
      done$: this.done$,
    });

    this.uiSettingsGlobalClient = new UiSettingsGlobalClient({
      api: this.uiSettingsApi,
      defaults: legacyMetadata.globalUiSettings.defaults,
      initialSettings: legacyMetadata.globalUiSettings.user,
      done$: this.done$,
    });

    this.metadataClient = new UiSettingsMetadataClient(http);

    return {
      client: this.uiSettingsClient,
      globalClient: this.uiSettingsGlobalClient,
      metadata: this.metadataClient,
    };
  }

  public start(): SettingsStart {
    if (!this.uiSettingsClient || !this.uiSettingsGlobalClient || !this.metadataClient) {
      throw new Error('#setup must be called before start');
    }
    return {
      client: this.uiSettingsClient,
      globalClient: this.uiSettingsGlobalClient,
      metadata: this.metadataClient,
    };
  }

  public stop() {
    this.done$.complete();

    if (this.uiSettingsApi) {
      this.uiSettingsApi.stop();
    }
  }
}
