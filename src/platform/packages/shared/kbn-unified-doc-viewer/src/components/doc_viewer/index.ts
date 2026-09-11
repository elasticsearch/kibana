/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export { DocViewer, type DocViewerProps, type DocViewerApi } from './doc_viewer';
export { DOC_VIEWER_TABS_EBT_ELEMENT } from './get_doc_view_tab_ebt_props';
export {
  DOC_VIEWER_SHAREABLE_STATE_MAX_LENGTH,
  capShareableState,
  mergeShareableStateIntoRestorable,
  projectShareableTabsState,
} from './shareable_state';
export type { DocViewerRestorableState, DocViewerShareableState } from '../../types';
