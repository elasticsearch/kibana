/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@kbn/i18n-react';
import { AboutPanel } from './about_panel';
import {
  createMockWiredStreamDefinition,
  createMockQueryStreamDefinition,
} from '../stream_management/data_management/shared/mocks';

const mockUseStreamDetail = jest.fn();
const mockUseStreamsPrivileges = jest.fn();
const mockUpdateStream = jest.fn();
const mockAddSuccess = jest.fn();
const mockAddError = jest.fn();
const mockRefresh = jest.fn();

jest.mock('../../hooks/use_stream_detail', () => ({
  useStreamDetail: () => mockUseStreamDetail(),
}));

jest.mock('../../hooks/use_streams_privileges', () => ({
  useStreamsPrivileges: () => mockUseStreamsPrivileges(),
}));

jest.mock('../../hooks/use_kibana', () => ({
  useKibana: () => ({
    core: {
      notifications: {
        toasts: { addSuccess: mockAddSuccess, addError: mockAddError },
      },
    },
  }),
}));

jest.mock('../../hooks/use_update_streams', () => ({
  useUpdateStreams: () => mockUpdateStream,
}));

jest.mock('../../hooks/use_generate_description', () => ({
  useGenerateDescription: () => ({
    generate: jest.fn().mockResolvedValue(null),
    isLoading: false,
    isAvailable: false,
    hasConnector: false,
  }),
}));

const renderWithI18n = (ui: React.ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);

const wiredDefinitionWithDescription = (description: string) =>
  createMockWiredStreamDefinition({
    stream: { ...createMockWiredStreamDefinition().stream, description },
  });

const queryDefinitionWithDescription = (description: string) =>
  createMockQueryStreamDefinition({
    stream: { ...createMockQueryStreamDefinition().stream, description },
  });

const draftDefinitionWithDescription = (description: string) => {
  const baseDefinition = createMockWiredStreamDefinition();
  return createMockWiredStreamDefinition({
    stream: {
      ...baseDefinition.stream,
      description,
      ingest: {
        ...baseDefinition.stream.ingest,
        wired: { ...baseDefinition.stream.ingest.wired, draft: true },
      },
    },
  });
};

describe('AboutPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseStreamsPrivileges.mockReturnValue({ ui: { manage: true } });
    mockUpdateStream.mockResolvedValue(undefined);
  });

  it('renders only the title when user has no edit rights and no description', () => {
    mockUseStreamDetail.mockReturnValue({
      definition: createMockWiredStreamDefinition({
        stream: { ...createMockWiredStreamDefinition().stream, description: '' },
        privileges: { ...createMockWiredStreamDefinition().privileges, manage: false },
      }),
    });

    renderWithI18n(<AboutPanel />);

    expect(screen.getByText('About this stream')).toBeInTheDocument();
    expect(screen.queryByText('Enter description')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Edit description')).not.toBeInTheDocument();
  });

  it('renders the description for an ingest stream', () => {
    mockUseStreamDetail.mockReturnValue({
      definition: wiredDefinitionWithDescription('Test description'),
    });

    renderWithI18n(<AboutPanel />);

    expect(screen.getByText('About this stream')).toBeInTheDocument();
    expect(screen.getByText('Test description')).toBeInTheDocument();
  });

  it('renders an ES|QL code block for a query stream', () => {
    mockUseStreamDetail.mockReturnValue({
      definition: createMockQueryStreamDefinition({
        stream: {
          ...createMockQueryStreamDefinition().stream,
          query: { view: '$.logs.ecs.query', esql: 'FROM $.logs.ecs | LIMIT 100' },
        },
      }),
    });

    renderWithI18n(<AboutPanel />);

    expect(screen.getByText('About this stream')).toBeInTheDocument();
    expect(screen.getByText('FROM $.logs.ecs | LIMIT 100')).toBeInTheDocument();
  });

  it('renders an edit query button for a query stream', () => {
    mockUseStreamDetail.mockReturnValue({
      definition: createMockQueryStreamDefinition(),
    });

    renderWithI18n(<AboutPanel />);

    expect(screen.getByTestId('queryStreamDetailsEditQueryButton')).toBeInTheDocument();
  });

  it('allows editing the description for a query stream', async () => {
    mockUseStreamDetail.mockReturnValue({
      definition: queryDefinitionWithDescription(''),
      refresh: mockRefresh,
    });

    renderWithI18n(<AboutPanel />);

    await userEvent.click(screen.getByText('Enter description'));
    fireEvent.change(screen.getByLabelText('Edit stream description'), {
      target: { value: 'Query description' },
    });
    await userEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockUpdateStream).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: expect.objectContaining({
            type: 'query',
            description: 'Query description',
          }),
        })
      );
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('does not allow editing the description for a query stream without manage privileges', () => {
    mockUseStreamsPrivileges.mockReturnValue({ ui: { manage: false } });
    mockUseStreamDetail.mockReturnValue({
      definition: queryDefinitionWithDescription(''),
    });

    renderWithI18n(<AboutPanel />);

    expect(screen.queryByText('Enter description')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Edit description')).not.toBeInTheDocument();
    expect(screen.queryByTestId('queryStreamDetailsEditQueryButton')).not.toBeInTheDocument();
  });

  it('renders the pencil edit button when the user can edit the description', () => {
    mockUseStreamDetail.mockReturnValue({
      definition: wiredDefinitionWithDescription('Some description'),
    });

    renderWithI18n(<AboutPanel />);

    expect(screen.getByLabelText('Edit description')).toBeInTheDocument();
  });

  it('renders the pencil edit button for a draft stream', () => {
    mockUseStreamDetail.mockReturnValue({
      definition: draftDefinitionWithDescription('Draft description'),
    });

    renderWithI18n(<AboutPanel />);

    expect(screen.getByLabelText('Edit description')).toBeInTheDocument();
  });

  it('renders an empty-state link when the description is empty and the user can edit', () => {
    mockUseStreamDetail.mockReturnValue({
      definition: wiredDefinitionWithDescription(''),
    });

    renderWithI18n(<AboutPanel />);

    expect(screen.getByText('Enter description')).toBeInTheDocument();
    expect(screen.getByText(/to help identify this stream/)).toBeInTheDocument();
  });

  it('enters edit mode and shows the textarea when the pencil button is clicked', async () => {
    mockUseStreamDetail.mockReturnValue({
      definition: wiredDefinitionWithDescription('Test description'),
    });

    renderWithI18n(<AboutPanel />);

    expect(screen.queryByLabelText('Edit stream description')).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Edit description'));

    expect(screen.getByLabelText('Edit stream description')).toBeInTheDocument();
  });

  it('shows the markdown mark image in edit mode', async () => {
    mockUseStreamDetail.mockReturnValue({
      definition: wiredDefinitionWithDescription(''),
    });

    renderWithI18n(<AboutPanel />);

    await userEvent.click(screen.getByText('Enter description'));

    expect(screen.getByAltText('Markdown')).toBeInTheDocument();
  });

  it('shows a Save button in edit mode', async () => {
    mockUseStreamDetail.mockReturnValue({
      definition: wiredDefinitionWithDescription('Some description'),
    });

    renderWithI18n(<AboutPanel />);

    await userEvent.click(screen.getByLabelText('Edit description'));

    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('exits edit mode when Escape is pressed from within the textarea', async () => {
    mockUseStreamDetail.mockReturnValue({
      definition: wiredDefinitionWithDescription('Some description'),
    });

    renderWithI18n(<AboutPanel />);

    await userEvent.click(screen.getByLabelText('Edit description'));
    expect(screen.getByLabelText('Edit stream description')).toBeInTheDocument();

    fireEvent.keyUp(window, { key: 'Escape' });
    expect(screen.queryByLabelText('Edit stream description')).not.toBeInTheDocument();
  });

  it('exits edit mode when Escape is pressed', async () => {
    mockUseStreamDetail.mockReturnValue({
      definition: wiredDefinitionWithDescription('Some description'),
    });

    renderWithI18n(<AboutPanel />);

    await userEvent.click(screen.getByLabelText('Edit description'));
    expect(screen.getByLabelText('Edit stream description')).toBeInTheDocument();

    fireEvent.keyUp(window, { key: 'Escape' });
    expect(screen.queryByLabelText('Edit stream description')).not.toBeInTheDocument();
  });
});
