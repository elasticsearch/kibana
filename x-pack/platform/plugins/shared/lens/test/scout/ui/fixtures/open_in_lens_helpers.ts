/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PageObjects } from '@kbn/scout';

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
