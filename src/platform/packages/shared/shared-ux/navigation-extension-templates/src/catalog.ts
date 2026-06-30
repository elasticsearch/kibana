/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { NavExtensionId, NavExtensionData } from '@kbn/core-chrome-browser';
import type { SerializableRecord } from '@kbn/utility-types';
import type { ListTemplateConfig } from './templates/list_template';
import type { TEMPLATES } from './templates';

/** The closed catalog of template ids the framework knows how to render. */
export type NavTemplateId = keyof typeof TEMPLATES;

/** Per-template config shapes, keyed by template id. */
interface NavTemplateConfigByRow<Row = SerializableRecord> {
  list: ListTemplateConfig<Row>;
}

/** Declarative config consumed by a template, typed to the extension's data row. */
export type NavTemplateConfig<Row = SerializableRecord> =
  NavTemplateConfigByRow<Row>[NavTemplateId];

type ElementOf<T> = T extends ReadonlyArray<infer E> ? E : T;

/**
 * Typed definition a publisher registers for an extension. `templateId` is constrained to the
 * catalog and `config` is typed to the chosen template and the extension's registered data row.
 * Structurally assignable to the runtime-erased `NavExtensionRuntimeDefinition` carried by chrome.
 */
export interface NavExtensionDefinition<Id extends NavExtensionId = NavExtensionId> {
  id: Id;
  templateId: NavTemplateId;
  config: NavTemplateConfig<ElementOf<NavExtensionData<Id>>>;
}
