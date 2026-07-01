/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { observabilityAlertsFeatureId } from '../../common';
import { useKibana } from '../utils/kibana_react';

/**
 * Returns whether the current user can modify Observability alerts (acknowledge,
 * mark as untracked, mute/unmute, edit tags).
 *
 * This reflects the `write` UI capability granted by the `observabilityAlerts: all`
 * privilege. The underlying RAC `alert:all` / `rule:mute_alerts` privileges are not
 * exposed as browser capabilities, so the feature declares an explicit `write` UI
 * capability that we read here.
 */
export const useCanModifyAlerts = (): boolean => {
  const { capabilities } = useKibana().services.application;
  return Boolean(capabilities[observabilityAlertsFeatureId]?.write);
};
