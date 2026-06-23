/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttachmentPanel } from '@kbn/agent-builder-dashboards-common';
import { z } from '@kbn/zod/v4';
import { createPanelFailureResult, type PanelContentAttempt } from '../resolve_panel';
import { indexPanelsById, updatePanelInDashboard } from '../dashboard_state';
import { DASHBOARD_OPERATION_FAILURE_TYPES } from '../failure_types';
import {
  PANEL_TYPE_DEFINITIONS,
  editPanelItemSchema,
  type EditPanelItem,
  type EditPanelRequestInput,
} from './panels';
import { defineOperation } from './types';

/**
 * An edit that passed validation. `existingPanel` is only carried for
 * `source: 'request'` edits (the resolver needs it); `source: 'config'` edits
 * don't have one.
 */
interface ValidEdit {
  panelInput: EditPanelItem;
  existingPanel?: AttachmentPanel;
}

const missingPanelResolverError =
  'Inline panel resolver is required for edit_panels panel requests.';

export const editPanelsOperation = defineOperation({
  schema: z
    .object({
      operation: z.literal('edit_panels'),
      panels: z.array(editPanelItemSchema).min(1),
    })
    .describe(
      'Edit existing panels in place by panelId. Supports ES|QL-backed Lens visualization panels (source: "request") and markdown panels (source: "config", type: "markdown"). DSL, form-based, and other non-ES|QL visualization panels are not supported for direct editing and should be recreated as new ES|QL-based Lens panels instead.'
    ),
  handler: async ({ dashboardData, operation, context }) => {
    const { resolvePanelContent } = context;

    const recordFailure = (panelId: string, error: string): void => {
      context.failures.push(
        createPanelFailureResult(DASHBOARD_OPERATION_FAILURE_TYPES.editPanels, panelId, error)
          .failure
      );
    };

    const hasPanelRequestEdits = operation.panels.some(
      (panelInput): panelInput is EditPanelRequestInput => panelInput.source === 'request'
    );
    if (hasPanelRequestEdits && !resolvePanelContent) {
      throw new Error(missingPanelResolverError);
    }

    const panelIndex = indexPanelsById(dashboardData.panels);

    const occurrences = new Map<string, number>();
    for (const { panelId } of operation.panels) {
      occurrences.set(panelId, (occurrences.get(panelId) ?? 0) + 1);
    }

    // Validate before resolving panel requests so only valid edits call the LLM.
    const validEdits: ValidEdit[] = [];

    for (const panelInput of operation.panels) {
      if ((occurrences.get(panelInput.panelId) ?? 0) > 1) {
        recordFailure(
          panelInput.panelId,
          `Panel "${panelInput.panelId}" appears multiple times in this edit_panels operation. Edit each panel at most once per operation.`
        );
        continue;
      }

      const existingPanel = panelIndex.get(panelInput.panelId);
      if (!existingPanel) {
        recordFailure(panelInput.panelId, `Panel "${panelInput.panelId}" not found.`);
        continue;
      }

      if (panelInput.source === 'config') {
        const validation = PANEL_TYPE_DEFINITIONS[panelInput.type].validateConfigEdit?.(
          existingPanel
        ) ?? { ok: true };
        if (!validation.ok) {
          recordFailure(panelInput.panelId, validation.error);
          continue;
        }
        validEdits.push({ panelInput });
        continue;
      }

      // Panel request edits: the resolver enforces the Lens-type check and
      // returns a failure attempt if the existing panel isn't supported.
      validEdits.push({ panelInput, existingPanel });
    }

    // Resolve valid panel request edits in parallel from the entry-time snapshot.
    const validPanelRequestEdits = validEdits.filter(
      (validEdit): validEdit is ValidEdit & { panelInput: EditPanelRequestInput } =>
        validEdit.panelInput.source === 'request'
    );

    const panelContentAttemptByPanelId = new Map<string, PanelContentAttempt>();
    if (validPanelRequestEdits.length > 0) {
      if (!resolvePanelContent) {
        throw new Error(missingPanelResolverError);
      }

      const attempts = await Promise.all(
        validPanelRequestEdits.map(({ panelInput, existingPanel }) =>
          resolvePanelContent({
            type: panelInput.type,
            operationType: operation.operation,
            identifier: panelInput.panelId,
            nlQuery: panelInput.query,
            chartType: panelInput.chartType,
            esql: panelInput.esql,
            existingPanel,
          })
        )
      );
      validPanelRequestEdits.forEach(({ panelInput }, i) => {
        panelContentAttemptByPanelId.set(panelInput.panelId, attempts[i]);
      });
    }

    // Apply valid edits in input order so state changes remain deterministic.
    let nextDashboardData = dashboardData;
    for (const { panelInput } of validEdits) {
      if (panelInput.source === 'config') {
        const panelContent = PANEL_TYPE_DEFINITIONS[panelInput.type].buildPanelContent(
          panelInput.config
        );
        const updateResult = updatePanelInDashboard({
          dashboardData: nextDashboardData,
          panelId: panelInput.panelId,
          transformPanel: (panel) => ({ ...panel, ...panelContent }),
        });

        if (!updateResult.updated) {
          recordFailure(panelInput.panelId, `Panel "${panelInput.panelId}" not found.`);
          continue;
        }

        nextDashboardData = updateResult.dashboardData;
        continue;
      }

      const attempt = panelContentAttemptByPanelId.get(panelInput.panelId);
      if (!attempt) {
        throw new Error(`Panel edit result for panel "${panelInput.panelId}" is missing.`);
      }

      if (attempt.type === 'failure') {
        context.failures.push(attempt.failure);
        continue;
      }

      const updateResult = updatePanelInDashboard({
        dashboardData: nextDashboardData,
        panelId: panelInput.panelId,
        transformPanel: (panel) => ({ ...panel, ...attempt.panelContent }),
      });

      if (!updateResult.updated) {
        recordFailure(panelInput.panelId, `Panel "${panelInput.panelId}" not found.`);
        continue;
      }

      nextDashboardData = updateResult.dashboardData;
    }

    return nextDashboardData;
  },
});
