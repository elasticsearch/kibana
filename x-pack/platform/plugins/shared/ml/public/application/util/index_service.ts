/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataView, DataViewsContract } from '@kbn/data-views-plugin/public';

import type { Job } from '@kbn/ml-common-types/anomaly_detection_jobs/job';

import { useMlKibana } from '../contexts/kibana';

export function indexServiceFactory(dataViewsService: DataViewsContract) {
  /**
   * Retrieves the data view ID from the given name.
   * If a job is passed in, a temporary data view will be created if the requested data view doesn't exist.
   * @param name - The name or index pattern of the data view.
   * @param job - Optional job object.
   * @returns The data view ID or null if it doesn't exist.
   */
  async function getDataViewIdFromName(name: string, job?: Job): Promise<string | null> {
    // !!!!!!!!!!!!!!!!!!!!!!!! does this need to use project routing?
    const dataViews = await dataViewsService.find(name);
    const dataView = dataViews.find((dv) => dv.getIndexPattern() === name);
    if (!dataView) {
      if (job !== undefined) {
        const tempDataView = await dataViewsService.create({
          id: undefined,
          name,
          title: name,
          timeFieldName: job.data_description.time_field!,
        });
        return tempDataView.id ?? null;
      }
      return null;
    }
    return dataView.id ?? dataView.getIndexPattern();
  }

  function getDataViewById(id: string): Promise<DataView> {
    if (id) {
      return dataViewsService.get(id);
    } else {
      return dataViewsService.create({});
    }
  }

  async function loadDataViewListItems() {
    return (await dataViewsService.getIdsWithTitle()).sort((a, b) =>
      a.title.localeCompare(b.title)
    );
  }

  return { getDataViewIdFromName, getDataViewById, loadDataViewListItems };
}

export type MlIndexUtils = ReturnType<typeof indexServiceFactory>;

export const useMlIndexUtils = () => indexServiceFactory(useMlKibana().services.data.dataViews);
