/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  CoreSetup,
  CoreStart,
  Plugin,
  Logger,
  PluginInitializerContext,
} from '@kbn/core/server';
import type { ConfigSchema } from '@kbn/file-upload-common';
import { fieldStatsTableEmbeddableSchema } from '@kbn/data-visualizer-server-schemas/embeddables/field_stats';
import type { StartDeps, SetupDeps } from './types';
import { registerWithCustomIntegrations } from './register_custom_integration';
import { routes } from './routes';
import { FIELD_STATS_EMBEDDABLE_TYPE } from '../common/embeddables/constants';
import { transformIn } from '../common/embeddables/transform_in';
import { transformOut } from '../common/embeddables/transform_out';

export class DataVisualizerPlugin implements Plugin<void, void, SetupDeps, StartDeps> {
  private readonly _logger: Logger;

  constructor(initializerContext: PluginInitializerContext<ConfigSchema>) {
    this._logger = initializerContext.logger.get();
  }

  setup(coreSetup: CoreSetup<StartDeps, unknown>, plugins: SetupDeps) {
    if (plugins.home && plugins.customIntegrations) {
      registerWithCustomIntegrations(plugins.customIntegrations);
    }
    routes(coreSetup, this._logger);

    plugins.embeddable.registerEmbeddableServerDefinition(FIELD_STATS_EMBEDDABLE_TYPE, {
      title: 'Field statistics table',
      getSchema: () => fieldStatsTableEmbeddableSchema,
      getTransforms: () => ({
        transformIn,
        transformOut,
      }),
    });
  }

  start(core: CoreStart) {}
}
