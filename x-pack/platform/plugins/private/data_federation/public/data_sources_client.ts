/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpStart } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import { isNil, omit, omitBy } from 'lodash';
import type { DataSourceWithSecrets } from '../common';
import { DATA_SOURCES_LIST_ROUTE_PATH, getDataSourceByIdApiPath, type DataSource } from '../common';

interface GetDataSourcesResponse {
  data_sources: DataSource[];
}

// todo try to refactor out
function omitEmptySettingsFields(settings: object): Record<string, unknown> {
  return omitBy(settings as Record<string, unknown>, (value) => {
    if (value === undefined || value === null) {
      return true;
    }
    if (typeof value === 'string' && value.trim() === '') {
      return true;
    }
    return false;
  });
}
/**
 * Browser client for data source management HTTP APIs (mirrors {@link SampleDataSourcesClient}).
 * Uses internal routes that proxy to Elasticsearch.
 */
export class DataSourcesClient {
  constructor(private readonly http: HttpStart) {}

  public async get(): Promise<DataSource[]> {
    const body = await this.http.get<GetDataSourcesResponse>(DATA_SOURCES_LIST_ROUTE_PATH);
    return body.data_sources;
  }

  public async getById(id: string): Promise<DataSource> {
    const trimmed = id.trim();
    if (!trimmed) {
      throw new Error(
        i18n.translate('xpack.dataFederation.errors.idRequired', {
          defaultMessage: 'Name is required.',
        })
      );
    }

    return await this.http.get<DataSource>(getDataSourceByIdApiPath(trimmed));
  }

  // todo also have update method
  public async add(dataSource: DataSourceWithSecrets): Promise<void> {
    const { name } = dataSource;
    const nameTrimmed = name.trim();
    if (!nameTrimmed) {
      throw new Error(
        i18n.translate('xpack.dataFederation.errors.idRequired', {
          defaultMessage: 'Name is required.',
        })
      );
    }

    const withoutName = omit(dataSource, 'name');
    const body = omitBy(
      {
        ...withoutName,
        settings: omitEmptySettingsFields(dataSource.settings),
      },
      isNil
      // todo types could be better
    ) as unknown as Omit<DataSourceWithSecrets, 'name'>;
    await this.http.put(getDataSourceByIdApiPath(nameTrimmed), {
      body: JSON.stringify(body),
    });
  }

  /**
   * Deletes each data source whose `name` matches the given name(s).
   * Names are sent as the path id (same convention as {@link DataSourcesClient.add}).
   */
  public async delete(names: string | readonly string[]): Promise<void> {
    const list = typeof names === 'string' ? [names] : names;
    await Promise.all(list.map((name) => this.http.delete(getDataSourceByIdApiPath(name))));
  }
}
