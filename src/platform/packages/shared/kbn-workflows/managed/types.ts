/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export interface ManagedWorkflowManagement {
  lifecycle: 'static' | 'dynamic';
  versionStrategy: 'auto' | 'on_adopt';
  enablement: 'enforced' | 'restorable';
}

export interface ManagedWorkflowTemplateValues {
  [key: string]: unknown;
}

type ManagedWorkflowDefinitionSource<TValues extends ManagedWorkflowTemplateValues> =
  | {
      yaml: string;
      yamlTemplate?: never;
    }
  | {
      yaml?: never;
      yamlTemplate(values: TValues): string;
    };

export type ManagedWorkflowDefinition<
  TValues extends ManagedWorkflowTemplateValues = ManagedWorkflowTemplateValues
> = {
  id: string;
  pluginId: string;
  version: number;
  billable: boolean;
  management: ManagedWorkflowManagement;
} & ManagedWorkflowDefinitionSource<TValues>;
