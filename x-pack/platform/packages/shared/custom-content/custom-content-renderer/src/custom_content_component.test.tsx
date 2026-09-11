/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { useCustomContentHtml } from './use_custom_content_html';
import { CustomContentComponent } from './custom_content_component';
import type { CustomContentRendererServices } from './types';

jest.mock('./use_custom_content_html', () => ({ useCustomContentHtml: jest.fn() }));

const mockUseCustomContentHtml = useCustomContentHtml as jest.MockedFunction<
  typeof useCustomContentHtml
>;

const defaultProps = {
  services: {} as CustomContentRendererServices,
  embeddableId: 'panel-1',
  esqlQuery: undefined,
  timeRange: undefined,
  generationVersion: 0,
  savedTemplate: '<p>hi</p>',
  isApproximate: false,
  projectRouting: undefined,
  query: undefined,
  filters: undefined,
  esqlVariables: undefined,
  previewHtml: null,
  onLoadingChange: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseCustomContentHtml.mockReturnValue({
    html: '<p>hi</p>',
    isLoading: false,
    error: undefined,
    noContent: false,
  });
});

describe('CustomContentComponent', () => {
  // Screenshotting waits for `[data-shared-item]` to reach the dashboard's panel count before
  // capturing; without it a report waits the full render timeout on every export.
  it('marks its root as a shared item so reporting can count it', () => {
    const { container } = render(<CustomContentComponent {...defaultProps} />);
    expect(container.querySelector('[data-shared-item]')).not.toBeNull();
  });

  it('reports loading state to the panel', () => {
    const onLoadingChange = jest.fn();
    mockUseCustomContentHtml.mockReturnValue({
      html: '',
      isLoading: true,
      error: undefined,
      noContent: false,
    });

    render(<CustomContentComponent {...defaultProps} onLoadingChange={onLoadingChange} />);

    expect(onLoadingChange).toHaveBeenCalledWith(true);
  });

  it('renders the template in a fully sandboxed iframe', () => {
    const { container } = render(<CustomContentComponent {...defaultProps} />);

    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute('sandbox')).toBe('');
  });

  it('sandboxes the preview iframe too', () => {
    mockUseCustomContentHtml.mockReturnValue({
      html: '',
      isLoading: false,
      error: undefined,
      noContent: false,
    });
    const { container } = render(
      <CustomContentComponent {...defaultProps} previewHtml="<p>preview</p>" />
    );

    expect(container.querySelector('iframe')!.getAttribute('sandbox')).toBe('');
  });

  it('shows the generating prompt while the agent is working', () => {
    render(<CustomContentComponent {...defaultProps} isGenerating />);

    expect(screen.getByTestId('customContentGeneratingPrompt')).toBeInTheDocument();
    expect(screen.getByText('Generating your panel')).toBeInTheDocument();
  });
});
