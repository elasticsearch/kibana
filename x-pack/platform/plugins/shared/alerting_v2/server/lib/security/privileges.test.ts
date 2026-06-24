/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaFeatureConfig } from '@kbn/features-plugin/common';
import { featuresPluginMock } from '@kbn/features-plugin/server/mocks';

import { registerFeaturePrivileges } from './privileges';
import { ALERTING_V2_FEATURES } from '../../../common/feature_privileges';

describe('registerFeaturePrivileges', () => {
  const getRegisteredFeature = (id: string): KibanaFeatureConfig => {
    const features = featuresPluginMock.createSetup();
    registerFeaturePrivileges(features);

    const registered = features.registerKibanaFeature.mock.calls
      .map(([feature]) => feature)
      .find((feature) => feature.id === id);

    if (!registered) {
      throw new Error(`Feature "${id}" was not registered`);
    }

    return registered;
  };

  it('registers a Kibana feature for every alerting_v2 feature', () => {
    const features = featuresPluginMock.createSetup();
    registerFeaturePrivileges(features);

    expect(features.registerKibanaFeature).toHaveBeenCalledTimes(
      Object.keys(ALERTING_V2_FEATURES).length
    );
  });

  it('forwards the `alerts` privilege to the `all` and `read` privileges of the alerts feature', () => {
    const alertsFeature = getRegisteredFeature(ALERTING_V2_FEATURES.alerts.id);

    expect(alertsFeature.privileges?.all.alerts).toEqual({ read: true });
    expect(alertsFeature.privileges?.read.alerts).toEqual({ read: true });
  });

  it('does not set the `alerts` privilege for features that do not request it', () => {
    const rulesFeature = getRegisteredFeature(ALERTING_V2_FEATURES.rules.id);

    expect(rulesFeature.privileges?.all.alerts).toBeUndefined();
    expect(rulesFeature.privileges?.read.alerts).toBeUndefined();
  });
});
