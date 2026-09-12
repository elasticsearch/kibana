/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TimeRange } from '@kbn/es-query';
import type {
  PublishesWritableDescription,
  PublishesWritableHideBorder,
  PublishesWritableTitle,
  PublishesWritableUnifiedSearch,
} from '@kbn/presentation-publishing';

/**
 * Embeddables that move panel settings into their type-specific editor should set this
 * so the hover gear (and click-to-edit title) stay hidden in dashboard edit mode.
 */
export interface UsesInlinePanelSettings {
  usesInlinePanelSettings: true;
}

export const apiUsesInlinePanelSettings = (api: unknown): api is UsesInlinePanelSettings =>
  Boolean(api && (api as UsesInlinePanelSettings).usesInlinePanelSettings === true);

export type PanelSettingsApi = Partial<
  PublishesWritableTitle &
    PublishesWritableDescription &
    PublishesWritableHideBorder &
    PublishesWritableUnifiedSearch
> & {
  isCompatibleWithUnifiedSearch?: () => boolean;
  parentApi?: unknown;
};

export interface PanelSettingsSnapshot {
  title: string | undefined;
  hideTitle: boolean | undefined;
  description: string | undefined;
  hideBorder: boolean | undefined;
  timeRange: TimeRange | undefined;
}

export const snapshotPanelSettings = (api: PanelSettingsApi): PanelSettingsSnapshot => ({
  title: api.title$?.getValue(),
  hideTitle: api.hideTitle$?.getValue(),
  description: api.description$?.getValue(),
  hideBorder: api.hideBorder$?.getValue(),
  timeRange: api.timeRange$?.getValue(),
});

export const restorePanelSettings = (
  api: PanelSettingsApi,
  snapshot: PanelSettingsSnapshot
): void => {
  api.setTitle?.(snapshot.title);
  api.setHideTitle?.(snapshot.hideTitle);
  api.setDescription?.(snapshot.description);
  api.setHideBorder?.(snapshot.hideBorder);
  api.setTimeRange?.(snapshot.timeRange);
};

/**
 * If the panel title matches the default title, clear the custom title so the panel
 * stays in sync with the saved object. Matches CustomizePanelEditor.save().
 */
export const commitPanelTitle = (api: PanelSettingsApi, title: string): void => {
  if (title === api.defaultTitle$?.getValue()) {
    api.setTitle?.(undefined);
  } else {
    api.setTitle?.(title);
  }
};
