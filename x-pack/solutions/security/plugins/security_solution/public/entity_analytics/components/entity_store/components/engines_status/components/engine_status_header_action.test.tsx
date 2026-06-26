/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EngineStatusHeaderAction } from './engine_status_header_action';
import { useInstallEntityStoreMutation } from '../../../hooks/use_entity_store';
import { isEngineLoading } from '../helpers';
import type { GetEntityStoreStatusResponse } from '@kbn/entity-store/common';
import { EntityType } from '../../../../../../../common/entity_analytics/types';
import { TestProviders } from '../../../../../../common/mock';
import type { EngineComponentStatus } from '../../../../../../../common/api/entity_analytics';

jest.mock('../../../hooks/use_entity_store');
jest.mock('../helpers');

const mockUseInstallEntityStoreMutation = useInstallEntityStoreMutation as jest.Mock;
// @ts-expect-error upgrade typescript v5.9.3
const mockIsEngineLoading = isEngineLoading as jest.Mock;

const defaultComponent: EngineComponentStatus = {
  id: 'component1',
  resource: 'entity_engine',
  installed: true,
};

const defaultEngineResponse: GetEntityStoreStatusResponse['engines'][0] = {
  type: EntityType.user,
  indexPattern: '',
  filter: '',
  fieldHistoryLength: 10,
  lookbackPeriod: '24h',
  timestampField: '@timestamp',
  status: 'started',
  components: [defaultComponent],
};

describe('EngineStatusHeaderAction', () => {
  beforeEach(() => {
    mockUseInstallEntityStoreMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: false,
    });
    mockIsEngineLoading.mockReturnValue(false);
  });

  it('renders loading spinner when loading', () => {
    mockUseInstallEntityStoreMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: true,
    });

    render(<EngineStatusHeaderAction engine={undefined} />, {
      wrapper: TestProviders,
    });
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders install button when engine is undefined', () => {
    render(<EngineStatusHeaderAction engine={undefined} />, {
      wrapper: TestProviders,
    });
    expect(screen.getByText('Install')).toBeInTheDocument();
  });

  it('calls installEntityStore when install button is clicked', () => {
    const mutate = jest.fn();
    mockUseInstallEntityStoreMutation.mockReturnValue({
      mutate,
      isLoading: false,
    });

    render(<EngineStatusHeaderAction engine={undefined} />, {
      wrapper: TestProviders,
    });
    fireEvent.click(screen.getByText('Install'));
    expect(mutate).toHaveBeenCalledWith();
  });

  it('calls installEntityStore when reinstall button is clicked', () => {
    const engine: GetEntityStoreStatusResponse['engines'][0] = {
      ...defaultEngineResponse,
      components: [{ ...defaultComponent, installed: false }],
    };
    const mutate = jest.fn();
    mockUseInstallEntityStoreMutation.mockReturnValue({
      mutate,
      isLoading: false,
    });

    render(<EngineStatusHeaderAction engine={engine} />, {
      wrapper: TestProviders,
    });
    fireEvent.click(screen.getByText('Reinstall'));
    expect(mutate).toHaveBeenCalledWith();
  });

  it('renders reinstall button and tooltip when a component is not installed', () => {
    const engine: GetEntityStoreStatusResponse['engines'][0] = {
      ...defaultEngineResponse,
      components: [{ ...defaultComponent, installed: false }],
    };

    render(<EngineStatusHeaderAction engine={engine} />, {
      wrapper: TestProviders,
    });
    expect(screen.getByText('Reinstall')).toBeInTheDocument();
  });

  it('renders not action when engine is defined and no error', () => {
    render(<EngineStatusHeaderAction engine={defaultEngineResponse} />, {
      wrapper: TestProviders,
    });
    expect(screen.queryByText('Install')).not.toBeInTheDocument();
    expect(screen.queryByText('Reinstall')).not.toBeInTheDocument();
  });
});
