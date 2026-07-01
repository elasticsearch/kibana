/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MonitorAttachmentData } from '../../../common/agent_builder/attachments/monitor_attachment_schema';
import { buildMonitorRequestBody } from './monitor_attachment_payload';

const baseData = (): MonitorAttachmentData => ({
  type: 'http',
  urls: 'https://www.elastic.co',
  schedule: { number: '5', unit: 'm' },
  locations: [{ id: 'us_central', isServiceManaged: true }],
  metadata: { name: 'Elastic uptime' },
});

describe('buildMonitorRequestBody', () => {
  it('produces a minimal HTTP payload from a valid attachment', () => {
    expect(buildMonitorRequestBody(baseData())).toEqual({
      type: 'http',
      name: 'Elastic uptime',
      urls: 'https://www.elastic.co',
      schedule: { number: '5', unit: 'm' },
      locations: [{ id: 'us_central', label: 'us_central', isServiceManaged: true }],
    });
  });

  it('uses the location label when present and falls back to id otherwise', () => {
    const data = baseData();
    data.locations = [
      { id: 'us_central', label: 'US Central', isServiceManaged: true },
      { id: 'priv_east' },
    ];

    const body = buildMonitorRequestBody(data);

    expect(body.locations).toEqual([
      { id: 'us_central', label: 'US Central', isServiceManaged: true },
      { id: 'priv_east', label: 'priv_east' },
    ]);
  });

  it('includes optional description, tags, and enabled flags when set', () => {
    const data = baseData();
    data.metadata.description = 'Production health check';
    data.metadata.tags = ['prod', 'critical'];
    data.enabled = false;

    const body = buildMonitorRequestBody(data);

    expect(body).toMatchObject({
      description: 'Production health check',
      tags: ['prod', 'critical'],
      enabled: false,
    });
  });

  it('omits optional fields entirely when undefined (avoids overwriting server defaults)', () => {
    const body = buildMonitorRequestBody(baseData());
    expect(body).not.toHaveProperty('description');
    expect(body).not.toHaveProperty('tags');
    expect(body).not.toHaveProperty('enabled');
  });
});
