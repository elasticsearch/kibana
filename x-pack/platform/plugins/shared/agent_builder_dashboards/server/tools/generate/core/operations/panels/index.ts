/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { PanelContentAttempt } from '../../resolve_panel';
import type { PanelTypeDefinition } from './panel_type';
import {
  visPanelConfigInputSchema,
  visPanelDefinition,
  panelRequestSchema,
  editPanelRequestInputSchema,
  type VisPanelResolutionRequest,
} from './vis';
import {
  markdownPanelConfigInputSchema,
  markdownPanelDefinition,
  editMarkdownPanelConfigInputSchema,
} from './markdown';
import { aiPanelConfigInputSchema, aiPanelDefinition } from './ai_panel';

/**
 * Panel registry barrel.
 *
 * Each panel type lives in its own module under `./<type>` and owns its
 * embeddable identity, config contract, input schemas, and by-value behavior
 * (its {@link PanelTypeDefinition}). This barrel combines those per-type pieces
 * into the shapes operations consume — the discriminated input unions, the
 * per-operation item schemas, and the `type` -> definition registry — so adding a
 * panel type means adding its module plus an entry here.
 *
 * Panel inputs have two orthogonal axes, each carrying a `type`:
 * - `source`: `'config'` (resolved, passed by value) or `'request'` (resolved
 *   asynchronously from a query).
 * - `type`: which panel type — `'vis'`, `'markdown'`, … (maps to an embeddable).
 *
 * Today `source: 'request'` only resolves `type: 'vis'`; adding another
 * resolvable type is additive and needs no operation-handler changes.
 */
export type { PanelRequestInput, EditPanelRequestInput, VisPanelResolutionRequest } from './vis';
export type { PanelContent } from './panel_type';

/**
 * A `source: 'config'` panel adds a panel from an already-resolved config passed
 * by value, discriminated by `type` (each panel type owns its `config` shape).
 * The tool never reads a store, so the config must be supplied directly rather
 * than as an attachment ID.
 */
const configPanelInputSchema = z.discriminatedUnion('type', [
  visPanelConfigInputSchema,
  markdownPanelConfigInputSchema,
  aiPanelConfigInputSchema,
]);

export type ConfigPanelInput = z.infer<typeof configPanelInputSchema>;
export type PanelType = ConfigPanelInput['type'];

/** Per-type behavior, keyed by model-facing panel `type`. */
export const PANEL_TYPE_DEFINITIONS: Record<PanelType, PanelTypeDefinition> = {
  vis: visPanelDefinition,
  markdown: markdownPanelDefinition,
  ai_panel: aiPanelDefinition,
};

const sectionIdField = z
  .string()
  .max(256)
  .optional()
  .describe(
    'ID of an existing section to add this panel into. The section must already exist (use add_section first). If omitted, panel is added at the top level.'
  );

/** A single panel item accepted by `add_panels` (any panel type, optionally targeting a section). */
export const addPanelsItemSchema = z.discriminatedUnion('source', [
  z.discriminatedUnion('type', [
    visPanelConfigInputSchema.extend({ sectionId: sectionIdField }),
    markdownPanelConfigInputSchema.extend({ sectionId: sectionIdField }),
    aiPanelConfigInputSchema.extend({ sectionId: sectionIdField }),
  ]),
  panelRequestSchema.extend({ sectionId: sectionIdField }),
]);

export type AddPanelsItemInput = z.infer<typeof addPanelsItemSchema>;

/** A single inline panel item accepted by `add_section` (section-relative, no sectionId). */
export const addSectionPanelItemSchema = z.discriminatedUnion('source', [
  configPanelInputSchema,
  panelRequestSchema,
]);

/**
 * A "create a new panel" input — either an already-resolved `source: 'config'`
 * panel or a `source: 'request'` to resolve. The common shape that `add_panels`
 * and `add_section` materialize into panel content (`add_panels` items also carry
 * a `sectionId`, which is assignable to this base).
 */
export type NewPanelInput = z.infer<typeof addSectionPanelItemSchema>;

/** A single panel item accepted by `edit_panels` (targets an existing panel by id). */
export const editPanelItemSchema = z.discriminatedUnion('source', [
  editPanelRequestInputSchema,
  editMarkdownPanelConfigInputSchema,
]);

export type EditPanelItem = z.infer<typeof editPanelItemSchema>;

/**
 * Every panel resolution request the resolver can receive, discriminated by
 * `type`. Extend this union as more panel types gain inline resolution support;
 * each type contributes its request shape from its own module.
 */
export type PanelResolutionRequest = VisPanelResolutionRequest;

/**
 * Contract for inline panel content resolution. The generate core consumes this
 * to turn a panel resolution request into panel content. The default resolver
 * (see `core/resolvers/vis_panel_resolver.ts`) routes each request to the resolver
 * for its `type`; it is injected so tests can supply a fake.
 */
export type ResolvePanelContent = (request: PanelResolutionRequest) => Promise<PanelContentAttempt>;
