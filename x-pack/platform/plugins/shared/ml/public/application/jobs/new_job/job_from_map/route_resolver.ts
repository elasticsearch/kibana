/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IUiSettingsClient } from '@kbn/core-ui-settings-browser';
import type { TimefilterContract } from '@kbn/data-plugin/public';
import type { SharePluginStart } from '@kbn/share-plugin/public';
import type { DataViewsContract } from '@kbn/data-views-plugin/public';
import type { CPSPluginStart } from '@kbn/cps/public/types';
import type { MlApi } from '../../../services/ml_api_service';
import { QuickGeoJobCreator } from './quick_create_job';

import { getDefaultQuery, getRisonValue } from '../utils/new_job_utils';

interface Dependencies {
  dataViews: DataViewsContract;
  kibanaConfig: IUiSettingsClient;
  timeFilter: TimefilterContract;
  share: SharePluginStart;
  mlApi: MlApi;
  cps?: CPSPluginStart;
}
export async function resolver(
  deps: Dependencies,
  dashboardRisonString: string,
  dataViewIdRisonString: string,
  embeddableRisonString: string,
  geoFieldRisonString: string,
  splitFieldRisonString: string,
  fromRisonString: string,
  toRisonString: string,
  layerRisonString?: string
) {
  const { dataViews, kibanaConfig, timeFilter, share, mlApi, cps } = deps;
  const defaultLayer = { query: getDefaultQuery(), filters: [] };

  const dashboard = getRisonValue<typeof defaultLayer>(dashboardRisonString, defaultLayer);
  const embeddable = getRisonValue<typeof defaultLayer>(embeddableRisonString, defaultLayer);

  const layer =
    layerRisonString !== undefined
      ? getRisonValue<typeof defaultLayer>(layerRisonString, defaultLayer)
      : defaultLayer;

  const geoField = getRisonValue<string>(geoFieldRisonString, '');
  const splitField = getRisonValue<string | null>(splitFieldRisonString, null);
  const dataViewId = getRisonValue<string>(dataViewIdRisonString, '');

  const from = getRisonValue<string>(fromRisonString, '');
  const to = getRisonValue<string>(toRisonString, '');

  const jobCreator = new QuickGeoJobCreator(dataViews, kibanaConfig, timeFilter, share, mlApi, cps);

  await jobCreator.createAndStashGeoJob(
    dataViewId,
    from,
    to,
    dashboard.query,
    dashboard.filters,
    embeddable.query,
    embeddable.filters,
    geoField,
    splitField,
    layer?.query
  );
}
