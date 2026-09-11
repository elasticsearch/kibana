/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { render, waitFor, act } from '@testing-library/react';
import type { PolicyFromES } from '@kbn/index-lifecycle-management-common-shared';
import type { TemplateListItem as IndexTemplate } from '@kbn/index-management-shared-types';

import { ConfirmTemplateDetailsSection } from './confirm_template_details_section';
import type { IlmPolicyFetcher, SimulatedTemplateFetcher } from '../../../../utils';

const createMockTemplate = (overrides: Partial<IndexTemplate> = {}): IndexTemplate => ({
  name: 'test-template',
  indexPatterns: ['test-*'],
  allowAutoCreate: 'NO_OVERWRITE',
  _kbnMeta: { type: 'default', hasDatastream: true },
  hasSettings: false,
  hasAliases: false,
  hasMappings: false,
  ...overrides,
});

const createMockIlmPolicy = (phases: PolicyFromES['policy']['phases'] = {}): PolicyFromES => ({
  name: 'test-policy',
  version: 1,
  modifiedDate: '2024-01-01T00:00:00.000Z',
  policy: {
    phases,
    name: 'test-policy',
  },
});

const createMockSimulatedTemplate = (
  mode: string = 'standard',
  ilmPolicyName?: string,
  lifecycle?: { enabled: boolean; data_retention?: string }
) => ({
  template: {
    settings: {
      index: {
        mode,
        ...(ilmPolicyName ? { lifecycle: { name: ilmPolicyName } } : {}),
      },
    },
    ...(lifecycle ? { lifecycle } : {}),
  },
});

const renderComponent = (
  template: IndexTemplate,
  getIlmPolicy?: IlmPolicyFetcher,
  getSimulatedTemplate?: SimulatedTemplateFetcher
) => {
  return render(
    <IntlProvider>
      <ConfirmTemplateDetailsSection
        template={template}
        getIlmPolicy={getIlmPolicy}
        getSimulatedTemplate={getSimulatedTemplate}
      />
    </IntlProvider>
  );
};

describe('ConfirmTemplateDetailsSection', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('rendering', () => {
    it('renders the section title', () => {
      const template = createMockTemplate();
      const { getByText, getByTestId } = renderComponent(template);

      expect(getByText('Confirm index template details')).toBeInTheDocument();
      expect(getByTestId('templateDetails')).toBeInTheDocument();
    });

    it('renders template details in a description list', () => {
      const template = createMockTemplate();
      const { getByTestId } = renderComponent(template);

      const descriptionList = getByTestId('templateDetails');
      expect(descriptionList).toBeInTheDocument();
    });
  });

  describe('version display', () => {
    it('displays version when present', () => {
      const template = createMockTemplate({ version: 5 });
      const { getByText } = renderComponent(template);

      expect(getByText('Version')).toBeInTheDocument();
      expect(getByText('5')).toBeInTheDocument();
    });

    it('displays version 0 when version is 0', () => {
      const template = createMockTemplate({ version: 0 });
      const { getByText } = renderComponent(template);

      expect(getByText('Version')).toBeInTheDocument();
      expect(getByText('0')).toBeInTheDocument();
    });

    it('does not display version when not present', () => {
      const template = createMockTemplate({ version: undefined });
      const { queryByText } = renderComponent(template);

      expect(queryByText('Version')).not.toBeInTheDocument();
    });
  });

  describe('index mode display', () => {
    it('displays Standard index mode by default from simulated template', async () => {
      const template = createMockTemplate();
      const mockGetSimulatedTemplate = jest
        .fn()
        .mockResolvedValue(createMockSimulatedTemplate('standard'));

      const { findByText } = renderComponent(template, undefined, mockGetSimulatedTemplate);

      await findByText('Index mode');
      await findByText('Standard');
    });

    it('displays LogsDB index mode from simulated template', async () => {
      const template = createMockTemplate();
      const mockGetSimulatedTemplate = jest
        .fn()
        .mockResolvedValue(createMockSimulatedTemplate('logsdb'));

      const { findByText } = renderComponent(template, undefined, mockGetSimulatedTemplate);

      await findByText('LogsDB');
    });

    it('displays Lookup index mode from simulated template', async () => {
      const template = createMockTemplate();
      const mockGetSimulatedTemplate = jest
        .fn()
        .mockResolvedValue(createMockSimulatedTemplate('lookup'));

      const { findByText } = renderComponent(template, undefined, mockGetSimulatedTemplate);

      await findByText('Lookup');
    });

    it('displays Time series index mode from simulated template', async () => {
      const template = createMockTemplate();
      const mockGetSimulatedTemplate = jest
        .fn()
        .mockResolvedValue(createMockSimulatedTemplate('time_series'));

      const { findByText } = renderComponent(template, undefined, mockGetSimulatedTemplate);

      await findByText('Time series');
    });

    it('does not display index mode when getSimulatedTemplate is not provided', () => {
      const template = createMockTemplate();
      const { queryByText } = renderComponent(template);

      expect(queryByText('Index mode')).not.toBeInTheDocument();
    });
  });

  describe('retention display', () => {
    describe('ILM policy retention from simulated template', () => {
      it('displays ILM policy name with badge from simulated template', async () => {
        const template = createMockTemplate();
        const mockGetSimulatedTemplate = jest
          .fn()
          .mockResolvedValue(createMockSimulatedTemplate('standard', 'my-ilm-policy'));

        const { findByText } = renderComponent(template, undefined, mockGetSimulatedTemplate);

        await findByText('Retention');
        await findByText('my-ilm-policy');
        await findByText('ILM');
      });

      it('does not display ILM retention when simulated template has no ILM policy', async () => {
        const template = createMockTemplate({ lifecycle: undefined });
        const mockGetSimulatedTemplate = jest
          .fn()
          .mockResolvedValue(createMockSimulatedTemplate('standard'));

        const { findByText, queryByText } = renderComponent(
          template,
          undefined,
          mockGetSimulatedTemplate
        );

        await findByText('Index mode');
        expect(queryByText('Retention')).not.toBeInTheDocument();
        expect(queryByText('ILM')).not.toBeInTheDocument();
      });
    });

    describe('data retention fallback (lifecycle from template)', () => {
      it('displays data retention from template when simulated template has no ILM policy', async () => {
        const template = createMockTemplate({
          lifecycle: { enabled: true, value: 30, unit: 'd' },
        });
        const mockGetSimulatedTemplate = jest
          .fn()
          .mockResolvedValue(createMockSimulatedTemplate('standard'));

        const { findByText } = renderComponent(template, undefined, mockGetSimulatedTemplate);

        await findByText('Retention');
        await findByText('30d');
      });

      it('displays data retention with different units', async () => {
        const template = createMockTemplate({
          lifecycle: { enabled: true, value: 2, unit: 'h' },
        });
        const mockGetSimulatedTemplate = jest
          .fn()
          .mockResolvedValue(createMockSimulatedTemplate('standard'));

        const { findByText } = renderComponent(template, undefined, mockGetSimulatedTemplate);

        await findByText('2h');
      });

      it('prefers ILM policy from simulated template over lifecycle from template', async () => {
        const template = createMockTemplate({
          lifecycle: { enabled: true, value: 30, unit: 'd' },
        });
        const mockGetSimulatedTemplate = jest
          .fn()
          .mockResolvedValue(createMockSimulatedTemplate('standard', 'my-policy'));

        const { findByText, queryByText } = renderComponent(
          template,
          undefined,
          mockGetSimulatedTemplate
        );

        await findByText('my-policy');
        await findByText('ILM');
        expect(queryByText('30d')).not.toBeInTheDocument();
      });
    });

    describe('lookup index mode (lifecycle not applied)', () => {
      it('shows the not-applied notice instead of the ILM policy and does not fetch the policy', async () => {
        const template = createMockTemplate();
        const mockGetSimulatedTemplate = jest
          .fn()
          .mockResolvedValue(createMockSimulatedTemplate('lookup', 'my-ilm-policy'));
        const mockGetIlmPolicy = jest
          .fn()
          .mockResolvedValue(createMockIlmPolicy({ hot: { min_age: '0ms', actions: {} } }));

        const { findByText, findByTestId, queryByText } = renderComponent(
          template,
          mockGetIlmPolicy,
          mockGetSimulatedTemplate
        );

        await findByText('Lookup');
        await findByText('Retention');
        await findByTestId('lookupRetentionNotApplied');
        expect(queryByText('my-ilm-policy')).not.toBeInTheDocument();
        expect(queryByText('ILM')).not.toBeInTheDocument();
        expect(mockGetIlmPolicy).not.toHaveBeenCalled();
      });

      it('shows the not-applied notice instead of the data stream lifecycle value', async () => {
        const template = createMockTemplate({
          lifecycle: { enabled: true, value: 30, unit: 'd' },
        });
        const mockGetSimulatedTemplate = jest
          .fn()
          .mockResolvedValue(createMockSimulatedTemplate('lookup'));

        const { findByText, findByTestId, queryByText } = renderComponent(
          template,
          undefined,
          mockGetSimulatedTemplate
        );

        await findByText('Lookup');
        await findByText('Retention');
        await findByTestId('lookupRetentionNotApplied');
        expect(queryByText('30d')).not.toBeInTheDocument();
      });

      it('shows the not-applied notice for a data stream lifecycle inherited from a component template', async () => {
        const template = createMockTemplate({ lifecycle: undefined });
        const mockGetSimulatedTemplate = jest.fn().mockResolvedValue(
          createMockSimulatedTemplate('lookup', undefined, {
            enabled: true,
            data_retention: '30d',
          })
        );

        const { findByText, findByTestId } = renderComponent(
          template,
          undefined,
          mockGetSimulatedTemplate
        );

        await findByText('Lookup');
        await findByText('Retention');
        await findByTestId('lookupRetentionNotApplied');
      });

      it('does not show a Retention row for a disabled inherited data stream lifecycle', async () => {
        const template = createMockTemplate({ lifecycle: undefined });
        const mockGetSimulatedTemplate = jest.fn().mockResolvedValue(
          createMockSimulatedTemplate('lookup', undefined, {
            enabled: false,
          })
        );

        const { findByText, queryByText, queryByTestId } = renderComponent(
          template,
          undefined,
          mockGetSimulatedTemplate
        );

        await findByText('Lookup');
        expect(queryByText('Retention')).not.toBeInTheDocument();
        expect(queryByTestId('lookupRetentionNotApplied')).not.toBeInTheDocument();
      });

      it('does not show a Retention row when the lookup template has no lifecycle', async () => {
        const template = createMockTemplate({ lifecycle: undefined });
        const mockGetSimulatedTemplate = jest
          .fn()
          .mockResolvedValue(createMockSimulatedTemplate('lookup'));

        const { findByText, queryByText, queryByTestId } = renderComponent(
          template,
          undefined,
          mockGetSimulatedTemplate
        );

        await findByText('Lookup');
        expect(queryByText('Retention')).not.toBeInTheDocument();
        expect(queryByTestId('lookupRetentionNotApplied')).not.toBeInTheDocument();
      });
    });
  });

  describe('component templates display', () => {
    it('displays component templates when present', () => {
      const template = createMockTemplate({
        composedOf: ['logs@mappings', 'logs@settings'],
      });
      const { getByText } = renderComponent(template);

      expect(getByText('Component templates')).toBeInTheDocument();
      expect(getByText('logs@mappings')).toBeInTheDocument();
      expect(getByText('logs@settings')).toBeInTheDocument();
    });

    it('displays single component template', () => {
      const template = createMockTemplate({
        composedOf: ['single-component'],
      });
      const { getByText } = renderComponent(template);

      expect(getByText('Component templates')).toBeInTheDocument();
      expect(getByText('single-component')).toBeInTheDocument();
    });

    it('does not display component templates section when empty', () => {
      const template = createMockTemplate({ composedOf: [] });
      const { queryByText } = renderComponent(template);

      expect(queryByText('Component templates')).not.toBeInTheDocument();
    });

    it('does not display component templates section when undefined', () => {
      const template = createMockTemplate({ composedOf: undefined });
      const { queryByText } = renderComponent(template);

      expect(queryByText('Component templates')).not.toBeInTheDocument();
    });
  });

  describe('ILM policy fetching', () => {
    // ILM policy is fetched based on ilmPolicyName from simulated template
    const createSimulatedTemplateWithIlm = (policyName: string) =>
      createMockSimulatedTemplate('standard', policyName);

    it('fetches ILM policy when simulated template has ILM policy and getIlmPolicy is provided', async () => {
      const mockGetIlmPolicy = jest.fn().mockResolvedValue(
        createMockIlmPolicy({
          hot: { actions: {} },
          warm: { min_age: '7d', actions: {} },
        })
      );
      const mockGetSimulatedTemplate = jest
        .fn()
        .mockResolvedValue(createSimulatedTemplateWithIlm('test-policy'));

      const template = createMockTemplate();
      const { findByText, container } = renderComponent(
        template,
        mockGetIlmPolicy,
        mockGetSimulatedTemplate
      );

      // Wait for fetch to complete
      await waitFor(() => {
        expect(mockGetIlmPolicy).toHaveBeenCalledWith('test-policy', expect.any(AbortSignal));
        expect(container.querySelector('.euiLoadingSpinner')).not.toBeInTheDocument();
      });
      await findByText(/Hot/i);
    });

    it('does not fetch ILM policy when simulated template has no ILM policy', async () => {
      const mockGetIlmPolicy = jest.fn();
      const mockGetSimulatedTemplate = jest
        .fn()
        .mockResolvedValue(createMockSimulatedTemplate('standard'));

      const template = createMockTemplate();
      renderComponent(template, mockGetIlmPolicy, mockGetSimulatedTemplate);

      await waitFor(() => {
        expect(mockGetSimulatedTemplate).toHaveBeenCalled();
      });
      expect(mockGetIlmPolicy).not.toHaveBeenCalled();
    });

    it('does not fetch ILM policy when getIlmPolicy is not provided', async () => {
      const mockGetSimulatedTemplate = jest
        .fn()
        .mockResolvedValue(createSimulatedTemplateWithIlm('test-policy'));

      const template = createMockTemplate();
      const { findByText } = renderComponent(template, undefined, mockGetSimulatedTemplate);

      await findByText('test-policy');
    });

    describe('loading state', () => {
      it('shows loading spinner while fetching ILM policy', async () => {
        const mockGetIlmPolicy = jest.fn().mockImplementation(() => {
          return new Promise((resolve) => {
            setTimeout(() => resolve(createMockIlmPolicy({ hot: { actions: {} } })), 1000);
          });
        });
        const mockGetSimulatedTemplate = jest
          .fn()
          .mockResolvedValue(createSimulatedTemplateWithIlm('test-policy'));

        const template = createMockTemplate();
        const { container, unmount } = renderComponent(
          template,
          mockGetIlmPolicy,
          mockGetSimulatedTemplate
        );

        await waitFor(() => {
          expect(mockGetIlmPolicy).toHaveBeenCalled();
        });

        // Loading spinner should be visible
        const spinner = container.querySelector('.euiLoadingSpinner');
        expect(spinner).toBeInTheDocument();

        unmount();
      });

      it('hides loading spinner after fetching completes', async () => {
        const mockGetIlmPolicy = jest
          .fn()
          .mockResolvedValue(createMockIlmPolicy({ hot: { actions: {} } }));
        const mockGetSimulatedTemplate = jest
          .fn()
          .mockResolvedValue(createSimulatedTemplateWithIlm('test-policy'));

        const template = createMockTemplate();
        const { container, findByText } = renderComponent(
          template,
          mockGetIlmPolicy,
          mockGetSimulatedTemplate
        );

        // Wait for phases to be displayed
        await findByText(/Hot/i);

        // Loading spinner should not be visible
        const spinner = container.querySelector('.euiLoadingSpinner');
        expect(spinner).not.toBeInTheDocument();
      });
    });

    describe('phase display', () => {
      it('displays ILM phases after successful fetch', async () => {
        const mockGetIlmPolicy = jest.fn().mockResolvedValue(
          createMockIlmPolicy({
            hot: { actions: {} },
            warm: { min_age: '7d', actions: {} },
            cold: { min_age: '30d', actions: {} },
          })
        );
        const mockGetSimulatedTemplate = jest
          .fn()
          .mockResolvedValue(createSimulatedTemplateWithIlm('test-policy'));

        const template = createMockTemplate();
        const { findByText } = renderComponent(
          template,
          mockGetIlmPolicy,
          mockGetSimulatedTemplate
        );

        await findByText(/Hot until 7d/i);
        await findByText(/Warm until 30d/i);
        await findByText(/Cold indefinitely/i);
      });

      it('displays single phase correctly', async () => {
        const mockGetIlmPolicy = jest.fn().mockResolvedValue(
          createMockIlmPolicy({
            hot: { actions: {} },
          })
        );
        const mockGetSimulatedTemplate = jest
          .fn()
          .mockResolvedValue(createSimulatedTemplateWithIlm('test-policy'));

        const template = createMockTemplate();
        const { findByText } = renderComponent(
          template,
          mockGetIlmPolicy,
          mockGetSimulatedTemplate
        );

        await findByText(/Hot indefinitely/i);
      });

      it('does not display phases when policy has no phases', async () => {
        const mockGetIlmPolicy = jest.fn().mockResolvedValue(createMockIlmPolicy({}));
        const mockGetSimulatedTemplate = jest
          .fn()
          .mockResolvedValue(createSimulatedTemplateWithIlm('test-policy'));

        const template = createMockTemplate();
        const { queryByText, container } = renderComponent(
          template,
          mockGetIlmPolicy,
          mockGetSimulatedTemplate
        );

        // Wait for loading to complete
        await waitFor(() => {
          expect(mockGetIlmPolicy).toHaveBeenCalled();
          expect(container.querySelector('.euiLoadingSpinner')).not.toBeInTheDocument();
        });

        expect(queryByText(/Hot/i)).not.toBeInTheDocument();
        expect(queryByText(/Warm/i)).not.toBeInTheDocument();
        expect(queryByText(/Cold/i)).not.toBeInTheDocument();
      });
    });

    describe('error handling', () => {
      it('shows error message when ILM policy fetch fails', async () => {
        const mockGetIlmPolicy = jest.fn().mockRejectedValue(new Error('Network error'));
        const mockGetSimulatedTemplate = jest
          .fn()
          .mockResolvedValue(createSimulatedTemplateWithIlm('test-policy'));

        const template = createMockTemplate();
        const { findByText } = renderComponent(
          template,
          mockGetIlmPolicy,
          mockGetSimulatedTemplate
        );

        await findByText(/There was an error while loading the ILM policy phases/i);
      });

      it('does not crash and displays policy name on error', async () => {
        const mockGetIlmPolicy = jest.fn().mockRejectedValue(new Error('Network error'));
        const mockGetSimulatedTemplate = jest
          .fn()
          .mockResolvedValue(createSimulatedTemplateWithIlm('test-policy'));

        const template = createMockTemplate();
        const { findByText, getByText } = renderComponent(
          template,
          mockGetIlmPolicy,
          mockGetSimulatedTemplate
        );

        await findByText(/There was an error while loading the ILM policy phases/i);

        // Policy name should still be visible
        expect(getByText('test-policy')).toBeInTheDocument();
        expect(getByText('ILM')).toBeInTheDocument();
      });
    });

    describe('AbortController handling', () => {
      it('passes abort signal to getIlmPolicy', async () => {
        let capturedSignal: AbortSignal | undefined;
        const mockGetIlmPolicy = jest.fn().mockImplementation((policyName, signal) => {
          capturedSignal = signal;
          return new Promise((resolve) => {
            setTimeout(() => resolve(createMockIlmPolicy({ hot: { actions: {} } })), 1000);
          });
        });
        const mockGetSimulatedTemplate = jest
          .fn()
          .mockResolvedValue(createSimulatedTemplateWithIlm('test-policy'));

        const template = createMockTemplate();
        const { unmount } = renderComponent(template, mockGetIlmPolicy, mockGetSimulatedTemplate);

        await waitFor(() => {
          expect(mockGetIlmPolicy).toHaveBeenCalled();
          expect(capturedSignal).toBeDefined();
          expect(capturedSignal).toBeInstanceOf(AbortSignal);
        });

        unmount();
      });

      it('aborts ILM policy fetch on unmount', async () => {
        let capturedSignal: AbortSignal | undefined;
        const mockGetIlmPolicy = jest.fn().mockImplementation((policyName, signal) => {
          capturedSignal = signal;
          return new Promise((resolve) => {
            setTimeout(() => resolve(createMockIlmPolicy({ hot: { actions: {} } })), 10000);
          });
        });
        const mockGetSimulatedTemplate = jest
          .fn()
          .mockResolvedValue(createSimulatedTemplateWithIlm('test-policy'));

        const template = createMockTemplate();
        const { unmount } = renderComponent(template, mockGetIlmPolicy, mockGetSimulatedTemplate);

        await waitFor(() => {
          expect(mockGetIlmPolicy).toHaveBeenCalled();
          expect(capturedSignal).toBeDefined();
        });

        unmount();

        expect(capturedSignal?.aborted).toBe(true);
      });
    });

    describe('policy changes', () => {
      it('fetches new policy when template changes', async () => {
        const mockGetIlmPolicy = jest
          .fn()
          .mockResolvedValue(createMockIlmPolicy({ hot: { actions: {} } }));
        const mockGetSimulatedTemplate = jest
          .fn()
          .mockResolvedValue(createSimulatedTemplateWithIlm('policy-1'));

        const template1 = createMockTemplate({ name: 'template-1' });
        const { rerender, container, findByText } = renderComponent(
          template1,
          mockGetIlmPolicy,
          mockGetSimulatedTemplate
        );

        // Wait for first fetch to complete
        await waitFor(() => {
          expect(mockGetIlmPolicy).toHaveBeenCalledWith('policy-1', expect.any(AbortSignal));
          expect(container.querySelector('.euiLoadingSpinner')).not.toBeInTheDocument();
        });

        mockGetIlmPolicy.mockClear();
        mockGetSimulatedTemplate.mockResolvedValue(createSimulatedTemplateWithIlm('policy-2'));

        // Change to a different template
        await act(async () => {
          const template2 = createMockTemplate({ name: 'template-2' });
          rerender(
            <IntlProvider>
              <ConfirmTemplateDetailsSection
                template={template2}
                getIlmPolicy={mockGetIlmPolicy}
                getSimulatedTemplate={mockGetSimulatedTemplate}
              />
            </IntlProvider>
          );
        });

        // Wait for second fetch to complete
        await waitFor(() => {
          expect(mockGetIlmPolicy).toHaveBeenCalledWith('policy-2', expect.any(AbortSignal));
          expect(container.querySelector('.euiLoadingSpinner')).not.toBeInTheDocument();
        });
        await findByText(/Hot/i);
      });

      it('aborts previous fetch when policy name changes', async () => {
        let firstSignal: AbortSignal | undefined;
        let secondSignal: AbortSignal | undefined;
        let ilmCallCount = 0;

        const mockGetIlmPolicy = jest.fn().mockImplementation((policyName, signal) => {
          ilmCallCount++;
          if (ilmCallCount === 1) {
            firstSignal = signal;
          } else {
            secondSignal = signal;
          }
          return new Promise((resolve) => {
            setTimeout(() => resolve(createMockIlmPolicy({ hot: { actions: {} } })), 10000);
          });
        });
        const mockGetSimulatedTemplate = jest
          .fn()
          .mockResolvedValue(createSimulatedTemplateWithIlm('policy-1'));

        const template1 = createMockTemplate({ name: 'template-1' });
        const { rerender, unmount } = renderComponent(
          template1,
          mockGetIlmPolicy,
          mockGetSimulatedTemplate
        );

        await waitFor(() => {
          expect(mockGetIlmPolicy).toHaveBeenCalledTimes(1);
          expect(firstSignal).toBeDefined();
        });

        mockGetSimulatedTemplate.mockResolvedValue(createSimulatedTemplateWithIlm('policy-2'));

        // Change to a different template
        const template2 = createMockTemplate({ name: 'template-2' });
        rerender(
          <IntlProvider>
            <ConfirmTemplateDetailsSection
              template={template2}
              getIlmPolicy={mockGetIlmPolicy}
              getSimulatedTemplate={mockGetSimulatedTemplate}
            />
          </IntlProvider>
        );

        await waitFor(() => {
          expect(mockGetIlmPolicy).toHaveBeenCalledTimes(2);
          expect(firstSignal?.aborted).toBe(true);
          expect(secondSignal).toBeDefined();
          expect(secondSignal?.aborted).toBe(false);
        });

        unmount();
      });

      it('clears policy data when simulated template changes to one without ILM', async () => {
        const mockGetIlmPolicy = jest.fn().mockResolvedValue(
          createMockIlmPolicy({
            hot: { actions: {} },
            warm: { min_age: '7d', actions: {} },
          })
        );
        const mockGetSimulatedTemplate = jest
          .fn()
          .mockResolvedValue(createSimulatedTemplateWithIlm('test-policy'));

        const template1 = createMockTemplate({ name: 'template-1' });
        const { rerender, findByText, queryByText } = renderComponent(
          template1,
          mockGetIlmPolicy,
          mockGetSimulatedTemplate
        );

        // Wait for phases to be displayed
        await findByText(/Hot until 7d/i);

        // Change simulated template to not have ILM
        mockGetSimulatedTemplate.mockResolvedValue(createMockSimulatedTemplate('standard'));

        // Change to template without ILM
        const template2 = createMockTemplate({
          name: 'template-2',
          lifecycle: { enabled: true, value: 30, unit: 'd' },
        });
        rerender(
          <IntlProvider>
            <ConfirmTemplateDetailsSection
              template={template2}
              getIlmPolicy={mockGetIlmPolicy}
              getSimulatedTemplate={mockGetSimulatedTemplate}
            />
          </IntlProvider>
        );

        await waitFor(() => {
          expect(queryByText(/Hot/i)).not.toBeInTheDocument();
          expect(queryByText('ILM')).not.toBeInTheDocument();
        });
      });
    });
  });

  describe('simulated template fetching', () => {
    it('calls getSimulatedTemplate with template name', async () => {
      const mockGetSimulatedTemplate = jest
        .fn()
        .mockResolvedValue(createMockSimulatedTemplate('standard'));

      const template = createMockTemplate({ name: 'my-template' });
      renderComponent(template, undefined, mockGetSimulatedTemplate);

      await waitFor(() => {
        expect(mockGetSimulatedTemplate).toHaveBeenCalledWith(
          'my-template',
          expect.any(AbortSignal)
        );
      });
    });

    it('shows error message when simulated template fetch fails', async () => {
      const mockGetSimulatedTemplate = jest.fn().mockRejectedValue(new Error('Network error'));

      const template = createMockTemplate();
      const { findByText, queryByText } = renderComponent(
        template,
        undefined,
        mockGetSimulatedTemplate
      );

      await findByText(/There was an error while loading index mode and data retention info/i);
      expect(queryByText('Index mode')).not.toBeInTheDocument();
    });

    it('shows loading state while fetching simulated template', async () => {
      const mockGetSimulatedTemplate = jest.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve(createMockSimulatedTemplate('standard')), 1000);
        });
      });

      const template = createMockTemplate();
      const { container, unmount, findByText } = renderComponent(
        template,
        undefined,
        mockGetSimulatedTemplate
      );

      // Loading state should show
      await findByText('Loading…');

      // Loading spinner should be visible
      const spinner = container.querySelector('.euiLoadingSpinner');
      expect(spinner).toBeInTheDocument();

      unmount();
    });

    it('aborts simulated template fetch on unmount', async () => {
      let capturedSignal: AbortSignal | undefined;
      const mockGetSimulatedTemplate = jest.fn().mockImplementation((templateName, signal) => {
        capturedSignal = signal;
        return new Promise((resolve) => {
          setTimeout(() => resolve(createMockSimulatedTemplate('standard')), 10000);
        });
      });

      const template = createMockTemplate();
      const { unmount } = renderComponent(template, undefined, mockGetSimulatedTemplate);

      await waitFor(() => {
        expect(mockGetSimulatedTemplate).toHaveBeenCalled();
        expect(capturedSignal).toBeDefined();
      });

      unmount();

      expect(capturedSignal?.aborted).toBe(true);
    });

    it('ignores a resolved result from an obsolete simulated template request', async () => {
      let resolveFirstRequest!: (value: ReturnType<typeof createMockSimulatedTemplate>) => void;
      const firstRequest = new Promise<ReturnType<typeof createMockSimulatedTemplate>>(
        (resolve) => {
          resolveFirstRequest = resolve;
        }
      );
      const mockGetSimulatedTemplate = jest
        .fn()
        .mockImplementationOnce(() => firstRequest)
        .mockResolvedValueOnce(createMockSimulatedTemplate('logsdb'));

      const { rerender, findByText, queryByText } = renderComponent(
        createMockTemplate({ name: 'template-1' }),
        undefined,
        mockGetSimulatedTemplate
      );
      await waitFor(() => expect(mockGetSimulatedTemplate).toHaveBeenCalledTimes(1));

      rerender(
        <IntlProvider>
          <ConfirmTemplateDetailsSection
            template={createMockTemplate({ name: 'template-2' })}
            getSimulatedTemplate={mockGetSimulatedTemplate}
          />
        </IntlProvider>
      );
      await findByText('LogsDB');

      await act(async () => {
        resolveFirstRequest(createMockSimulatedTemplate('lookup'));
      });

      await waitFor(() => {
        expect(queryByText('Lookup')).not.toBeInTheDocument();
        expect(queryByText('LogsDB')).toBeInTheDocument();
      });
    });

    it('ignores a rejected result from an obsolete simulated template request', async () => {
      let rejectFirstRequest!: (reason: Error) => void;
      const firstRequest = new Promise<ReturnType<typeof createMockSimulatedTemplate>>(
        (_, reject) => {
          rejectFirstRequest = reject;
        }
      );
      const mockGetSimulatedTemplate = jest
        .fn()
        .mockImplementationOnce(() => firstRequest)
        .mockResolvedValueOnce(createMockSimulatedTemplate('logsdb'));

      const { rerender, findByText, queryByText } = renderComponent(
        createMockTemplate({ name: 'template-1' }),
        undefined,
        mockGetSimulatedTemplate
      );
      await waitFor(() => expect(mockGetSimulatedTemplate).toHaveBeenCalledTimes(1));

      rerender(
        <IntlProvider>
          <ConfirmTemplateDetailsSection
            template={createMockTemplate({ name: 'template-2' })}
            getSimulatedTemplate={mockGetSimulatedTemplate}
          />
        </IntlProvider>
      );
      await findByText('LogsDB');

      await act(async () => {
        rejectFirstRequest(new Error('Obsolete request failed'));
      });

      await waitFor(() => {
        expect(
          queryByText(/There was an error while loading index mode and data retention info/i)
        ).not.toBeInTheDocument();
        expect(queryByText('LogsDB')).toBeInTheDocument();
      });
    });
  });

  describe('combined template details', () => {
    it('displays all template details together', async () => {
      const mockGetIlmPolicy = jest.fn().mockResolvedValue(
        createMockIlmPolicy({
          hot: { actions: {} },
          warm: { min_age: '7d', actions: {} },
        })
      );
      const mockGetSimulatedTemplate = jest
        .fn()
        .mockResolvedValue(createMockSimulatedTemplate('logsdb', 'comprehensive-policy'));

      const template = createMockTemplate({
        version: 3,
        composedOf: ['component-a', 'component-b', 'component-c'],
      });

      const { findByText } = renderComponent(template, mockGetIlmPolicy, mockGetSimulatedTemplate);

      // Wait for simulated template data to load first
      await findByText('Index mode');
      await findByText('LogsDB');

      // Version (available after loading completes)
      await findByText('Version');
      await findByText('3');

      // Retention
      await findByText('Retention');
      await findByText('comprehensive-policy');
      await findByText('ILM');

      // Phases
      await findByText(/Hot until 7d/i);
      await findByText(/Warm indefinitely/i);

      // Component templates
      await findByText('Component templates');
      await findByText('component-a');
      await findByText('component-b');
      await findByText('component-c');
    });

    it('displays minimal template details correctly', async () => {
      const mockGetSimulatedTemplate = jest
        .fn()
        .mockResolvedValue(createMockSimulatedTemplate('standard'));

      const template = createMockTemplate({
        version: undefined,
        lifecycle: undefined,
        composedOf: undefined,
      });

      const { queryByText, findByText } = renderComponent(
        template,
        undefined,
        mockGetSimulatedTemplate
      );

      // Wait for simulated template data - only index mode should be present
      await findByText('Index mode');
      await findByText('Standard');

      // These should not be present
      expect(queryByText('Version')).not.toBeInTheDocument();
      expect(queryByText('Retention')).not.toBeInTheDocument();
      expect(queryByText('Component templates')).not.toBeInTheDocument();
    });

    it('displays only version and component templates without getSimulatedTemplate', () => {
      const template = createMockTemplate({
        version: 5,
        composedOf: ['component-1'],
      });

      const { getByText, queryByText } = renderComponent(template);

      // Version and component templates should be present
      expect(getByText('Version')).toBeInTheDocument();
      expect(getByText('5')).toBeInTheDocument();
      expect(getByText('Component templates')).toBeInTheDocument();
      expect(getByText('component-1')).toBeInTheDocument();

      // Index mode and retention require simulated template
      expect(queryByText('Index mode')).not.toBeInTheDocument();
      expect(queryByText('Retention')).not.toBeInTheDocument();
    });
  });
});
