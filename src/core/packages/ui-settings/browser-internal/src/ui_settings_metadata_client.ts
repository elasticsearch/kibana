/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { InternalHttpSetup } from '@kbn/core-http-browser-internal';
import type {
  IUiSettingsMetadataClient,
  UiSettingsMetadataState,
} from '@kbn/core-ui-settings-browser';

interface MetadataResponse {
  settings: UiSettingsMetadataState;
}

export class UiSettingsMetadataClient implements IUiSettingsMetadataClient {
  constructor(private readonly http: InternalHttpSetup) {}

  async getAll(scope: 'namespace' | 'global'): Promise<UiSettingsMetadataState> {
    const path =
      scope === 'namespace'
        ? '/internal/kibana/settings/metadata'
        : '/internal/kibana/global_settings/metadata';

    const { settings } = await this.http.fetch<MetadataResponse>(path, { method: 'GET' });
    return settings;
  }
}
