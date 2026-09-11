/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { defaultsDeep } from 'lodash';

import type { VisParams } from '../types';
import type { VisTypeDefinition, VisTypeOptions } from './types';
import { VisGroups } from './vis_groups_enum';
import { Schemas } from './schemas';

const defaultOptions: VisTypeOptions = {
  showTimePicker: true,
  showFilterBar: true,
  showIndexSelection: true,
  showQueryInput: true,
  hierarchicalData: false, // we should get rid of this i guess ?
};

export class BaseVisType<TVisParams extends VisParams = VisParams> {
  public readonly name;
  public readonly title;
  public readonly order;
  public readonly description;
  public readonly note;
  public readonly getSupportedTriggers;
  public readonly navigateToLens;
  public readonly getExpressionVariables;
  public readonly icon;
  public readonly image;
  public readonly stage;
  public readonly isDeprecated;
  public readonly group;
  public readonly titleInWizard;
  public readonly options: VisTypeOptions;
  public readonly visConfig;
  public readonly editorConfig;
  public readonly disableCreate;
  public readonly disableEdit;
  public readonly requiresSearch;
  public readonly hasPartialRows;
  public readonly hierarchicalData;
  public readonly setup;
  public readonly getUsedIndexPattern;
  public readonly getProjectRoutingOverrides;
  public readonly getEsqlQuery;
  public readonly inspectorAdapters;
  public readonly fetchDatatable: boolean;
  public readonly toExpressionAst;
  public readonly getInfoMessage;
  public readonly updateVisTypeOnParamsChange;
  public readonly schemas;

  constructor(opts: VisTypeDefinition<TVisParams>) {
    if (!opts.icon && !opts.image) {
      throw new Error('vis_type must define its icon or image');
    }

    this.name = opts.name;
    this.description = opts.description ?? '';
    this.note = opts.note ?? '';
    this.getSupportedTriggers = opts.getSupportedTriggers;
    this.navigateToLens = opts.navigateToLens;
    this.getExpressionVariables = opts.getExpressionVariables;
    this.title = opts.title;
    this.icon = opts.icon;
    this.image = opts.image;
    this.order = opts.order ?? 0;
    this.visConfig = defaultsDeep({}, opts.visConfig, { defaults: {} });
    this.editorConfig = defaultsDeep({}, opts.editorConfig, { collections: {} });
    this.options = defaultsDeep({}, opts.options, defaultOptions);
    this.stage = opts.stage ?? 'production';
    this.isDeprecated = opts.isDeprecated ?? false;
    this.group = opts.group ?? VisGroups.AGGBASED;
    this.titleInWizard = opts.titleInWizard ?? '';
    this.disableCreate = opts.disableCreate ?? false;
    this.disableEdit = opts.disableEdit ?? false;
    this.requiresSearch = opts.requiresSearch ?? false;
    this.setup = opts.setup;
    this.hasPartialRows = opts.hasPartialRows ?? false;
    this.hierarchicalData = opts.hierarchicalData ?? false;
    this.getUsedIndexPattern = opts.getUsedIndexPattern;
    this.getProjectRoutingOverrides = opts.getProjectRoutingOverrides;
    this.getEsqlQuery = opts.getEsqlQuery;
    this.inspectorAdapters = opts.inspectorAdapters;
    this.fetchDatatable = opts.fetchDatatable ?? false;
    this.toExpressionAst = opts.toExpressionAst;
    this.getInfoMessage = opts.getInfoMessage;
    this.updateVisTypeOnParamsChange = opts.updateVisTypeOnParamsChange;

    this.schemas = new Schemas(this.editorConfig?.schemas ?? []);
  }
}
