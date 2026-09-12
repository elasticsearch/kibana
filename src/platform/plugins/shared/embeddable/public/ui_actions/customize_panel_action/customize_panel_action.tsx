/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import type { TracksOverlays } from '@kbn/presentation-util';
import type {
  CanAccessViewMode,
  EmbeddableApiContext,
  HasParentApi,
  PublishesDataViews,
  PublishesWritableUnifiedSearch,
  PublishesWritableDescription,
  PublishesWritableTitle,
  PublishesUnifiedSearch,
  IsCustomizable,
  PublishesWritableHideBorder,
} from '@kbn/presentation-publishing';
import {
  apiCanAccessViewMode,
  apiPublishesDataViews,
  apiPublishesUnifiedSearch,
  apiPublishesTitle,
  getInheritedViewMode,
  apiCanBeCustomized,
} from '@kbn/presentation-publishing';

import type { Action } from '@kbn/ui-actions-plugin/public';
import { IncompatibleActionError } from '@kbn/ui-actions-plugin/public';
import { openCustomizePanelFlyout } from './open_customize_panel';
import { ACTION_CUSTOMIZE_PANEL } from './constants';
import { apiUsesInlinePanelSettings } from './inline_panel_settings';

export type CustomizePanelActionApi = CanAccessViewMode &
  IsCustomizable &
  Partial<
    PublishesDataViews &
      PublishesWritableUnifiedSearch &
      PublishesWritableDescription &
      PublishesWritableTitle &
      PublishesWritableHideBorder &
      HasParentApi<Partial<PublishesUnifiedSearch & TracksOverlays>>
  >;

export const isApiCompatibleWithCustomizePanelAction = (
  api: unknown | null
): api is CustomizePanelActionApi =>
  apiCanBeCustomized(api) &&
  apiCanAccessViewMode(api) &&
  (apiPublishesDataViews(api) || apiPublishesTitle(api));

export class CustomizePanelAction implements Action<EmbeddableApiContext> {
  public type = ACTION_CUSTOMIZE_PANEL;
  public id = ACTION_CUSTOMIZE_PANEL;
  public order = 45;

  constructor() {}

  public getDisplayName({ embeddable }: EmbeddableApiContext): string {
    return i18n.translate('embeddableApi.action.customizePanel.displayName', {
      defaultMessage: 'Settings',
    });
  }

  public getIconType() {
    return 'gear';
  }

  public async isCompatible({ embeddable }: EmbeddableApiContext) {
    if (!isApiCompatibleWithCustomizePanelAction(embeddable)) return false;
    // Lens and Links move panel settings into their type editor, so hide the hover gear in edit mode.
    // View mode still offers this action so users can change a custom time range.
    if (getInheritedViewMode(embeddable) === 'edit' && apiUsesInlinePanelSettings(embeddable)) {
      return false;
    }
    // It should be possible to customize just the time range in View mode
    return (
      getInheritedViewMode(embeddable) === 'edit' ||
      (apiPublishesUnifiedSearch(embeddable) &&
        (embeddable.isCompatibleWithUnifiedSearch?.() ?? true))
    );
  }

  public async execute({ embeddable }: EmbeddableApiContext) {
    if (!isApiCompatibleWithCustomizePanelAction(embeddable)) throw new IncompatibleActionError();
    openCustomizePanelFlyout({ api: embeddable });
  }
}
