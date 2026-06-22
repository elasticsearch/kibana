/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DebugState } from '@elastic/charts';
import { MISSING_TOKEN } from '@kbn/field-formats-common';
import type { PageObjects, ScoutPage } from '@kbn/scout';

interface ElasticChartDebugContext {
  addInitScript: (script: () => void) => Promise<{ dispose: () => Promise<void> }>;
}

const CONVERT_TO_LENS_ACTION = 'embeddablePanelAction-ACTION_EDIT_IN_LENS';

export interface ImportedSavedObject {
  id: string;
  type: string;
  title: string;
}

/** Resolves a dashboard id after `scoutSpace.savedObjects.load()` (createNewCopies assigns new ids). */
export function getImportedDashboardId(
  imported: ImportedSavedObject[],
  dashboardTitle: string
): string {
  const dashboard = imported.find(
    (savedObject) => savedObject.type === 'dashboard' && savedObject.title === dashboardTitle
  );
  if (!dashboard?.id) {
    throw new Error(`Dashboard "${dashboardTitle}" was not imported`);
  }
  return dashboard.id;
}

/** Clicks the "Open in Lens" panel action for the panel with the given title. */
export async function convertToLensByTitle(
  { dashboard }: Pick<PageObjects, 'dashboard'>,
  panelTitle: string
): Promise<void> {
  await dashboard.clickPanelAction(CONVERT_TO_LENS_ACTION, panelTitle);
}

/**
 * Returns true when the "Open in Lens" panel action is available for the panel
 * with the given title.
 */
export async function canConvertToLensByTitle(
  { dashboard }: Pick<PageObjects, 'dashboard'>,
  panelTitle: string
): Promise<boolean> {
  return dashboard.panelHasAction(CONVERT_TO_LENS_ACTION, panelTitle);
}

/**
 * Opens a dashboard in edit mode by saved object id.
 * Prefer this over the listing-page link when tests may end in the Lens editor.
 */
export async function loadDashboardInEditModeById(
  { dashboard }: Pick<PageObjects, 'dashboard'>,
  dashboardId: string
): Promise<void> {
  await dashboard.openDashboardWithId(dashboardId);
  await dashboard.switchToEditMode();
}

/**
 * Opens a dashboard by title in edit mode.
 * Equivalent to the FTR `dashboard.loadDashboardInEditMode(title)`.
 */
export async function loadDashboardInEditMode(
  { dashboard }: Pick<PageObjects, 'dashboard'>,
  dashboardTitle: string
): Promise<void> {
  await dashboard.goto();
  await dashboard.clickDashboardTitleLink(dashboardTitle);
  await dashboard.switchToEditMode();
}

/** Enables elastic-charts debug state for subsequent page loads in this browser context. */
export async function enableElasticChartDebug(context: ElasticChartDebugContext): Promise<void> {
  await context.addInitScript(() => {
    (window as unknown as { _echDebugStateFlag?: boolean })._echDebugStateFlag = true;
  });
}

/** Reads `@elastic/charts` debug state from a rendered chart test subject. */
export async function getChartDebugData(
  page: ScoutPage,
  chartTestSubj: string
): Promise<DebugState> {
  const chart = page.testSubj.locator(chartTestSubj);
  await chart.locator('.echChartStatus[data-ech-render-complete="true"]').waitFor({
    state: 'attached',
    timeout: 30_000,
  });

  const debugJson = await chart.locator('.echChartStatus').getAttribute('data-ech-debug-state');
  if (!debugJson) {
    throw new Error(
      'Elastic charts debugState not found — call enableElasticChartDebug() before navigation'
    );
  }

  return JSON.parse(debugJson) as DebugState;
}

/** Reads pie slice labels from an elastic-charts partition debug state. */
export function getPieChartLabels(debugState: DebugState): string[] {
  const slices = debugState?.partition?.[0]?.partitions ?? [];

  return slices.map((slice) => formatPieSliceLabel(slice.name));
}

function formatPieSliceLabel(name: string | number): string {
  if (name === MISSING_TOKEN) {
    return 'Missing';
  }
  if (name === '__other__') {
    return 'Other';
  }
  if (typeof name === 'number') {
    return name.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ',');
  }

  return name;
}
