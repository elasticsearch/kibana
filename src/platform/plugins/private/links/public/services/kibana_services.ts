/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { BehaviorSubject } from 'rxjs';

import type { ContentManagementPublicStart } from '@kbn/content-management-plugin/public';
import type { CoreStart } from '@kbn/core/public';
import type { DashboardStart } from '@kbn/dashboard-plugin/public';
import type { EmbeddableStart } from '@kbn/embeddable-plugin/public';
import type { SavedObjectTaggingOssPluginStart } from '@kbn/saved-objects-tagging-oss-plugin/public';

import { LINKS_LIBRARY_TYPE } from '../../common';
import type { LinksStartDependencies } from '../plugin';

export let coreServices: CoreStart;
export let dashboardServices: DashboardStart;
export let embeddableService: EmbeddableStart;
export let contentManagement: ContentManagementPublicStart;
export let savedObjectsTaggingService: SavedObjectTaggingOssPluginStart | undefined;
export let trackUiMetric: (
  type: string,
  eventNames: string | string[],
  count?: number
) => void | undefined;

const servicesReady$ = new BehaviorSubject(false);

export const untilPluginStartServicesReady = () => {
  if (servicesReady$.value) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const subscription = servicesReady$.subscribe((isInitialized) => {
      if (isInitialized) {
        subscription.unsubscribe();
        resolve();
      }
    });
  });
};

export const setKibanaServices = (kibanaCore: CoreStart, deps: LinksStartDependencies) => {
  coreServices = kibanaCore;
  dashboardServices = deps.dashboard;
  embeddableService = deps.embeddable;
  contentManagement = deps.contentManagement;
  savedObjectsTaggingService = deps.savedObjectsTaggingOss;

  if (deps.usageCollection)
    trackUiMetric = deps.usageCollection.reportUiCounter.bind(
      deps.usageCollection,
      LINKS_LIBRARY_TYPE
    );

  servicesReady$.next(true);
};
