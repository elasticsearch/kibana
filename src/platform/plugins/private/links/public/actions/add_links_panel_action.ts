/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EmbeddableApiContext } from '@kbn/presentation-publishing';
import { IncompatibleActionError } from '@kbn/ui-actions-plugin/public';
import { ADD_PANEL_ANNOTATION_GROUP } from '@kbn/embeddable-plugin/public';
import type { ActionDefinition } from '@kbn/ui-actions-plugin/public/actions';
import {
  apiPublishesDescription,
  apiPublishesTitle,
  apiPublishesSavedObjectId,
  apiIsPresentationContainer,
} from '@kbn/presentation-publishing';
import { openLazyFlyout } from '@kbn/presentation-util';
import type { LinksParentApi } from '../types';
import type { LinksEmbeddableState } from '../../common';
import { APP_ICON, APP_NAME, LINKS_EMBEDDABLE_TYPE } from '../../common';
import { ADD_LINKS_PANEL_ACTION_ID } from './constants';
import { coreServices } from '../services/kibana_services';
import { getEditorFlyout } from '../editor/get_editor_flyout';
import { serializeResolvedLinks } from '../lib/resolve_links';

export const isParentApiCompatible = (parentApi: unknown): parentApi is LinksParentApi =>
  apiIsPresentationContainer(parentApi) &&
  apiPublishesSavedObjectId(parentApi) &&
  apiPublishesTitle(parentApi) &&
  apiPublishesDescription(parentApi);

export const addLinksPanelAction: ActionDefinition<EmbeddableApiContext> = {
  id: ADD_LINKS_PANEL_ACTION_ID,
  getIconType: () => APP_ICON,
  order: 10,
  isCompatible: async ({ embeddable }) => isParentApiCompatible(embeddable),
  execute: async ({ embeddable }) => {
    if (!isParentApiCompatible(embeddable)) throw new IncompatibleActionError();

    openLazyFlyout({
      core: coreServices,
      parentApi: embeddable,
      loadContent: async ({ closeFlyout }) => {
        return getEditorFlyout({
          parentDashboard: embeddable,
          closeFlyout,
          onCompleteEdit: async (newState) => {
            if (!newState) return;

            const { layout, links, title, refId } = newState;

            function serializeState() {
              if (refId !== undefined) {
                return {
                  title: title ?? '',
                  ref_id: refId,
                };
              }

              return {
                layout,
                links: serializeResolvedLinks(links ?? []),
              };
            }

            await embeddable.addNewPanel<LinksEmbeddableState>({
              panelType: LINKS_EMBEDDABLE_TYPE,
              serializedState: serializeState(),
            });
          },
        });
      },
      flyoutProps: {
        'data-test-subj': 'links--panelEditor--flyout',
        isResizable: false,
      },
    });
  },
  grouping: [ADD_PANEL_ANNOTATION_GROUP],
  getDisplayName: () => APP_NAME,
};
