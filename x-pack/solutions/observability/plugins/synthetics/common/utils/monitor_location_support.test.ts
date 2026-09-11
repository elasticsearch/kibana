/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MonitorTypeEnum } from '../runtime_types';
import {
  hasPublicServiceLocation,
  monitorTypeRequiresPrivateLocations,
} from './monitor_location_support';

describe('monitorTypeRequiresPrivateLocations', () => {
  it('is true only for API Journey monitors', () => {
    expect(monitorTypeRequiresPrivateLocations(MonitorTypeEnum.API)).toBe(true);
    expect(monitorTypeRequiresPrivateLocations(MonitorTypeEnum.BROWSER)).toBe(false);
    expect(monitorTypeRequiresPrivateLocations(MonitorTypeEnum.HTTP)).toBe(false);
    expect(monitorTypeRequiresPrivateLocations(undefined)).toBe(false);
  });
});

describe('hasPublicServiceLocation', () => {
  it('detects Elastic managed locations', () => {
    expect(hasPublicServiceLocation([{ isServiceManaged: true }])).toBe(true);
    expect(hasPublicServiceLocation([{ isServiceManaged: false }])).toBe(false);
    expect(hasPublicServiceLocation([])).toBe(false);
    expect(hasPublicServiceLocation(undefined)).toBe(false);
  });
});
