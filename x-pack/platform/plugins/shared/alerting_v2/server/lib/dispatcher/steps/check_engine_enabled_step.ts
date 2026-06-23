/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { inject, injectable } from 'inversify';
import { ALERTING_V2_ENABLED_SETTING_ID } from '@kbn/alerting-v2-constants';
import type { DispatcherPipelineState, DispatcherStep, DispatcherStepOutput } from '../types';
import {
  LoggerServiceToken,
  type LoggerServiceContract,
} from '../../services/logger_service/logger_service';
import type { SettingsServiceContract } from '../../services/settings_service/settings_service';
import { SettingsServiceToken } from '../../services/settings_service/tokens';

/**
 * Global kill switch for the dispatcher.
 *
 * Reads the `alerting:v2:enabled` advanced setting and halts the pipeline
 * before any work is performed when the operator has turned the engine off.
 * Halting with `engine_disabled` preserves the task instance state so that
 * execution resumes cleanly when the setting is toggled back on.
 *
 * This step must run first in the pipeline so that subsequent steps (episode
 * fetches, policy lookups, dispatching, etc.) are skipped entirely while the
 * engine is disabled.
 */
@injectable()
export class CheckEngineEnabledStep implements DispatcherStep {
  public readonly name = 'check_engine_enabled';

  constructor(
    @inject(LoggerServiceToken) private readonly logger: LoggerServiceContract,
    @inject(SettingsServiceToken) private readonly settings: SettingsServiceContract
  ) {}

  public async execute(state: Readonly<DispatcherPipelineState>): Promise<DispatcherStepOutput> {
    const enabled = await this.settings.get(ALERTING_V2_ENABLED_SETTING_ID);

    if (!enabled) {
      this.logger.debug({
        message: `[${this.name}] Alerting is disabled, halting dispatcher execution ${state.input.executionUuid}`,
      });

      return { type: 'halt', reason: 'engine_disabled' };
    }

    return { type: 'continue' };
  }
}
