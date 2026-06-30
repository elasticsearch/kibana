/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, CoreStart, Plugin } from '@kbn/core/server';
import type { EmbeddableSetup } from '@kbn/embeddable-plugin/server';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import { AI_PANEL_EMBEDDABLE_TYPE, AI_PANEL_APP_NAME } from '../common/constants';
import { aiPanelEmbeddableSchema } from './embeddable/schemas';
import { registerGenerateRoute } from './routes/generate_route';

interface SetupDeps {
  embeddable: EmbeddableSetup;
}

interface StartDeps {
  inference: InferenceServerStart;
}

export class AiPanelPlugin implements Plugin<void, void, SetupDeps, StartDeps> {
  setup(core: CoreSetup<StartDeps>, { embeddable }: SetupDeps) {
    embeddable.registerEmbeddableServerDefinition(AI_PANEL_EMBEDDABLE_TYPE, {
      title: AI_PANEL_APP_NAME,
      getSchema: () => aiPanelEmbeddableSchema,
    });

    const router = core.http.createRouter();
    registerGenerateRoute(router, core.getStartServices);
  }

  start(_core: CoreStart, _plugins: StartDeps) {}
}
