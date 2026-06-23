/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IUiSettingsClient } from '@kbn/core/server';
import type { ServiceIdentifier } from 'inversify';
import type { SettingsServiceContract } from './settings_service';

/**
 * Pre-configured UI settings client used by the SettingsService to read and
 * write alerting advanced settings. Bind this token to the appropriate
 * client (e.g. `uiSettings.globalAsScopedToClient(internalSoClient)`).
 */
export const UiSettingsClientToken = Symbol.for(
  'alerting_v2.UiSettingsClient'
) as ServiceIdentifier<IUiSettingsClient>;

/**
 * SettingsService — typed wrapper around the UI settings client for alerting
 * advanced settings.
 */
export const SettingsServiceToken = Symbol.for(
  'alerting_v2.SettingsService'
) as ServiceIdentifier<SettingsServiceContract>;
