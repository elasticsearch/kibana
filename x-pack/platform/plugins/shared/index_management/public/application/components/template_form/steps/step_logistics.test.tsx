/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';

import { StepLogistics } from './step_logistics';

let mockIsServerless = false;

jest.mock('../../../app_context', () => ({
  useAppContext: () => ({
    config: { isServerless: mockIsServerless },
    plugins: { cloud: undefined },
    core: {
      application: { capabilities: { management: { stack: { license_management: true } } } },
      getUrlForApp: () => 'http://localhost/app/management',
    },
  }),
}));

jest.mock('../../../../hooks/use_license', () => ({
  useLicense: () => ({ isAtLeastEnterprise: () => true }),
}));

const mockUseLoadSnapshotRepositories = jest.fn(() => ({
  data: {
    hasDefaultRepository: true,
    defaultRepository: 'found-snapshots',
    canCreateRepository: true,
  },
  resendRequest: jest.fn(),
}));

jest.mock('../../../services/api', () => ({
  useLoadSnapshotRepositories: () => mockUseLoadSnapshotRepositories(),
}));

describe('StepLogistics', () => {
  const baseDefaultValue = {
    name: 'my_template',
    indexPatterns: ['index-*'],
    indexMode: 'standard',
    allowAutoCreate: 'NO_OVERWRITE',
    _meta: {},
    priority: 1,
    version: 1,
    dataStream: {},
    lifecycle: { enabled: false, value: 1, unit: 'd' },
  };

  beforeEach(() => {
    mockIsServerless = false;
    mockUseLoadSnapshotRepositories.mockClear();
  });

  describe('WHEN editing an existing template', () => {
    it('SHOULD disable the name field', async () => {
      render(
        <I18nProvider>
          <StepLogistics
            defaultValue={baseDefaultValue}
            isEditing={true}
            onChange={jest.fn()}
            isLegacy={false}
          />
        </I18nProvider>
      );

      const nameRow = await screen.findByTestId('nameField');
      const nameInput = within(nameRow).getByRole('textbox');
      expect(nameInput).toBeDisabled();
    });
  });

  describe('WHEN creating a new template', () => {
    it('SHOULD enable the name field', async () => {
      render(
        <I18nProvider>
          <StepLogistics
            defaultValue={baseDefaultValue}
            isEditing={false}
            onChange={jest.fn()}
            isLegacy={false}
          />
        </I18nProvider>
      );

      const nameRow = await screen.findByTestId('nameField');
      const nameInput = within(nameRow).getByRole('textbox');
      expect(nameInput).toBeEnabled();
    });
  });

  it('SHOULD block the step when data lifecycle is invalid', async () => {
    const onChange = jest.fn();

    render(
      <I18nProvider>
        <StepLogistics defaultValue={baseDefaultValue} onChange={onChange} isLegacy={false} />
      </I18nProvider>
    );

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const callsBeforeInvalidation = onChange.mock.calls.length;

    fireEvent.click(await screen.findByTestId('dlmPhasesSelectorFrozenPhaseCard'));
    fireEvent.click(screen.getByTestId('dlmPhasesSelectorDeletePhaseCard'));

    fireEvent.change(await screen.findByTestId('deleteDurationValue'), { target: { value: '20' } });
    await screen.findByText('Must occur after the frozen phase (30d).');

    await waitFor(() => {
      expect(onChange.mock.calls.length).toBeGreaterThan(callsBeforeInvalidation);
    });

    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(await lastCall.validate()).toBe(false);
  });

  describe('WHEN running on Stateful', () => {
    it('SHOULD render the Hot and Frozen phases and load snapshot repositories', async () => {
      render(
        <I18nProvider>
          <StepLogistics defaultValue={baseDefaultValue} onChange={jest.fn()} isLegacy={false} />
        </I18nProvider>
      );

      expect(await screen.findByTestId('dlmPhasesSelectorHotPhaseCard')).toBeInTheDocument();
      expect(screen.getByTestId('dlmPhasesSelectorFrozenPhaseCard')).toBeInTheDocument();
      expect(screen.getByTestId('dlmPhasesSelectorDeletePhaseCard')).toBeInTheDocument();
      expect(mockUseLoadSnapshotRepositories).toHaveBeenCalled();
    });
  });

  describe('WHEN running on Serverless', () => {
    beforeEach(() => {
      mockIsServerless = true;
    });

    it('SHOULD only render the Delete phase', async () => {
      render(
        <I18nProvider>
          <StepLogistics defaultValue={baseDefaultValue} onChange={jest.fn()} isLegacy={false} />
        </I18nProvider>
      );

      expect(await screen.findByTestId('dlmPhasesSelectorDeletePhaseCard')).toBeInTheDocument();
      expect(screen.queryByTestId('dlmPhasesSelectorHotPhaseCard')).not.toBeInTheDocument();
      expect(screen.queryByTestId('dlmPhasesSelectorFrozenPhaseCard')).not.toBeInTheDocument();
    });

    it('SHOULD NOT load snapshot repositories', async () => {
      render(
        <I18nProvider>
          <StepLogistics defaultValue={baseDefaultValue} onChange={jest.fn()} isLegacy={false} />
        </I18nProvider>
      );

      await screen.findByTestId('dlmPhasesSelectorDeletePhaseCard');
      expect(mockUseLoadSnapshotRepositories).not.toHaveBeenCalled();
    });
  });
});
