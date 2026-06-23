/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttachmentPanel } from '@kbn/agent-builder-dashboards-common';
import type { PanelFailure } from './utils';

/**
 * Type-agnostic primitives for inline panel content resolution: the resolution
 * result, the failure helper, and the request fields shared by every panel type.
 * Each panel type contributes its own request shape (see `operations/panels/<type>`),
 * and the panels barrel aggregates them into the `ResolvePanelContent` contract,
 * whose default implementation lives in `resolvers/vis_panel_resolver.ts`.
 */
export type PanelContentAttempt =
  | {
      type: 'success';
      panelContent: Pick<AttachmentPanel, 'type' | 'config'>;
    }
  | {
      type: 'failure';
      failure: PanelFailure;
    };

/** Operations that can trigger inline panel resolution. */
export type InlinePanelOperationType = 'add_section' | 'add_panels' | 'edit_panels';

/**
 * Fields common to every panel resolution request, independent of panel type.
 * Per-type modules extend this with a discriminating `type` literal and their
 * own payload (e.g. `panels/vis` adds the natural-language / ES|QL fields).
 */
export interface PanelResolutionRequestBase {
  operationType: InlinePanelOperationType;
  /** Human-facing identifier for failure attribution (panelId or the query). */
  identifier: string;
  /** Present when editing an existing panel; resolvers validate compatibility. */
  existingPanel?: AttachmentPanel;
}

export const createPanelFailureResult = (
  type: PanelFailure['type'],
  identifier: string,
  error: string
): Extract<PanelContentAttempt, { type: 'failure' }> => ({
  type: 'failure',
  failure: {
    type,
    identifier,
    error,
  },
});
