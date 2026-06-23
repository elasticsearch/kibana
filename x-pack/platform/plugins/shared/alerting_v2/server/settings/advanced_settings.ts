/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { i18n } from '@kbn/i18n';
import type { UiSettingsParams } from '@kbn/core/types';
import {
  ALERTING_V2_ENABLED_SETTING_ID,
  type AlertingAdvancedSettingId,
  type AlertingAdvancedSettingValueMap,
} from '@kbn/alerting-v2-constants';

const ALERTING_V2_CATEGORY = 'alertingV2';

/**
 * Shape that the runtime registration must satisfy. For each setting ID, the
 * registered `UiSettingsParams` is parameterized by the value type declared
 * in {@link AlertingAdvancedSettingValueMap} — which forces `schema` to be
 * a `Type<T>` and `value`/`getValue` to produce `T`. This is what keeps the
 * runtime config-schema in sync with the canonical value-type contract.
 */
type AlertingV2AdvancedSettingsRegistration = {
  [K in AlertingAdvancedSettingId]: UiSettingsParams<AlertingAdvancedSettingValueMap[K]>;
};

export const alertingAdvancedSettings = {
  [ALERTING_V2_ENABLED_SETTING_ID]: {
    category: [ALERTING_V2_CATEGORY],
    name: i18n.translate('xpack.alertingVTwo.enabledSettingName', {
      defaultMessage: 'Alerting V2',
    }),
    type: 'boolean',
    value: false,
    description: i18n.translate('xpack.alertingVTwo.enabledSettingDescription', {
      defaultMessage: 'Enables the alerting V2 engine, APIs, and UI.',
    }),
    schema: schema.boolean(),
    requiresPageReload: true,
    technicalPreview: true,
  },
} satisfies AlertingV2AdvancedSettingsRegistration;
