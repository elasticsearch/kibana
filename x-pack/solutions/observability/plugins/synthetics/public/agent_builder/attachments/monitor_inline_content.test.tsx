/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { MonitorInlineContent } from './monitor_inline_content';
import type { MonitorAttachment } from './monitor_attachment_definition';

const createAttachment = (
  overrides: {
    origin?: string;
    urls?: string;
    description?: string;
    tags?: string[];
    locations?: Array<{ id: string; label?: string; isServiceManaged?: boolean }>;
    schedule?: { number: string; unit: string };
  } = {}
): MonitorAttachment =>
  ({
    id: 'att-1',
    type: 'observability.synthetics.monitor',
    versions: [],
    current_version: 1,
    origin: overrides.origin,
    data: {
      type: 'http',
      urls: overrides.urls ?? 'https://www.elastic.co',
      schedule: overrides.schedule ?? { number: '5', unit: 'm' },
      locations: overrides.locations ?? [{ id: 'us_central', isServiceManaged: true }],
      metadata: {
        name: 'Elastic uptime',
        description: overrides.description,
        tags: overrides.tags,
      },
    },
  } as unknown as MonitorAttachment);

describe('MonitorInlineContent', () => {
  it('does not render the monitor name in the body (rendered by the attachment header)', () => {
    const { queryByText } = render(
      <MonitorInlineContent attachment={createAttachment()} isSidebar={false} />
    );
    expect(queryByText('Elastic uptime')).toBeNull();
  });

  it('shows the HTTP type badge', () => {
    const { getByText } = render(
      <MonitorInlineContent attachment={createAttachment()} isSidebar={false} />
    );
    expect(getByText('HTTP')).toBeDefined();
  });

  it('shows draft status when origin is unset', () => {
    const { getByText } = render(
      <MonitorInlineContent attachment={createAttachment()} isSidebar={false} />
    );
    expect(getByText('draft')).toBeDefined();
  });

  it('shows saved status when origin is set', () => {
    const { getByText } = render(
      <MonitorInlineContent
        attachment={createAttachment({ origin: 'config-123' })}
        isSidebar={false}
      />
    );
    expect(getByText('saved')).toBeDefined();
  });

  it('renders the URL', () => {
    const { getByText } = render(
      <MonitorInlineContent
        attachment={createAttachment({ urls: 'https://example.com/health' })}
        isSidebar={false}
      />
    );
    expect(getByText('https://example.com/health')).toBeDefined();
  });

  it('renders the schedule interval', () => {
    const { getByText } = render(
      <MonitorInlineContent
        attachment={createAttachment({ schedule: { number: '10', unit: 'm' } })}
        isSidebar={false}
      />
    );
    expect(getByText('Every 10m')).toBeDefined();
  });

  it('renders location labels when present, falling back to ids otherwise', () => {
    const { getByText } = render(
      <MonitorInlineContent
        attachment={createAttachment({
          locations: [
            { id: 'us_central', label: 'US Central', isServiceManaged: true },
            { id: 'priv_east' },
          ],
        })}
        isSidebar={false}
      />
    );
    expect(getByText('US Central')).toBeDefined();
    expect(getByText('priv_east')).toBeDefined();
  });

  it('renders the description when present', () => {
    const { getByText } = render(
      <MonitorInlineContent
        attachment={createAttachment({ description: 'Production health check' })}
        isSidebar={false}
      />
    );
    expect(getByText('Production health check')).toBeDefined();
  });

  it('does not render the description when absent', () => {
    const { queryByText } = render(
      <MonitorInlineContent attachment={createAttachment()} isSidebar={false} />
    );
    expect(queryByText(/Production/)).toBeNull();
  });

  it('renders tags when present', () => {
    const { getByText } = render(
      <MonitorInlineContent
        attachment={createAttachment({ tags: ['prod', 'critical'] })}
        isSidebar={false}
      />
    );
    expect(getByText('prod')).toBeDefined();
    expect(getByText('critical')).toBeDefined();
  });

  it('does not render the tags row when empty', () => {
    const { queryByText } = render(
      <MonitorInlineContent attachment={createAttachment({ tags: [] })} isSidebar={false} />
    );
    expect(queryByText('prod')).toBeNull();
  });
});
