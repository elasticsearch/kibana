/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { EuiProvider } from '@elastic/eui';
import { useForm } from 'react-hook-form';
import type { AgentFormData } from '../agent_form';
import { AiIndicesSection } from './ai_indices_section';

jest.mock('../../../../hooks/use_is_context_engine_enabled', () => ({
  useIsContextEngineEnabled: () => mockIsContextEngineEnabled,
}));
jest.mock('../../../../hooks/ai_indices/use_list_ai_indices', () => ({
  useListAiIndices: () => ({
    aiIndices: mockAvailableAiIndices,
    isLoading: mockListLoading,
    error: mockListError,
  }),
}));
jest.mock('../../../../hooks/ai_indices/use_agent_ai_indices_by_id', () => ({
  useAgentAiIndicesById: () => ({
    aiIndices: mockAgentAiIndices,
    isLoading: false,
    error: mockAgentAiIndicesError,
  }),
}));

const AGENT_ID = 'my-agent';

let mockIsContextEngineEnabled = true;
let mockAgentAiIndices: Array<{ id: string; is_default: boolean }> = [];
let mockAgentAiIndicesError: Error | undefined;
let mockAvailableAiIndices: Array<{ id: string; description?: string; managed: boolean }> = [];
let mockListError: Error | undefined;
let mockListLoading = false;

const onSubmit = jest.fn();

const TestForm: React.FC<{ assignedIds?: string[]; isFormDisabled?: boolean }> = ({
  assignedIds = [],
  isFormDisabled = false,
}) => {
  const { control, handleSubmit } = useForm<AgentFormData>({
    defaultValues: { configuration: { tools: [], ai_indices: assignedIds } },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <AiIndicesSection control={control} agentId={AGENT_ID} isFormDisabled={isFormDisabled} />
      <button type="submit">submit</button>
    </form>
  );
};

const renderSection = (props: Parameters<typeof TestForm>[0] = {}) =>
  render(
    <EuiProvider>
      <IntlProvider locale="en">
        <TestForm {...props} />
      </IntlProvider>
    </EuiProvider>
  );

const comboBox = () => screen.getByTestId('agentBuilderAdditionalAiIndices');
const openList = async () => {
  await userEvent.click(within(comboBox()).getByTestId('comboBoxToggleListButton'));
  return screen.findByRole('listbox');
};
const optionFor = (id: string) => screen.getByTestId(`agentBuilderAiIndexOption-${id}`);
const removePill = async (id: string) =>
  userEvent.click(
    within(screen.getByTestId(`agentBuilderSelectedAiIndex-${id}`)).getByRole('button')
  );
const submittedAiIndices = () => onSubmit.mock.calls[0][0].configuration.ai_indices;

describe('AiIndicesSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsContextEngineEnabled = true;
    mockAgentAiIndices = [];
    mockAgentAiIndicesError = undefined;
    mockListError = undefined;
    mockListLoading = false;
    mockAvailableAiIndices = [
      { id: 'elastic-ai-index', description: 'Ready', managed: false },
      { id: 'sales-outreach', description: 'Ready', managed: false },
      { id: 'nightshift', managed: true },
    ];
  });

  it('renders nothing when the Context Engine is off', () => {
    mockIsContextEngineEnabled = false;

    renderSection();

    expect(screen.queryByText('AI Indices')).not.toBeInTheDocument();
  });

  it('renders the section when the Context Engine is on', () => {
    renderSection();

    expect(screen.getByText('AI Indices')).toBeInTheDocument();
  });

  it('shows a callout when the AI Indices list failed to load', () => {
    mockListError = new Error('boom');

    renderSection();

    expect(screen.getByTestId('agentBuilderAiIndicesLoadError')).toBeInTheDocument();
  });

  it('shows a callout when the default AI Indices failed to load', () => {
    mockAgentAiIndicesError = new Error('boom');

    renderSection();

    expect(screen.getByTestId('agentBuilderAiIndicesLoadError')).toBeInTheDocument();
  });

  describe('default indices', () => {
    it('are listed as badges', () => {
      mockAgentAiIndices = [{ id: 'sig-events', is_default: true }];

      renderSection();

      expect(screen.getByTestId('agentBuilderDefaultAiIndex-sig-events')).toHaveTextContent(
        'sig-events (default)'
      );
    });

    it('are hidden when the agent type contributes none', () => {
      renderSection();

      expect(screen.queryByTestId('agentBuilderDefaultAiIndices')).not.toBeInTheDocument();
    });

    // The runtime prompt omits a default the user cannot see, so the badge alone would mislead.
    it('are flagged when not listed for this user', () => {
      mockAgentAiIndices = [
        { id: 'sig-events', is_default: true },
        { id: 'elastic-ai-index', is_default: true },
      ];

      renderSection();

      expect(screen.getByTestId('agentBuilderDefaultAiIndex-sig-events')).toBeInTheDocument();
      expect(screen.getByTestId('agentBuilderUnavailableDefaultAiIndices')).toHaveTextContent(
        'Not available to you in this space: sig-events'
      );
    });

    it('are not flagged while the list is loading', () => {
      mockAgentAiIndices = [{ id: 'sig-events', is_default: true }];
      mockListLoading = true;

      renderSection();

      expect(
        screen.queryByTestId('agentBuilderUnavailableDefaultAiIndices')
      ).not.toBeInTheDocument();
    });

    // They already apply, so offering them again would let the user store a redundant id whose
    // removal changes nothing on screen.
    it('are not offered as additional indices', async () => {
      mockAgentAiIndices = [{ id: 'sig-events', is_default: true }];
      mockAvailableAiIndices = [...mockAvailableAiIndices, { id: 'sig-events', managed: true }];

      renderSection();
      await openList();

      expect(screen.queryByTestId('agentBuilderAiIndexOption-sig-events')).not.toBeInTheDocument();
    });

    it('are never written back onto the agent', async () => {
      mockAgentAiIndices = [{ id: 'sig-events', is_default: true }];

      renderSection({ assignedIds: ['sales-outreach'] });

      await userEvent.click(screen.getByText('submit'));

      expect(submittedAiIndices()).toEqual(['sales-outreach']);
    });

    // An id in both layers has no pill of its own, so an edit must not silently drop it from the
    // agent's configuration: it would stop applying if the type ever stops contributing it.
    it('survive on the agent when the selection changes, if also assigned', async () => {
      mockAgentAiIndices = [{ id: 'sig-events', is_default: true }];

      renderSection({ assignedIds: ['sig-events', 'sales-outreach'] });
      await removePill('sales-outreach');
      await userEvent.click(screen.getByText('submit'));

      expect(submittedAiIndices()).toEqual(['sig-events']);
    });
  });

  describe('additional indices', () => {
    it('submits the id list when one is picked', async () => {
      renderSection();
      await openList();

      await userEvent.click(optionFor('sales-outreach'));
      await userEvent.click(screen.getByText('submit'));

      expect(submittedAiIndices()).toEqual(['sales-outreach']);
    });

    it('shows the assigned ones as pills, not as options', async () => {
      renderSection({ assignedIds: ['sales-outreach'] });

      expect(screen.getByTestId('agentBuilderSelectedAiIndex-sales-outreach')).toBeInTheDocument();

      await openList();

      expect(
        screen.queryByTestId('agentBuilderAiIndexOption-sales-outreach')
      ).not.toBeInTheDocument();
    });

    it('submits without the id when its pill is removed', async () => {
      renderSection({ assignedIds: ['sales-outreach', 'elastic-ai-index'] });

      await removePill('sales-outreach');
      await userEvent.click(screen.getByText('submit'));

      expect(submittedAiIndices()).toEqual(['elastic-ai-index']);
    });

    it('describes each option in the list', async () => {
      renderSection();
      await openList();

      expect(screen.getAllByText('Ready').length).toBe(2);
    });

    it('is disabled when the user cannot edit the agent', () => {
      renderSection({ isFormDisabled: true });

      expect(within(comboBox()).getByTestId('comboBoxSearchInput')).toBeDisabled();
    });

    // The API does not validate stored ids, so an agent can reference an index that was deleted.
    // Dropping those on save would lose configuration.
    it('keeps assigned ids the Context Engine does not know about and flags them', async () => {
      renderSection({ assignedIds: ['deleted-index', 'sales-outreach'] });

      expect(screen.getByTestId('agentBuilderSelectedAiIndex-deleted-index')).toBeInTheDocument();
      expect(screen.getByTestId('agentBuilderUnavailableAiIndices')).toHaveTextContent(
        'Not available to you in this space: deleted-index'
      );

      await userEvent.click(screen.getByText('submit'));

      expect(submittedAiIndices()).toEqual(['deleted-index', 'sales-outreach']);
    });

    it('does not flag anything while the list is loading', () => {
      mockListLoading = true;
      renderSection({ assignedIds: ['sales-outreach'] });

      expect(screen.queryByTestId('agentBuilderUnavailableAiIndices')).not.toBeInTheDocument();
    });
  });
});
