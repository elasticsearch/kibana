/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { hostsTitle, inventoryTitle } from '../../../translations';
import { toMetricsAppHeaderBack } from './to_metrics_app_header_back';

describe('toMetricsAppHeaderBack', () => {
  it('maps a parent breadcrumb with href to a single AppHeader back target', () => {
    const onClick = jest.fn();

    expect(
      toMetricsAppHeaderBack({
        text: hostsTitle,
        link: { href: '/app/metrics/hosts?kuery=host.name:web-01', onClick },
      })
    ).toEqual({
      href: '/app/metrics/hosts?kuery=host.name:web-01',
      label: hostsTitle,
      onClick,
    });
  });

  it('maps the Inventory default when origin is missing', () => {
    expect(
      toMetricsAppHeaderBack({
        text: inventoryTitle,
        link: { href: '/app/metrics/inventory' },
      })
    ).toEqual({
      href: '/app/metrics/inventory',
      label: inventoryTitle,
    });
  });

  it('returns undefined when the parent link has no href', () => {
    expect(
      toMetricsAppHeaderBack({
        text: inventoryTitle,
        link: { onClick: jest.fn() },
      })
    ).toBeUndefined();
  });
});
