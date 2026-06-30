/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { History } from 'history';
import type { EmbeddableStateTransfer } from '@kbn/embeddable-plugin/public';
import { VisualizeConstants } from '@kbn/visualizations-common';

interface UrlEditor {
  editApp?: string;
  editUrl: string;
}
interface CallbackEditor {
  onEdit: (id: string) => void | Promise<void>;
}
export type VisualizeEditor = UrlEditor | CallbackEditor;

/**
 * Listing row click → editor handoff. Visualize covers three cases:
 *
 * 1. `editor.onEdit` — the vis type owns its own routing (callback).
 * 2. `editor.editApp` set — hand off to that app via the embeddable state
 *    transfer (e.g. Lens).
 * 3. `editor.editApp` unset — visualize handles edit + view on the same
 *    URL, push into the local router.
 *
 * Items with `.error` or `.readOnly` set never navigate; preserves the legacy
 * `getOnClickTitle` gate that returned `undefined` for broken vises and for
 * `readOnly` (managed / "no longer supported") visualizations, matching the
 * disabled row `Edit` action and the `undefined` href from
 * `getVisualizeListItemLink`.
 */
export const navigateToVisualizeEditor = async (
  item: { id: string; error?: string; readOnly?: boolean; editor?: VisualizeEditor },
  {
    stateTransferService,
    history,
  }: { stateTransferService: EmbeddableStateTransfer; history: History }
): Promise<void> => {
  if (item.error || item.readOnly) return;
  const editor = item.editor ?? { editUrl: '' };
  if ('onEdit' in editor) {
    await editor.onEdit(item.id);
    return;
  }
  if (editor.editApp) {
    await stateTransferService.navigateToEditor(editor.editApp, {
      path: editor.editUrl,
      state: { originatingApp: VisualizeConstants.APP_ID },
    });
    return;
  }
  history.push(editor.editUrl);
};
