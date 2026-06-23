/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { panelGridSchema } from '@kbn/agent-builder-dashboards-common';
import { MARKDOWN_EMBEDDABLE_TYPE } from '@kbn/dashboard-markdown/server';
import { z } from '@kbn/zod/v4';
import { definePanelType } from '../panel_type';

/**
 * Markdown panel logic.
 *
 * Markdown is authored with `source: 'config'` (`type: 'markdown'`) whose
 * `config` is passed through to the embeddable unchanged, like a Lens
 * `config`-source panel. This module owns the markdown embeddable identity, the
 * by-value config contract, and the `config`-source input schema, and is where
 * future markdown-specific behavior would live.
 */

/**
 * By-value markdown panel config, mirroring the dashboard markdown embeddable's
 * by-value state. `settings` is optional here; the embeddable defaults
 * `open_links_in_new_tab` to `true` when omitted.
 */
export const markdownPanelConfigSchema = z.object({
  content: z.string().max(50000).describe('Markdown text to render in the panel.'),
  settings: z
    .object({
      open_links_in_new_tab: z
        .boolean()
        .optional()
        .describe('Whether links open in a new tab. Defaults to true.'),
    })
    .optional()
    .describe('Optional markdown rendering settings.'),
});

/**
 * The markdown variant of a `config`-source panel input, discriminated by
 * `type: 'markdown'`.
 */
export const markdownPanelConfigInputSchema = z.object({
  source: z.literal('config'),
  type: z.literal('markdown'),
  grid: panelGridSchema,
  config: markdownPanelConfigSchema.describe('Markdown panel config (e.g. { content }).'),
});

/**
 * The markdown variant of an `edit_panels` item: targets an existing markdown
 * panel by id and replaces its config. Derived from the add schema so the
 * `source`/`type`/`config` shape stays in sync.
 */
export const editMarkdownPanelConfigInputSchema = markdownPanelConfigInputSchema
  .omit({ grid: true })
  .extend({
    panelId: z.string().max(256).describe('Existing markdown panel id to update.'),
    config: markdownPanelConfigSchema.describe(
      'New markdown panel config (e.g. { content }). Fully replaces the existing config.'
    ),
  });

/**
 * Registry entry for the `markdown` panel type. Markdown is editable by config
 * (content is replaced in place), so it provides `validateConfigEdit` to reject
 * edits that target a non-markdown panel.
 */
export const markdownPanelDefinition = definePanelType({
  embeddableType: MARKDOWN_EMBEDDABLE_TYPE,
  validateConfigEdit: (existingPanel) =>
    existingPanel.type === MARKDOWN_EMBEDDABLE_TYPE
      ? { ok: true }
      : {
          ok: false,
          error: `Panel "${existingPanel.id}" with type "${existingPanel.type}" cannot be edited as markdown. Use source: "request" for ES|QL-backed Lens panels.`,
        },
});
