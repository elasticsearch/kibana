/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ConnectorTypes } from '../../../../common/types/domain';
import type { TemplateMetadataPreviewProps } from './template_metadata_preview';
import { TemplateMetadataPreview } from './template_metadata_preview';

jest.mock('../../severity/config', () => ({
  SeverityHealth: ({ severity }: { severity: string }) => (
    <span data-test-subj="severity-health">{severity}</span>
  ),
}));

const mockUseCasesFeatures = jest.fn(() => ({ isSyncAlertsEnabled: true }));
jest.mock('../../../common/use_cases_features', () => ({
  useCasesFeatures: () => mockUseCasesFeatures(),
}));

const defaultProps: TemplateMetadataPreviewProps = {
  parsedTemplate: {
    name: 'Test case title',
    fields: [],
  },
};

const renderComponent = (props: Partial<TemplateMetadataPreviewProps> = {}) =>
  render(<TemplateMetadataPreview {...defaultProps} {...props} />);

describe('TemplateMetadataPreview', () => {
  beforeEach(() => {
    mockUseCasesFeatures.mockReturnValue({ isSyncAlertsEnabled: true });
  });

  it('renders the case default title', () => {
    renderComponent();

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Test case title')).toBeInTheDocument();
  });

  it('renders case defaults metadata when provided', () => {
    renderComponent({
      parsedTemplate: {
        name: 'Default title',
        description: 'A test description',
        severity: 'high',
        category: 'Security',
        tags: ['tag-one', 'tag-two'],
        assignees: [{ uid: 'analyst-1' }, { uid: 'analyst-2' }],
        fields: [],
      },
    });

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Default title')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('A test description')).toBeInTheDocument();
    expect(screen.getByText('Severity')).toBeInTheDocument();
    expect(screen.getByTestId('severity-health')).toHaveTextContent('high');
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText('Tags')).toBeInTheDocument();
    expect(screen.getByTestId('template-column-tag-tag-one')).toHaveTextContent('tag-one');
    expect(screen.getByTestId('template-column-tag-tag-two')).toHaveTextContent('tag-two');
    expect(screen.getByText('Assignees')).toBeInTheDocument();
    expect(screen.getByText('analyst-1, analyst-2')).toBeInTheDocument();
  });

  it('renders sync alerts setting when provided', () => {
    renderComponent({
      parsedTemplate: {
        name: 'Title',
        settings: { syncAlerts: true },
        fields: [],
      },
    });

    expect(screen.getByText('Sync Detections')).toBeInTheDocument();
    expect(screen.getByText('On')).toBeInTheDocument();
  });

  it('does not render the sync alerts setting when alert syncing is disabled (e.g. Observability)', () => {
    mockUseCasesFeatures.mockReturnValue({ isSyncAlertsEnabled: false });

    renderComponent({
      parsedTemplate: {
        name: 'Title',
        settings: { syncAlerts: true },
        fields: [],
      },
    });

    expect(screen.queryByText('Sync Detections')).not.toBeInTheDocument();
  });

  it('renders extract observables setting when provided', () => {
    renderComponent({
      parsedTemplate: {
        name: 'Title',
        settings: { extractObservables: false },
        fields: [],
      },
    });

    expect(screen.getByText('Extract observables')).toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();
  });

  it('does not render settings rows when settings are not provided', () => {
    renderComponent();

    expect(screen.queryByText('Sync Detections')).not.toBeInTheDocument();
    expect(screen.queryByText('Extract observables')).not.toBeInTheDocument();
  });

  it('does not render the connector preview for the none connector', () => {
    renderComponent({
      parsedTemplate: {
        name: 'Title',
        connector: { type: ConnectorTypes.none, id: 'none', fields: null },
        fields: [],
      },
    });

    expect(screen.queryByText('Connector')).not.toBeInTheDocument();
  });

  it('renders all metadata fields together', () => {
    renderComponent({
      parsedTemplate: {
        name: 'Full Template',
        description: 'Complete description',
        severity: 'critical',
        category: 'Observability',
        tags: ['alpha', 'beta'],
        fields: [],
      },
    });

    expect(screen.getByText('Full Template')).toBeInTheDocument();
    expect(screen.getByText('Complete description')).toBeInTheDocument();
    expect(screen.getByTestId('severity-health')).toHaveTextContent('critical');
    expect(screen.getByText('Observability')).toBeInTheDocument();
    expect(screen.getByTestId('template-column-tag-alpha')).toBeInTheDocument();
    expect(screen.getByTestId('template-column-tag-beta')).toBeInTheDocument();
  });
});
