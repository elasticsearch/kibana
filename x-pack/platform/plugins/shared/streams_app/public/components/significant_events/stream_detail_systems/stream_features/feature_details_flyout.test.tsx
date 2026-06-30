/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import type { Feature } from '@kbn/significant-events-schema';
import { FeatureDetailsFlyout } from './feature_details_flyout';

function createMinimalFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feature-123',
    uuid: 'feature-uuid',
    type: 'service',
    description: 'A test feature',
    properties: { key: 'value' },
    confidence: 80,
    evidence: [],
    tags: [],
    meta: {},
    updated_at: '2025-01-01T00:00:00Z',
    stream_name: 'test-stream',
    ...overrides,
  };
}

const renderWithProviders = (ui: React.ReactElement) => {
  return render(<I18nProvider>{ui}</I18nProvider>);
};

describe('FeatureDetailsFlyout', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the feature ID in the flyout', () => {
    const feature = createMinimalFeature({ id: 'feature-123' });
    renderWithProviders(<FeatureDetailsFlyout feature={feature} onClose={mockOnClose} />);

    const idElement = screen.getByTestId('streamsAppFeatureDetailsFlyoutId');
    expect(idElement).toBeInTheDocument();
    expect(idElement).toHaveTextContent('feature-123');
  });

  it('shows the Meta section as JSON when meta has values', () => {
    const feature = createMinimalFeature({
      meta: { key1: 'value1', key2: 42 },
    });
    renderWithProviders(<FeatureDetailsFlyout feature={feature} onClose={mockOnClose} />);

    const metaSection = screen.getByTestId('streamsAppFeatureDetailsFlyoutMeta');
    expect(metaSection).toBeInTheDocument();
    expect(metaSection.textContent).toContain('"key1"');
    expect(metaSection.textContent).toContain('"value1"');
    expect(metaSection.textContent).toContain('"key2"');
    expect(metaSection.textContent).toContain('42');
  });

  it('shows the Meta section with "No meta information" when meta is empty', () => {
    const feature = createMinimalFeature({ meta: {} });
    renderWithProviders(<FeatureDetailsFlyout feature={feature} onClose={mockOnClose} />);

    const metaSection = screen.getByTestId('streamsAppFeatureDetailsFlyoutMeta');
    expect(metaSection).toBeInTheDocument();
    expect(screen.getByText('No meta information')).toBeInTheDocument();
  });

  it('shows nested meta values as JSON in a code block', () => {
    const feature = createMinimalFeature({
      meta: { endpoints: [{ host: 'a' }] },
    });
    renderWithProviders(<FeatureDetailsFlyout feature={feature} onClose={mockOnClose} />);

    const metaSection = screen.getByTestId('streamsAppFeatureDetailsFlyoutMeta');
    expect(metaSection).toBeInTheDocument();
    expect(metaSection.textContent).toContain('endpoints');
    expect(metaSection.textContent).toContain('"host"');
    expect(metaSection.textContent).toContain('"a"');
  });

  it('shows the Raw document section with the full feature as JSON', () => {
    const feature = createMinimalFeature({ id: 'raw-doc-feature', type: 'dataset_analysis' });
    renderWithProviders(<FeatureDetailsFlyout feature={feature} onClose={mockOnClose} />);

    const rawDocumentSection = screen.getByTestId('streamsAppFeatureDetailsFlyoutRawDocument');
    expect(rawDocumentSection).toBeInTheDocument();
    expect(rawDocumentSection.textContent).toContain('"id"');
    expect(rawDocumentSection.textContent).toContain('"raw-doc-feature"');
    expect(rawDocumentSection.textContent).toContain('"type"');
    expect(rawDocumentSection.textContent).toContain('"dataset_analysis"');
  });
});
