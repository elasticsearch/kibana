/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KbnClient, ApiServicesFixture, EsClient } from '@kbn/scout';
import { ML_TEST_DASHBOARD_ATTRIBUTES } from '../constants';

interface CleanupDfaTestArgs {
  apiServices: ApiServicesFixture;
  kbnClient: KbnClient;
  esClient: EsClient;
  dataViewId: string | undefined;
  dashboardId: string | undefined;
  destinationIndex: string;
}

/**
 * Creates the shared 'ML Test' dashboard saved object used in every DFA spec's beforeAll.
 * Returns the saved-object id so the caller can pass it to cleanupDfaTest.
 */
export const createMLTestDashboard = async (kbnClient: KbnClient): Promise<string> => {
  const dashboard = await kbnClient.savedObjects.create({
    type: 'dashboard',
    overwrite: false,
    attributes: ML_TEST_DASHBOARD_ATTRIBUTES,
  });
  return dashboard.id;
};

/**
 * Tears down all state mutated by a DFA spec suite:
 * - all DFA indices (via the ML cleanup API)
 * - the per-spec source data view
 * - the shared ML Test dashboard
 * - the destination index created when the job ran
 * - the destination data view auto-created alongside the destination index
 */
export const cleanupDfaTest = async ({
  apiServices,
  kbnClient,
  esClient,
  dataViewId,
  dashboardId,
  destinationIndex,
}: CleanupDfaTestArgs): Promise<void> => {
  await apiServices.ml.indices.cleanDataFrameAnalytics();
  if (dataViewId) {
    await apiServices.dataViews.delete(dataViewId);
  }
  if (dashboardId) {
    await kbnClient.savedObjects.delete({ type: 'dashboard', id: dashboardId });
  }
  await esClient.indices.delete({ index: destinationIndex, ignore_unavailable: true });
  const destViews = await apiServices.dataViews.getAll();
  const destView = destViews.data.find((dv: { title: string }) => dv.title === destinationIndex);
  if (destView) {
    await apiServices.dataViews.delete(destView.id);
  }
};
