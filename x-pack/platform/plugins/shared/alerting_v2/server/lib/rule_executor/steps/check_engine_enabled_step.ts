/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { inject, injectable } from 'inversify';
import { ALERTING_V2_ENABLED_SETTING_ID } from '@kbn/alerting-v2-constants';
import type { PipelineStateStream, RuleExecutionStep } from '../types';
import { mapStep } from '../stream_utils';
import {
  LoggerServiceToken,
  type LoggerServiceContract,
} from '../../services/logger_service/logger_service';
import type { SettingsServiceContract } from '../../services/settings_service/settings_service';
import { SettingsServiceToken } from '../../services/settings_service/tokens';

/**
 * Global kill switch for the alerting engine.
 *
 * Reads the `alerting:v2:enabled` advanced setting and halts the pipeline
 * before any work is performed when the operator has turned the engine off.
 * Halting with `engine_disabled` preserves the task instance state so that
 * execution resumes cleanly when the setting is toggled back on.
 *
 * This step must run first in the pipeline so that subsequent steps (resource
 * waits, rule fetches, ES|QL execution, etc.) are skipped entirely while the
 * engine is disabled.
 */
@injectable()
export class CheckEngineEnabledStep implements RuleExecutionStep {
  public readonly name = 'check_engine_enabled';

  constructor(
    @inject(LoggerServiceToken) private readonly logger: LoggerServiceContract,
    @inject(SettingsServiceToken) private readonly settings: SettingsServiceContract
  ) {}

  public executeStream(streamState: PipelineStateStream): PipelineStateStream {
    return mapStep(streamState, async (state) => {
      const enabled = await this.settings.get(ALERTING_V2_ENABLED_SETTING_ID);

      if (!enabled) {
        this.logger.debug({
          message: `[${this.name}] Alerting is disabled, halting rule ${state.input.ruleId}`,
        });

        return { type: 'halt', reason: 'engine_disabled', state };
      }

      return { type: 'continue', state };
    });
  }
}
