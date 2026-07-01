/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { openLazyFlyout } from '@kbn/presentation-util';
import { loadFromLibrary } from '../links_client/load_from_library';
import { getEditorFlyout } from './get_editor_flyout';
import { resolveLinks } from '../lib/resolve_links';
import { coreServices } from '../services/kibana_services';
import type { LinksByValueState } from '../../server';

export async function onVisualizationsEdit(refId: string) {
  openLazyFlyout({
    core: coreServices,
    loadContent: async ({ closeFlyout }) => {
      let linksState: LinksByValueState | undefined;
      try {
        linksState = await loadFromLibrary(refId);
      } catch (error) {
        coreServices.notifications.toasts.addWarning(error.message);
        return;
      }

      return getEditorFlyout({
        initialState: {
          refId,
          ...linksState,
          links: await resolveLinks(linksState.links ?? []),
        },
        closeFlyout,
      });
    },
    flyoutProps: {
      'data-test-subj': 'links--panelEditor--flyout',
    },
  });
}
