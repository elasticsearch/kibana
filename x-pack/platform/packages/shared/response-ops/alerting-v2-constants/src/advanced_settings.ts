/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const ALERTING_V2_ENABLED_SETTING_ID = 'alerting:v2:enabled';

export interface AlertingAdvancedSettingValueMap {
  [ALERTING_V2_ENABLED_SETTING_ID]: boolean;
}

export type AlertingAdvancedSettingId = keyof AlertingAdvancedSettingValueMap;

export type AlertingAdvancedSettingValue<K extends AlertingAdvancedSettingId> =
  AlertingAdvancedSettingValueMap[K];
