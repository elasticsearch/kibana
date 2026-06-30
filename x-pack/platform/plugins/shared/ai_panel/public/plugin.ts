/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, CoreStart, Plugin } from '@kbn/core/public';
import type { EmbeddableSetup } from '@kbn/embeddable-plugin/public';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import { AI_PANEL_EMBEDDABLE_TYPE } from '../common/constants';
import { setServices } from './services';

interface SetupDeps {
  embeddable: EmbeddableSetup;
}

interface StartDeps {
  data: DataPublicPluginStart;
}

export class AiPanelPlugin implements Plugin<void, void, SetupDeps, StartDeps> {
  setup(_core: CoreSetup, { embeddable }: SetupDeps) {
    embeddable.registerEmbeddablePublicDefinition(AI_PANEL_EMBEDDABLE_TYPE, async () => {
      const { aiPanelEmbeddableFactory } = await import('./async_services');
      return aiPanelEmbeddableFactory;
    });
  }

  start(core: CoreStart, { data }: StartDeps) {
    setServices(core, data.search.search);
  }
}
