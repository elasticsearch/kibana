/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IUiSettingsClient } from '@kbn/core/public';
import { INFERENCE_PREFERENCES_FEATURE_FLAG_ID } from '../common/constants';

export const isInferencePreferencesEnabled = (uiSettings: IUiSettingsClient): boolean =>
  uiSettings.get<boolean>(INFERENCE_PREFERENCES_FEATURE_FLAG_ID, false);
