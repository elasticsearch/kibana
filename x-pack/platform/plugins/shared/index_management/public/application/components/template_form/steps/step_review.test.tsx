/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';

import type { TemplateDeserialized } from '../../../../../common';
import { LOOKUP_INDEX_MODE, STANDARD_INDEX_MODE } from '../../../../../common/constants';
import { Forms } from '../../../../shared_imports';
import type { WizardContent, WizardSection } from '../template_form';
import { StepReview } from './step_review';
import { StepReviewContainer } from './step_review_container';
import { useAppContext } from '../../../app_context';
import { simulateIndexTemplate } from '../../../services';

jest.mock('../../../app_context', () => ({
  useAppContext: jest.fn(),
}));

jest.mock('../../../services', () => ({
  simulateIndexTemplate: jest.fn(),
}));

const mockUseAppContext = useAppContext as jest.MockedFunction<typeof useAppContext>;
const mockSimulateIndexTemplate = jest.mocked(simulateIndexTemplate);
type SimulationResponse = Awaited<ReturnType<typeof simulateIndexTemplate>>;

const mockSimulateTemplatePropsSpy = jest.fn();
jest.mock('../../index_templates', () => ({
  __esModule: true,
  SimulateTemplate: (props: unknown) => {
    mockSimulateTemplatePropsSpy(props);
    return <div data-test-subj="mockSimulateTemplate" />;
  },
}));

describe('StepReview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSimulateTemplatePropsSpy.mockClear();
    mockUseAppContext.mockReturnValue({
      config: { isServerless: false },
    } as ReturnType<typeof useAppContext>);
    mockSimulateIndexTemplate.mockResolvedValue({ data: null, error: null });
  });

  const makeTemplate = (overrides: Partial<TemplateDeserialized> = {}): TemplateDeserialized => ({
    name: 'my_template',
    indexPatterns: ['index-*'],
    indexMode: 'standard',
    template: {
      settings: { index: { number_of_shards: 1 } },
      mappings: { properties: { field_1: { type: 'keyword' } } },
      aliases: { my_alias: { is_write_index: true } },
    },
    composedOf: [],
    ignoreMissingComponentTemplates: [],
    allowAutoCreate: 'NO_OVERWRITE',
    _kbnMeta: { type: 'default', hasDatastream: false, isLegacy: false },
    ...overrides,
  });

  const ReviewWizard = ({
    template,
    onSave,
  }: {
    template: TemplateDeserialized;
    onSave: jest.Mock;
  }) => {
    const { FormWizard, FormWizardStep } = Forms;
    const [isSaveBlocked, setIsSaveBlocked] = React.useState(false);

    return (
      <FormWizard<WizardContent, WizardSection>
        defaultActiveStep={1}
        defaultValue={{ logistics: template, components: template.composedOf }}
        onSave={onSave}
        isNextButtonDisabled={isSaveBlocked}
        apiError={null}
      >
        <FormWizardStep id="logistics" label="Logistics">
          <div data-test-subj="previousStep" />
        </FormWizardStep>
        <FormWizardStep id="review" label="Review template">
          <StepReviewContainer
            getTemplateData={() => ({ ...template })}
            onSaveBlockedChange={setIsSaveBlocked}
          />
        </FormWizardStep>
      </FormWizard>
    );
  };

  const renderReviewWizard = (template: TemplateDeserialized) => {
    const onSave = jest.fn();

    render(
      <I18nProvider>
        <ReviewWizard template={template} onSave={onSave} />
      </I18nProvider>
    );

    return { onSave };
  };

  describe('WHEN reviewing a composable template', () => {
    it('SHOULD render Summary, Preview, and Request tabs', () => {
      render(
        <I18nProvider>
          <StepReview template={makeTemplate()} navigateToStep={jest.fn()} />
        </I18nProvider>
      );

      // EuiTabbedContent renders tab buttons; the preview tab exists for non-legacy.
      expect(screen.getByText('Summary')).toBeInTheDocument();
      expect(screen.getByText('Preview')).toBeInTheDocument();
      expect(screen.getByText('Request')).toBeInTheDocument();
    });
  });

  describe('WHEN reviewing a legacy template', () => {
    it('SHOULD not render the Preview tab', () => {
      render(
        <I18nProvider>
          <StepReview
            template={makeTemplate({
              _kbnMeta: { type: 'default', hasDatastream: false, isLegacy: true },
            })}
            navigateToStep={jest.fn()}
          />
        </I18nProvider>
      );

      expect(screen.getByText('Summary')).toBeInTheDocument();
      expect(screen.queryByText('Preview')).not.toBeInTheDocument();
      expect(screen.getByText('Request')).toBeInTheDocument();
    });
  });

  describe('WHEN index patterns contain a wildcard', () => {
    it('SHOULD show a warning and wire the edit link', () => {
      const navigateToStep = jest.fn();
      render(
        <I18nProvider>
          <StepReview
            template={makeTemplate({ indexPatterns: ['*'] })}
            navigateToStep={navigateToStep}
          />
        </I18nProvider>
      );

      expect(screen.getByTestId('indexPatternsWarning')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Edit index patterns.'));
      expect(navigateToStep).toHaveBeenCalledWith('logistics', expect.any(Object));
    });
  });

  describe('WHEN lifecycle is configured', () => {
    it('SHOULD render hot-only infinite lifecycle in the summary', () => {
      render(
        <I18nProvider>
          <StepReview
            template={makeTemplate({
              template: {
                settings: { index: { number_of_shards: 1 } },
                mappings: { properties: { field_1: { type: 'keyword' } } },
                aliases: { my_alias: { is_write_index: true } },
                lifecycle: { enabled: true },
              },
            })}
            navigateToStep={jest.fn()}
          />
        </I18nProvider>
      );

      expect(screen.getByTestId('lifecycleValue')).toHaveTextContent('∞ · 1 data phase');
    });

    it('SHOULD render tiers layout with phase count on stateful', () => {
      render(
        <I18nProvider>
          <StepReview
            template={makeTemplate({
              template: {
                settings: { index: { number_of_shards: 1 } },
                mappings: { properties: { field_1: { type: 'keyword' } } },
                aliases: { my_alias: { is_write_index: true } },
                lifecycle: { enabled: true, frozen_after: '30d' },
              },
            })}
            navigateToStep={jest.fn()}
          />
        </I18nProvider>
      );

      expect(screen.getByTestId('lifecycleValue')).toHaveTextContent('∞ · 2 data phases');
    });
  });

  describe('WHEN the index mode is lookup', () => {
    const renderReview = (template: TemplateDeserialized) =>
      render(
        <I18nProvider>
          <StepReview template={template} navigateToStep={jest.fn()} />
        </I18nProvider>
      );

    it('SHOULD warn when the template has a data lifecycle', () => {
      renderReview(
        makeTemplate({
          indexMode: LOOKUP_INDEX_MODE,
          _kbnMeta: { type: 'default', hasDatastream: true, isLegacy: false },
          template: { lifecycle: { enabled: true, data_retention: '30d' } },
        })
      );

      expect(screen.getByTestId('lookupLifecycleWarning')).toBeInTheDocument();
      expect(screen.getByTestId('lifecycleValue')).toBeInTheDocument();
    });

    it('SHOULD warn when the template has infinite data retention', () => {
      renderReview(
        makeTemplate({
          indexMode: LOOKUP_INDEX_MODE,
          _kbnMeta: { type: 'default', hasDatastream: true, isLegacy: false },
          template: { lifecycle: { enabled: true } },
        })
      );

      expect(screen.getByTestId('lookupLifecycleWarning')).toBeInTheDocument();
    });

    it('SHOULD warn when lookup mode and the lifecycle policy are nested settings', () => {
      renderReview(
        makeTemplate({
          indexMode: undefined,
          template: {
            settings: {
              index: { mode: LOOKUP_INDEX_MODE, lifecycle: { name: 'my-policy' } },
            },
          },
        })
      );

      expect(screen.getByTestId('lookupLifecycleWarning')).toBeInTheDocument();
    });

    it('SHOULD warn when lookup mode and the lifecycle policy are flat settings', () => {
      renderReview(
        makeTemplate({
          indexMode: undefined,
          template: {
            settings: {
              'index.mode': LOOKUP_INDEX_MODE,
              'index.lifecycle.name': 'my-policy',
            },
          },
        })
      );

      expect(screen.getByTestId('lookupLifecycleWarning')).toBeInTheDocument();
    });

    it('SHOULD use nested mode when flat mode conflicts', () => {
      renderReview(
        makeTemplate({
          indexMode: undefined,
          template: {
            settings: {
              index: { mode: LOOKUP_INDEX_MODE, lifecycle: { name: 'my-policy' } },
              'index.mode': STANDARD_INDEX_MODE,
            },
          },
        })
      );

      expect(screen.getByTestId('lookupLifecycleWarning')).toBeInTheDocument();
    });

    it('SHOULD use flat mode when unprefixed mode conflicts', () => {
      renderReview(
        makeTemplate({
          indexMode: undefined,
          template: {
            settings: {
              'index.mode': LOOKUP_INDEX_MODE,
              mode: STANDARD_INDEX_MODE,
              'index.lifecycle.name': 'my-policy',
            },
          },
        })
      );

      expect(screen.getByTestId('lookupLifecycleWarning')).toBeInTheDocument();
    });

    it('SHOULD warn when component templates resolve to lookup mode with a lifecycle policy', async () => {
      mockSimulateIndexTemplate.mockResolvedValue({
        data: {
          template: {
            aliases: {},
            mappings: {},
            settings: {
              index: { mode: LOOKUP_INDEX_MODE, lifecycle: { name: 'my-policy' } },
            },
          },
        },
        error: null,
      });

      renderReview(
        makeTemplate({
          indexMode: undefined,
          composedOf: ['lookup-component'],
          template: {
            settings: { index: { number_of_shards: 1 } },
            lifecycle: { enabled: true, data_retention: '30d' },
          },
        })
      );

      await waitFor(() =>
        expect(mockSimulateIndexTemplate).toHaveBeenCalledWith({
          template: expect.objectContaining({
            composed_of: ['lookup-component'],
            template: expect.objectContaining({
              settings: { index: { number_of_shards: 1 } },
              lifecycle: { enabled: true, data_retention: '30d' },
            }),
          }),
        })
      );
      expect(await screen.findByTestId('lookupLifecycleWarning')).toBeInTheDocument();
    });

    it('SHOULD warn when component templates resolve to lookup mode with data stream lifecycle', async () => {
      mockSimulateIndexTemplate.mockResolvedValue({
        data: {
          template: {
            aliases: {},
            lifecycle: { enabled: true },
            mappings: {},
            settings: { index: { mode: LOOKUP_INDEX_MODE } },
          },
        },
        error: null,
      });

      renderReview(
        makeTemplate({
          indexMode: undefined,
          composedOf: ['lookup-component'],
        })
      );

      expect(await screen.findByTestId('lookupLifecycleWarning')).toBeInTheDocument();
    });

    it('SHOULD not warn when inherited data stream lifecycle is disabled', async () => {
      let resolveSimulation: (response: SimulationResponse) => void = () => {};
      const simulation = new Promise<SimulationResponse>((resolve) => {
        resolveSimulation = resolve;
      });
      mockSimulateIndexTemplate.mockReturnValueOnce(simulation);

      renderReview(
        makeTemplate({
          indexMode: undefined,
          composedOf: ['lookup-component'],
        })
      );

      await act(async () => {
        resolveSimulation({
          data: {
            template: {
              lifecycle: { enabled: false },
              settings: { index: { mode: LOOKUP_INDEX_MODE } },
            },
          },
          error: null,
        });
        await simulation;
      });

      expect(screen.queryByTestId('lookupLifecycleWarning')).not.toBeInTheDocument();
    });

    it('SHOULD clear a stale component-template warning while simulating updated settings', async () => {
      mockSimulateIndexTemplate
        .mockResolvedValueOnce({
          data: {
            template: {
              aliases: {},
              mappings: {},
              settings: {
                index: { mode: LOOKUP_INDEX_MODE, lifecycle: { name: 'my-policy' } },
              },
            },
          },
          error: null,
        })
        .mockReturnValueOnce(new Promise<never>(() => {}));

      const { rerender } = renderReview(
        makeTemplate({
          indexMode: undefined,
          composedOf: ['lookup-component'],
        })
      );
      expect(await screen.findByTestId('lookupLifecycleWarning')).toBeInTheDocument();

      rerender(
        <I18nProvider>
          <StepReview
            template={makeTemplate({
              indexMode: STANDARD_INDEX_MODE,
              composedOf: ['standard-component'],
            })}
            navigateToStep={jest.fn()}
          />
        </I18nProvider>
      );

      await waitFor(() =>
        expect(screen.queryByTestId('lookupLifecycleWarning')).not.toBeInTheDocument()
      );
    });

    it('SHOULD clear a component-template warning when all components are removed', async () => {
      mockSimulateIndexTemplate.mockResolvedValueOnce({
        data: {
          template: {
            settings: {
              index: { mode: LOOKUP_INDEX_MODE, lifecycle: { name: 'my-policy' } },
            },
          },
        },
        error: null,
      });

      const { rerender } = renderReview(
        makeTemplate({
          indexMode: undefined,
          composedOf: ['lookup-component'],
        })
      );
      expect(await screen.findByTestId('lookupLifecycleWarning')).toBeInTheDocument();

      rerender(
        <I18nProvider>
          <StepReview
            template={makeTemplate({
              indexMode: STANDARD_INDEX_MODE,
              composedOf: [],
            })}
            navigateToStep={jest.fn()}
          />
        </I18nProvider>
      );

      await waitFor(() =>
        expect(screen.queryByTestId('lookupLifecycleWarning')).not.toBeInTheDocument()
      );
    });

    it('SHOULD ignore an obsolete component-template simulation result', async () => {
      let resolveObsoleteSimulation: (response: SimulationResponse) => void = () => {};
      const obsoleteSimulation = new Promise<SimulationResponse>((resolve) => {
        resolveObsoleteSimulation = resolve;
      });
      mockSimulateIndexTemplate
        .mockReturnValueOnce(obsoleteSimulation)
        .mockResolvedValueOnce({ data: { template: { settings: {} } }, error: null });

      const { rerender } = renderReview(
        makeTemplate({
          indexMode: undefined,
          composedOf: ['lookup-component'],
        })
      );

      rerender(
        <I18nProvider>
          <StepReview
            template={makeTemplate({
              indexMode: STANDARD_INDEX_MODE,
              composedOf: ['standard-component'],
            })}
            navigateToStep={jest.fn()}
          />
        </I18nProvider>
      );
      await waitFor(() => expect(mockSimulateIndexTemplate).toHaveBeenCalledTimes(2));

      await act(async () => {
        resolveObsoleteSimulation({
          data: {
            template: {
              settings: {
                index: { mode: LOOKUP_INDEX_MODE, lifecycle: { name: 'my-policy' } },
              },
            },
          },
          error: null,
        });
        await obsoleteSimulation;
      });

      expect(screen.queryByTestId('lookupLifecycleWarning')).not.toBeInTheDocument();
    });

    it('SHOULD warn when the settings set a nested index.lifecycle.name', () => {
      renderReview(
        makeTemplate({
          indexMode: LOOKUP_INDEX_MODE,
          template: { settings: { index: { lifecycle: { name: 'my-policy' } } } },
        })
      );

      expect(screen.getByTestId('lookupLifecycleWarning')).toBeInTheDocument();
    });

    it('SHOULD warn when the settings set a flat index.lifecycle.name', () => {
      renderReview(
        makeTemplate({
          indexMode: LOOKUP_INDEX_MODE,
          template: { settings: { 'index.lifecycle.name': 'my-policy' } },
        })
      );

      expect(screen.getByTestId('lookupLifecycleWarning')).toBeInTheDocument();
    });

    it('SHOULD warn when index.lifecycle.name omits the optional index prefix', () => {
      renderReview(
        makeTemplate({
          indexMode: LOOKUP_INDEX_MODE,
          template: { settings: { lifecycle: { name: 'my-policy' } } },
        })
      );

      expect(screen.getByTestId('lookupLifecycleWarning')).toBeInTheDocument();
    });

    it('SHOULD warn when lookup mode and lifecycle omit the optional index prefix', () => {
      renderReview(
        makeTemplate({
          indexMode: undefined,
          template: {
            settings: {
              mode: LOOKUP_INDEX_MODE,
              lifecycle: { name: 'my-policy' },
            },
          },
        })
      );

      expect(screen.getByTestId('lookupLifecycleWarning')).toBeInTheDocument();
    });

    it('SHOULD warn when unprefixed lookup settings use a dotted lifecycle name', () => {
      renderReview(
        makeTemplate({
          indexMode: undefined,
          template: {
            settings: {
              mode: LOOKUP_INDEX_MODE,
              'lifecycle.name': 'my-policy',
            },
          },
        })
      );

      expect(screen.getByTestId('lookupLifecycleWarning')).toBeInTheDocument();
    });

    it('SHOULD NOT warn when the template has no lifecycle settings', () => {
      renderReview(makeTemplate({ indexMode: LOOKUP_INDEX_MODE }));

      expect(screen.queryByTestId('lookupLifecycleWarning')).not.toBeInTheDocument();
    });
  });

  describe('WHEN the index mode is standard', () => {
    it('SHOULD NOT warn about the data lifecycle', () => {
      render(
        <I18nProvider>
          <StepReview
            template={makeTemplate({
              indexMode: STANDARD_INDEX_MODE,
              _kbnMeta: { type: 'default', hasDatastream: true, isLegacy: false },
              template: { lifecycle: { enabled: true, data_retention: '30d' } },
            })}
            navigateToStep={jest.fn()}
          />
        </I18nProvider>
      );

      expect(screen.queryByTestId('lookupLifecycleWarning')).not.toBeInTheDocument();
      expect(screen.getByTestId('lifecycleValue')).toBeInTheDocument();
    });

    it('SHOULD prefer the Logistics mode over a conflicting settings mode', () => {
      render(
        <I18nProvider>
          <StepReview
            template={makeTemplate({
              indexMode: STANDARD_INDEX_MODE,
              template: {
                settings: {
                  index: { mode: LOOKUP_INDEX_MODE, lifecycle: { name: 'my-policy' } },
                },
              },
            })}
            navigateToStep={jest.fn()}
          />
        </I18nProvider>
      );

      expect(screen.queryByTestId('lookupLifecycleWarning')).not.toBeInTheDocument();
    });

    it.each([
      [
        'flat',
        {
          'index.mode': LOOKUP_INDEX_MODE,
          'index.lifecycle.name': 'my-policy',
        },
      ],
      [
        'unprefixed',
        {
          mode: LOOKUP_INDEX_MODE,
          lifecycle: { name: 'my-policy' },
        },
      ],
    ])('SHOULD prefer the Logistics mode over conflicting %s settings', (_, settings) => {
      render(
        <I18nProvider>
          <StepReview
            template={makeTemplate({
              indexMode: STANDARD_INDEX_MODE,
              template: { settings },
            })}
            navigateToStep={jest.fn()}
          />
        </I18nProvider>
      );

      expect(screen.queryByTestId('lookupLifecycleWarning')).not.toBeInTheDocument();
    });
  });

  describe('WHEN component template simulation controls review validity', () => {
    it('SHOULD keep review saveable when there are no component templates', async () => {
      const { onSave } = renderReviewWizard(makeTemplate());

      await screen.findByTestId('stepSummary');
      await waitFor(() => expect(screen.getByTestId('nextButton')).toBeEnabled());
      expect(mockSimulateIndexTemplate).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('nextButton'));
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    });

    it('SHOULD prevent saving until the simulation succeeds', async () => {
      let resolveSimulation: (response: SimulationResponse) => void = () => {};
      const simulation = new Promise<SimulationResponse>((resolve) => {
        resolveSimulation = resolve;
      });
      mockSimulateIndexTemplate.mockReturnValueOnce(simulation);

      const { onSave } = renderReviewWizard(
        makeTemplate({
          indexMode: undefined,
          composedOf: ['lookup-component'],
        })
      );

      await screen.findByTestId('stepSummary');
      expect(screen.getByTestId('nextButton')).toBeDisabled();
      expect(screen.getByTestId('backButton')).toBeEnabled();
      expect(screen.getByTestId('simulateIndexTemplateLoading')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('nextButton'));
      expect(onSave).not.toHaveBeenCalled();

      await act(async () => {
        resolveSimulation({ data: { template: { settings: {} } }, error: null });
        await simulation;
      });

      await waitFor(() => expect(screen.getByTestId('nextButton')).toBeEnabled());
      expect(mockSimulateIndexTemplate).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('simulateIndexTemplateLoading')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('nextButton'));
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    });

    it('SHOULD allow returning to previous steps while simulation is pending', async () => {
      mockSimulateIndexTemplate.mockReturnValueOnce(new Promise<SimulationResponse>(() => {}));

      const { onSave } = renderReviewWizard(
        makeTemplate({
          indexMode: undefined,
          composedOf: ['lookup-component'],
        })
      );

      await screen.findByTestId('stepSummary');
      expect(screen.getByTestId('nextButton')).toBeDisabled();
      expect(screen.getByTestId('backButton')).toBeEnabled();

      fireEvent.click(screen.getByTestId('backButton'));

      expect(await screen.findByTestId('previousStep')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId('nextButton')).toBeEnabled());
      expect(onSave).not.toHaveBeenCalled();
    });

    it.each([
      ['explicit', { data: null, error: { error: 'simulation failed' } }],
      ['bodyless', { data: null, error: null }],
    ])(
      'SHOULD keep saving enabled and allow retrying a %s failed simulation',
      async (_, failedResponse) => {
        mockSimulateIndexTemplate
          .mockResolvedValueOnce(failedResponse)
          .mockResolvedValueOnce({ data: { template: { settings: {} } }, error: null });

        const { onSave } = renderReviewWizard(
          makeTemplate({
            indexMode: undefined,
            composedOf: ['lookup-component'],
          })
        );

        // A failed advisory check must not dead-end the wizard: Save stays available.
        expect(await screen.findByTestId('simulateIndexTemplateError')).toBeInTheDocument();
        expect(screen.getByTestId('nextButton')).toBeEnabled();
        expect(screen.getByTestId('backButton')).toBeEnabled();

        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

        await waitFor(() => expect(mockSimulateIndexTemplate).toHaveBeenCalledTimes(2));
        await waitFor(() =>
          expect(screen.queryByTestId('simulateIndexTemplateError')).not.toBeInTheDocument()
        );
        expect(screen.getByTestId('nextButton')).toBeEnabled();
        expect(onSave).not.toHaveBeenCalled();
      }
    );
  });

  describe('WHEN the Preview tab is clicked', () => {
    it('SHOULD render the SimulateTemplate component', () => {
      render(
        <I18nProvider>
          <StepReview template={makeTemplate()} navigateToStep={jest.fn()} />
        </I18nProvider>
      );

      fireEvent.click(screen.getByText('Preview'));
      expect(screen.getByTestId('mockSimulateTemplate')).toBeInTheDocument();
    });
  });
});
