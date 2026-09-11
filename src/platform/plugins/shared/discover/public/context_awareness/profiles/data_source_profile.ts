/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataView } from '@kbn/data-views-plugin/common';
import type { AggregateQuery, Query } from '@kbn/es-query';
import type { SerializableRecord } from '@kbn/utility-types';
import type { DiscoverTabType } from '@kbn/discover-utils';
import type { DiscoverDataSource } from '../../../common/data_sources';
import type { ProfileStateDefinition } from '../../../common/context_awareness';
import type { AsyncProfileProvider, ContextWithProfileId } from '../profile_service';
import { AsyncProfileService } from '../profile_service';
import type { Profile } from '../types';
import type { RootContext } from './root_profile';

/**
 * Indicates the category of the data source (e.g. logs, alerts, etc.)
 */
export enum DataSourceCategory {
  Traces = 'traces',
  Metrics = 'metrics',
  Logs = 'logs',
  Security = 'security',
  Default = 'default',
}

/**
 * The data source profile interface
 */
export type DataSourceProfile = Profile;

/**
 * Parameters for the data source profile provider `resolve` method
 */
export interface DataSourceProfileProviderParams {
  /**
   * The current root context
   */
  rootContext: ContextWithProfileId<RootContext>;
  /**
   * The current data source
   */
  dataSource?: DiscoverDataSource;
  /**
   * The current data view
   */
  dataView?: DataView;
  /**
   * The current query
   */
  query?: Query | AggregateQuery;
}

/**
 * The resulting context object returned by the data source profile provider `resolve` method
 */
export interface DataSourceContext {
  /**
   * The category of the current data source
   */
  category: DataSourceCategory;
  /**
   * Optional profile state definition whose URL fields should sync with Discover's URL.
   */
  profileState?: ProfileStateDefinition<SerializableRecord>;
  /**
   * Optional tab type identifying the kind of experience this tab represents (e.g. metrics).
   */
  tabType?: DiscoverTabType;
}

export type DataSourceProfileProvider<TProviderContext = {}> = AsyncProfileProvider<
  DataSourceProfile,
  DataSourceProfileProviderParams,
  DataSourceContext & TProviderContext
>;

export class DataSourceProfileService extends AsyncProfileService<DataSourceProfileProvider> {
  constructor() {
    super({
      profileId: 'default-data-source-profile',
      category: DataSourceCategory.Default,
    });
  }
}
