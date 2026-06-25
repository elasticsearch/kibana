/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Host-supplied copy for the change history modal shell. */
export interface ChangeHistoryLabels {
  /** Primary title shown above the preview panel (e.g. workflow name). */
  previewTitle?: string;
  /** Back control label in the preview panel header (defaults to package i18n). */
  previewBackLabel?: string;
  /** Sidebar heading (defaults to "Version history"). */
  timelinePanelTitle?: string;
  /** @deprecated Use previewTitle / timelinePanelTitle instead. */
  modalTitle?: string;
}
