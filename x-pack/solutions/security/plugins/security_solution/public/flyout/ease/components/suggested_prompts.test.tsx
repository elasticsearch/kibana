/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { SuggestedPrompts } from './suggested_prompts';
import { useAssistantContext, useAssistantOverlay } from '@kbn/elastic-assistant';

// Mock the custom hooks
jest.mock('@kbn/elastic-assistant', () => ({
  useAssistantContext: jest.fn(),
  useAssistantOverlay: jest.fn(),
}));

describe('SuggestedPrompts', () => {
  const mockShowAssistantOverlay = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useAssistantContext as jest.Mock).mockReturnValue({
      assistantAvailability: { isAssistantEnabled: true, isAssistantVisible: true },
    });
    (useAssistantOverlay as jest.Mock).mockReturnValue({
      showAssistantOverlay: mockShowAssistantOverlay,
    });
  });

  it('renders the suggested prompts', () => {
    const { container } = render(
      <SuggestedPrompts
        getPromptContext={jest.fn()}
        ruleName="Test Rule"
        timestamp="2023-01-01T00:00:00Z"
      />
    );
    expect(container.querySelectorAll('button')).toHaveLength(3); // Assuming there are 3 prompts
  });

  it('calls showAssistantOverlay when a prompt is clicked', () => {
    const { container } = render(
      <SuggestedPrompts
        getPromptContext={jest.fn()}
        ruleName="Test Rule"
        timestamp="2023-01-01T00:00:00Z"
      />
    );

    const firstPromptButton = container.querySelectorAll('button')[0];
    fireEvent.click(firstPromptButton);

    expect(mockShowAssistantOverlay).toHaveBeenCalledWith(true);
  });

  it('displays the correct title and description in the overlay', () => {
    const { container } = render(
      <SuggestedPrompts
        getPromptContext={jest.fn()}
        ruleName="Test Rule"
        timestamp="2023-01-01T00:00:00Z"
      />
    );

    const firstPromptButton = container.querySelectorAll('button')[0];
    fireEvent.click(firstPromptButton);

    expect(mockShowAssistantOverlay).toHaveBeenCalledWith(true);
    expect(mockShowAssistantOverlay).toHaveBeenCalledTimes(1);
  });
});
