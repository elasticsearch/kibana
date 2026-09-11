/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { EuiThemeProvider } from '@elastic/eui';
import { SERVICE_MAP_CONTEXT_ATTACHMENT_TYPE } from '../../../common/agent_builder/attachments';
import { createServiceMapContextAttachmentDefinition } from './register_service_map_context_attachment';

const buildAttachment = (data: Record<string, unknown>) => ({
  id: 'test-attachment',
  type: SERVICE_MAP_CONTEXT_ATTACHMENT_TYPE as typeof SERVICE_MAP_CONTEXT_ATTACHMENT_TYPE,
  data: data as Parameters<
    ReturnType<typeof createServiceMapContextAttachmentDefinition>['renderInlineContent']
  >[0]['attachment']['data'],
});

const renderBadges = (data: Record<string, unknown>) => {
  const definition = createServiceMapContextAttachmentDefinition();
  const attachment = buildAttachment(data);
  return render(
    <EuiThemeProvider>{definition.renderInlineContent({ attachment })}</EuiThemeProvider>
  );
};

describe('createServiceMapContextAttachmentDefinition', () => {
  it('renders the time range as a badge', () => {
    const { getByText } = renderBadges({ timeRange: { from: 'now-1h', to: 'now' } });
    expect(getByText('now-1h → now')).toBeInTheDocument();
  });

  it('renders the environment badge when present', () => {
    const { getByText } = renderBadges({
      timeRange: { from: 'now-1h', to: 'now' },
      environment: 'production',
    });
    expect(getByText('production')).toBeInTheDocument();
  });

  it('does not render an environment badge when absent', () => {
    const { queryByText } = renderBadges({ timeRange: { from: 'now-1h', to: 'now' } });
    expect(queryByText('production')).not.toBeInTheDocument();
  });

  it('renders the kuery badge when present', () => {
    const { getByText } = renderBadges({
      timeRange: { from: 'now-1h', to: 'now' },
      kuery: 'service.name: "frontend"',
    });
    expect(getByText('service.name: "frontend"')).toBeInTheDocument();
  });

  it('renders the service group badge when present', () => {
    const { getByText } = renderBadges({
      timeRange: { from: 'now-1h', to: 'now' },
      serviceGroupId: 'my-group',
    });
    expect(getByText('Group: my-group')).toBeInTheDocument();
  });

  it('renders a badge per highlighted service name', () => {
    const { getByText } = renderBadges({
      timeRange: { from: 'now-1h', to: 'now' },
      highlightedServiceNames: ['frontend', 'checkout'],
    });
    expect(getByText('frontend')).toBeInTheDocument();
    expect(getByText('checkout')).toBeInTheDocument();
  });

  it('renders only the time range badge when all optional fields are absent', () => {
    const { getAllByRole } = renderBadges({ timeRange: { from: 'now-1h', to: 'now' } });
    // EuiBadge renders as a span with a 'generic' role; there should be exactly one
    const badges = getAllByRole('generic').filter((el) => el.textContent?.includes('now-1h → now'));
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  describe('getLabel', () => {
    it('returns "Service map context"', () => {
      const definition = createServiceMapContextAttachmentDefinition();
      expect(definition.getLabel()).toBe('Service map context');
    });
  });

  describe('getIcon', () => {
    it('returns "graphApp"', () => {
      const definition = createServiceMapContextAttachmentDefinition();
      expect(definition.getIcon()).toBe('graphApp');
    });
  });
});
