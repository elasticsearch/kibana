/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Logger } from '@kbn/core-di';
import { Response } from '@kbn/core-di-server';
import type { KibanaResponseFactory } from '@kbn/core-http-server';
import type { Logger as KibanaLogger } from '@kbn/logging';
import { inject, injectable } from 'inversify';
import type { SettingsServiceContract } from '../lib/services/settings_service/settings_service';
import { SettingsServiceToken } from '../lib/services/settings_service/tokens';

@injectable()
export class AlertingRouteContext {
  constructor(
    @inject(Response) public readonly response: KibanaResponseFactory,
    @inject(Logger) public readonly logger: KibanaLogger,
    @inject(SettingsServiceToken) public readonly settings: SettingsServiceContract
  ) {}
}
