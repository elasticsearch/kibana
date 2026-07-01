/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpStart } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import { isNil, omit, omitBy } from 'lodash';

import type { DataSetWithName, Dataset } from '../common';
import { DATA_SETS_LIST_ROUTE_PATH, getDataSetByIdApiPath } from '../common';

interface GetDataSetsResponse {
  data_sets: DataSetWithName[];
}

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
 * Browser client for data set management HTTP APIs (mirrors {@link SampleDataSetsClient} shape).
 * Uses internal routes that proxy to Elasticsearch.
 */
export class DatasetsClient {
  constructor(private readonly http: HttpStart) {}

  public async get(): Promise<DataSetWithName[]> {
    const body = await this.http.get<GetDataSetsResponse>(DATA_SETS_LIST_ROUTE_PATH);
    return body.data_sets;
  }

  public async add(dataSet: DataSetWithName): Promise<void> {
    const { name } = dataSet;
    const nameTrimmed = name.trim();
    if (!nameTrimmed) {
      throw new Error(
        i18n.translate('xpack.dataFederation.errors.dataSetNameRequired', {
          defaultMessage: 'Name is required.',
        })
      );
    }
    const withoutName = omit(dataSet, 'name');
    const body = omitBy(
      {
        ...withoutName,
        settings: dataSet.settings
          ? omitEmptySettingsFields(dataSet.settings as object)
          : undefined,
      },
      isNil
    ) as unknown as Dataset;
    await this.http.put(getDataSetByIdApiPath(nameTrimmed), {
      body: JSON.stringify(body),
    });
  }

  /**
   * Deletes each data set whose `name` matches the given name(s).
   * Names are sent as the path id (same convention as {@link DatasetsClient.add}).
   */
  public async delete(names: string | readonly string[]): Promise<void> {
    const list = typeof names === 'string' ? [names] : [...names];
    await Promise.all(list.map((name) => this.http.delete(getDataSetByIdApiPath(name))));
  }
}
