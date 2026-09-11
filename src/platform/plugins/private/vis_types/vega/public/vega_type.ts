/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import { parse } from 'hjson';

import { DefaultEditorSize } from '@kbn/vis-default-editor-plugin/public';
import type { VisTypeDefinition } from '@kbn/visualizations-plugin/public';
import { VIS_EVENT_TO_TRIGGER, VisGroups } from '@kbn/visualizations-plugin/public';

import { getDefaultSpec } from './default_spec';
import { extractIndexPatternsFromSpec } from './lib/extract_index_pattern';
import { extractProjectRoutingOverrides } from './lib/extract_project_routing_overrides';
import { getPublishedEsqlQuery } from './lib/spec_uses_esql';
import { createInspectorAdapters } from './vega_inspector';
import { toExpressionAst } from './to_ast';
import { getInfoMessage } from './components/vega_info_message';
import { VegaVisEditorComponent } from './components/vega_vis_editor_lazy';

import type { VisParams } from './vega_fn';
import { VegaIcon, vegaTitleInWizard } from './vega_icon';

export const vegaVisType: VisTypeDefinition<VisParams> = {
  name: 'vega',
  title: 'Vega',
  getInfoMessage,
  description: i18n.translate('visTypeVega.type.vegaDescription', {
    defaultMessage: 'Use the Vega syntax to create new types of visualizations.',
    description: 'Vega and Vega-Lite are product names and should not be translated',
  }),
  icon: VegaIcon, // VegaIcon svg is wrapped into EUIIcon
  group: VisGroups.PROMOTED,
  titleInWizard: vegaTitleInWizard,
  visConfig: { defaults: { spec: getDefaultSpec() } },
  editorConfig: {
    optionsTemplate: VegaVisEditorComponent,
    enableAutoApply: true,
    defaultSize: DefaultEditorSize.MEDIUM,
  },
  toExpressionAst,
  options: {
    showIndexSelection: false,
    showFilterBar: true,
  },
  getSupportedTriggers: () => {
    return [VIS_EVENT_TO_TRIGGER.applyFilter];
  },
  getUsedIndexPattern: async (visParams) => {
    try {
      const spec = parse(visParams.spec, { legacyRoot: false, keepWsc: true });

      return await extractIndexPatternsFromSpec(spec);
    } catch (e) {
      // spec is invalid
    }
    return [];
  },
  getProjectRoutingOverrides: async (visParams) => {
    try {
      const spec = parse(visParams.spec, { legacyRoot: false, keepWsc: true });

      return extractProjectRoutingOverrides(spec);
    } catch (e) {
      // spec is invalid
    }
    return undefined;
  },
  getEsqlQuery: (visParams) => {
    try {
      const spec = parse(visParams.spec, { legacyRoot: false, keepWsc: true });

      return getPublishedEsqlQuery(spec);
    } catch (e) {
      // spec is invalid
    }
    return undefined;
  },
  inspectorAdapters: createInspectorAdapters,
  /**
   * This is necessary for showing actions bar in top of vega editor
   */
  requiresSearch: true,
};
