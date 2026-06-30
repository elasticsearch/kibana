/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreSetup, CoreStart, Plugin } from '@kbn/core/server';

import { registerRoutes } from './api/register_routes';
import { MARKDOWN_EMBEDDABLE_TYPE } from '../common/constants';
import { markdownEmbeddableSchema } from './embeddable/schemas';
import { markdownSavedObjectType, type StoredMarkdownState } from './markdown_saved_object';
import type { SetupDeps, StartDeps } from './types';
import { getTransforms } from './embeddable';

export class MarkdownPlugin implements Plugin<void, void, SetupDeps, StartDeps> {
  setup(core: CoreSetup<StartDeps>, plugins: SetupDeps) {
    plugins.embeddable.registerEmbeddableServerDefinition(MARKDOWN_EMBEDDABLE_TYPE, {
      title: 'Markdown',
      getSchema: () => markdownEmbeddableSchema,
      getTransforms,
    });

    core.savedObjects.registerType<StoredMarkdownState>(markdownSavedObjectType);

    registerRoutes(core.http);
  }

  start(core: CoreStart, plugins: StartDeps) {}
}
