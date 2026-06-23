/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttachmentPanel } from '@kbn/agent-builder-dashboards-common';

/** Resolved panel content: the embeddable `type` plus its by-value `config`. */
export type PanelContent = Pick<AttachmentPanel, 'type' | 'config'>;

/** Outcome of validating whether an existing panel can be edited by config. */
export type ConfigEditValidation = { ok: true } | { ok: false; error: string };

/**
 * Static, host-agnostic behavior for a single panel `type`.
 *
 * Each type's module (`panels/<type>`) exports one of these so operations stay
 * type-agnostic: they look the definition up in the registry instead of branching
 * on the literal type. Covers the by-value config path only (`source: 'config'`);
 * async-request creation is a separate seam handled by the panel resolver.
 */
export interface PanelTypeDefinition {
  /** Embeddable type id panels of this type map to. */
  readonly embeddableType: string;
  /** Builds panel content from an already-resolved `source: 'config'` config. */
  readonly buildPanelContent: (config: AttachmentPanel['config']) => PanelContent;
  /**
   * Validates that an existing panel may be replaced via a `source: 'config'`
   * edit of this type. Omit for types that are not editable by config (e.g.
   * `vis`, which edits through `source: 'request'` instead).
   */
  readonly validateConfigEdit?: (existingPanel: AttachmentPanel) => ConfigEditValidation;
}

/**
 * Builds a {@link PanelTypeDefinition} from a panel type's `embeddableType`,
 * keeping it the single source of truth: `buildPanelContent` defaults to passing
 * the config through to that embeddable, so a type only declares its embeddable
 * id (plus `validateConfigEdit` when editable by config). Pass `buildPanelContent`
 * to override for a type that needs to transform its config.
 */
export const definePanelType = ({
  embeddableType,
  buildPanelContent = (config) => ({ type: embeddableType, config }),
  validateConfigEdit,
}: {
  embeddableType: string;
  buildPanelContent?: (config: AttachmentPanel['config']) => PanelContent;
  validateConfigEdit?: (existingPanel: AttachmentPanel) => ConfigEditValidation;
}): PanelTypeDefinition => ({ embeddableType, buildPanelContent, validateConfigEdit });
