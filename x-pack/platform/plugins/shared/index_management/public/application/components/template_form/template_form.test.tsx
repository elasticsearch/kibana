/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';

import type { TemplateDeserialized } from '../../../../common';
import { Forms, GlobalFlyout } from '../../../shared_imports';
import type { WizardContent } from './template_form';
import { TemplateForm } from './template_form';

jest.mock('@kbn/code-editor');

jest.mock('../../services/documentation', () => ({
  documentationService: {
    getEsDocsBase: () => 'https://es-docs',
    getTemplatesDocumentationLink: () => 'https://es-docs/templates',
    getDataStreamsDocumentationLink: () => 'https://es-docs/data-streams',
  },
}));

/**
 * Lightweight step mocks that interact with the wizard's Forms.useContent() hook
 * to feed data into the pipeline, without rendering real form components.
 */

const MockStepLogistics = ({
  isEditing,
  logisticsData,
}: {
  isEditing?: boolean;
  isLegacy?: boolean;
  logisticsData: WizardContent['logistics'];
}) => {
  const { updateContent } = Forms.useContent<WizardContent, 'logistics'>('logistics');

  useEffect(() => {
    updateContent({
      isValid: true,
      validate: async () => true,
      getData: () => logisticsData,
    });
  }, [updateContent, logisticsData]);

  return (
    <div data-test-subj="mockStepLogistics">
      <div data-test-subj="mockIsEditing">{String(Boolean(isEditing))}</div>
    </div>
  );
};

const MockStepComponents = ({
  componentsData,
}: {
  componentsData: WizardContent['components'];
}) => {
  const { updateContent } = Forms.useContent<WizardContent, 'components'>('components');

  useEffect(() => {
    updateContent({
      isValid: true,
      validate: async () => true,
      getData: () => componentsData,
    });
  }, [updateContent, componentsData]);

  return <div data-test-subj="mockStepComponents" />;
};

const MockStepSettings = ({ settingsData }: { settingsData: WizardContent['settings'] }) => {
  const { updateContent } = Forms.useContent<WizardContent, 'settings'>('settings');

  useEffect(() => {
    updateContent({
      isValid: true,
      validate: async () => true,
      getData: () => settingsData,
    });
  }, [updateContent, settingsData]);

  return <div data-test-subj="mockStepSettings" />;
};

const MockStepMappings = ({ mappingsData }: { mappingsData: WizardContent['mappings'] }) => {
  const { updateContent } = Forms.useContent<WizardContent, 'mappings'>('mappings');

  useEffect(() => {
    updateContent({
      isValid: true,
      validate: async () => true,
      getData: () => mappingsData,
    });
  }, [updateContent, mappingsData]);

  return <div data-test-subj="mockStepMappings" />;
};

const MockStepAliases = ({ aliasesData }: { aliasesData: WizardContent['aliases'] }) => {
  const { updateContent } = Forms.useContent<WizardContent, 'aliases'>('aliases');

  useEffect(() => {
    updateContent({
      isValid: true,
      validate: async () => true,
      getData: () => aliasesData,
    });
  }, [updateContent, aliasesData]);

  return <div data-test-subj="mockStepAliases" />;
};

const MockStepReview = () => {
  return <div data-test-subj="mockStepReview" />;
};

/**
 * The mock step data that each step will contribute when navigated to.
 * We store these in module scope so `jest.mock` factory functions can reference them.
 */
let mockLogisticsData: WizardContent['logistics'];
let mockComponentsData: WizardContent['components'];
let mockSettingsData: WizardContent['settings'];
let mockMappingsData: WizardContent['mappings'];
let mockAliasesData: WizardContent['aliases'];
let mockIsEditing: boolean | undefined;

jest.mock('./steps', () => ({
  StepLogisticsContainer: (props: { isEditing?: boolean; isLegacy?: boolean }) => (
    <MockStepLogistics
      isEditing={props.isEditing ?? mockIsEditing}
      isLegacy={props.isLegacy}
      logisticsData={mockLogisticsData}
    />
  ),
  StepComponentContainer: () => <MockStepComponents componentsData={mockComponentsData} />,
  StepReviewContainer: () => <MockStepReview />,
}));

jest.mock('../shared', () => ({
  StepSettingsContainer: () => <MockStepSettings settingsData={mockSettingsData} />,
  StepMappingsContainer: () => <MockStepMappings mappingsData={mockMappingsData} />,
  StepAliasesContainer: () => <MockStepAliases aliasesData={mockAliasesData} />,
}));

jest.mock('../index_templates', () => ({
  SimulateTemplateFlyoutContent: () => <div />,
  simulateTemplateFlyoutProps: {},
  LegacyIndexTemplatesDeprecation: () => null,
}));

const { GlobalFlyoutProvider } = GlobalFlyout;

const renderTemplateForm = (props: Partial<React.ComponentProps<typeof TemplateForm>> = {}) => {
  const defaultProps: React.ComponentProps<typeof TemplateForm> = {
    title: props.title ?? 'Test Form',
    onSave: props.onSave ?? jest.fn(),
    clearSaveError: props.clearSaveError ?? jest.fn(),
    isSaving: props.isSaving ?? false,
    saveError: props.saveError ?? null,
    isEditing: props.isEditing,
    isLegacy: props.isLegacy,
    defaultValue: props.defaultValue,
  };

  return render(
    <I18nProvider>
      <GlobalFlyoutProvider>
        <TemplateForm {...defaultProps} />
      </GlobalFlyoutProvider>
    </I18nProvider>
  );
};

const clickNextButton = () => {
  fireEvent.click(screen.getByTestId('nextButton'));
};

describe('TemplateForm wizard integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsEditing = undefined;
  });

  describe('WHEN creating a new template', () => {
    const settings = { index: { number_of_shards: 2 } };
    const mappings = { properties: { field_1: { type: 'text' } } };
    const aliases = { my_alias: { is_write_index: true } };

    beforeEach(() => {
      mockLogisticsData = {
        name: 'new_template',
        indexPatterns: ['index-*'],
        dataStream: {},
        indexMode: 'standard',
        allowAutoCreate: 'NO_OVERWRITE',
      };
      mockComponentsData = ['component_1'];
      mockSettingsData = settings;
      mockMappingsData = mappings;
      mockAliasesData = aliases;
    });

    it('SHOULD assemble correct payload through the full wizard flow', async () => {
      const onSave = jest.fn();
      renderTemplateForm({ onSave });

      // Step 1: Logistics
      expect(screen.getByTestId('mockStepLogistics')).toBeInTheDocument();
      clickNextButton();

      // Step 2: Component templates
      await screen.findByTestId('mockStepComponents');
      clickNextButton();

      // Step 3: Settings
      await screen.findByTestId('mockStepSettings');
      clickNextButton();

      // Step 4: Mappings
      await screen.findByTestId('mockStepMappings');
      clickNextButton();

      // Step 5: Aliases
      await screen.findByTestId('mockStepAliases');
      clickNextButton();

      // Step 6: Review → submit
      await screen.findByTestId('mockStepReview');
      clickNextButton();

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledTimes(1);
      });

      const savedTemplate = onSave.mock.calls[0][0] as TemplateDeserialized;
      expect(savedTemplate.name).toBe('new_template');
      expect(savedTemplate.indexPatterns).toEqual(['index-*']);
      expect(savedTemplate.indexMode).toBe('standard');
      expect(savedTemplate.allowAutoCreate).toBe('NO_OVERWRITE');
      expect(savedTemplate.composedOf).toEqual(['component_1']);
      expect(savedTemplate._kbnMeta).toEqual({
        type: 'default',
        hasDatastream: false,
        isLegacy: false,
      });
      expect(savedTemplate.template).toEqual({
        settings,
        mappings,
        aliases,
        lifecycle: { enabled: true },
      });
    });
  });

  describe('WHEN editing an existing template', () => {
    const existingTemplate: TemplateDeserialized = {
      name: 'existing_template',
      indexPatterns: ['logs-*'],
      priority: 5,
      version: 2,
      allowAutoCreate: 'TRUE',
      indexMode: 'standard',
      dataStream: {
        hidden: true,
        anyUnknownKey: 'should_be_kept',
      },
      template: {
        settings: { index: { number_of_shards: 1 } },
        mappings: { properties: { old_field: { type: 'keyword' } } },
        aliases: { existing_alias: {} },
      },
      composedOf: ['existing_component'],
      ignoreMissingComponentTemplates: ['missing_component'],
      _kbnMeta: {
        type: 'default',
        hasDatastream: true,
        isLegacy: false,
      },
    };

    beforeEach(() => {
      mockIsEditing = true;
      mockLogisticsData = {
        name: 'existing_template',
        indexPatterns: ['logs-*', 'metrics-*'],
        priority: 10,
        version: 3,
        allowAutoCreate: 'TRUE',
        indexMode: 'standard',
        dataStream: {
          hidden: true,
          anyUnknownKey: 'should_be_kept',
        },
      };
      mockComponentsData = ['existing_component', 'new_component'];
      mockSettingsData = { index: { number_of_shards: 3 } };
      mockMappingsData = {
        properties: {
          old_field: { type: 'keyword' },
          new_field: { type: 'text' },
        },
      };
      mockAliasesData = { updated_alias: { is_write_index: true } };
    });

    it('SHOULD preserve _kbnMeta and ignoreMissingComponentTemplates from initial template', async () => {
      const onSave = jest.fn();
      renderTemplateForm({
        onSave,
        isEditing: true,
        defaultValue: existingTemplate,
        title: `Edit template '${existingTemplate.name}'`,
      });

      expect(screen.getByTestId('mockStepLogistics')).toBeInTheDocument();
      clickNextButton();
      await screen.findByTestId('mockStepComponents');
      clickNextButton();
      await screen.findByTestId('mockStepSettings');
      clickNextButton();
      await screen.findByTestId('mockStepMappings');
      clickNextButton();
      await screen.findByTestId('mockStepAliases');
      clickNextButton();
      await screen.findByTestId('mockStepReview');
      clickNextButton();

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledTimes(1);
      });

      const savedTemplate = onSave.mock.calls[0][0] as TemplateDeserialized;

      // _kbnMeta comes from initialTemplate, not wizard data
      expect(savedTemplate._kbnMeta).toEqual(existingTemplate._kbnMeta);
      // ignoreMissingComponentTemplates comes from initialTemplate
      expect(savedTemplate.ignoreMissingComponentTemplates).toEqual(
        existingTemplate.ignoreMissingComponentTemplates
      );
      // Updated values from wizard
      expect(savedTemplate.indexPatterns).toEqual(['logs-*', 'metrics-*']);
      expect(savedTemplate.priority).toBe(10);
      expect(savedTemplate.version).toBe(3);
      expect(savedTemplate.composedOf).toEqual(['existing_component', 'new_component']);
      expect(savedTemplate.template).toEqual({
        settings: { index: { number_of_shards: 3 } },
        mappings: {
          properties: {
            old_field: { type: 'keyword' },
            new_field: { type: 'text' },
          },
        },
        aliases: { updated_alias: { is_write_index: true } },
        lifecycle: { enabled: true },
      });
      // dataStream is preserved from logistics
      expect(savedTemplate.dataStream).toEqual({
        hidden: true,
        anyUnknownKey: 'should_be_kept',
      });
    });
  });

  describe('WHEN cloning a template', () => {
    const originalTemplate: TemplateDeserialized = {
      name: 'original-copy',
      indexPatterns: ['index-1', 'index-2'],
      priority: 3,
      version: 1,
      allowAutoCreate: 'NO_OVERWRITE',
      indexMode: 'standard',
      dataStream: {},
      template: {
        settings: { index: { number_of_shards: 1 } },
        mappings: { properties: { field_1: { type: 'keyword' } } },
        aliases: { my_alias: { is_write_index: true } },
      },
      composedOf: ['component_1'],
      ignoreMissingComponentTemplates: [],
      _kbnMeta: {
        type: 'default',
        hasDatastream: false,
        isLegacy: false,
      },
    };

    beforeEach(() => {
      // Clone flow: all wizard data matches the original
      const { _kbnMeta: _, template: __, ...logistics } = originalTemplate;
      mockLogisticsData = logistics;
      mockComponentsData = originalTemplate.composedOf;
      mockSettingsData = originalTemplate.template?.settings;
      mockMappingsData = originalTemplate.template?.mappings;
      mockAliasesData = originalTemplate.template?.aliases;
    });

    it('SHOULD produce a payload matching the original template shape', async () => {
      const onSave = jest.fn();
      renderTemplateForm({
        onSave,
        defaultValue: originalTemplate,
        title: `Clone template '${originalTemplate.name}'`,
      });

      // Navigate through all steps
      clickNextButton();
      await screen.findByTestId('mockStepComponents');
      clickNextButton();
      await screen.findByTestId('mockStepSettings');
      clickNextButton();
      await screen.findByTestId('mockStepMappings');
      clickNextButton();
      await screen.findByTestId('mockStepAliases');
      clickNextButton();
      await screen.findByTestId('mockStepReview');
      clickNextButton();

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledTimes(1);
      });

      const savedTemplate = onSave.mock.calls[0][0] as TemplateDeserialized;
      expect(savedTemplate.name).toBe('original-copy');
      expect(savedTemplate.composedOf).toEqual(['component_1']);
      expect(savedTemplate._kbnMeta).toEqual(originalTemplate._kbnMeta);
      expect(savedTemplate.template).toEqual({
        ...originalTemplate.template,
        lifecycle: { enabled: true },
      });
    });
  });

  describe('WHEN template sections are empty', () => {
    beforeEach(() => {
      mockLogisticsData = {
        name: 'minimal_template',
        indexPatterns: ['minimal-*'],
        dataStream: {},
        indexMode: 'standard',
        allowAutoCreate: 'NO_OVERWRITE',
      };
      mockComponentsData = [];
      mockSettingsData = undefined;
      mockMappingsData = undefined;
      mockAliasesData = undefined;
    });

    it('SHOULD omit empty template sections from the payload', async () => {
      const onSave = jest.fn();
      renderTemplateForm({ onSave });

      clickNextButton();
      await screen.findByTestId('mockStepComponents');
      clickNextButton();
      await screen.findByTestId('mockStepSettings');
      clickNextButton();
      await screen.findByTestId('mockStepMappings');
      clickNextButton();
      await screen.findByTestId('mockStepAliases');
      clickNextButton();
      await screen.findByTestId('mockStepReview');
      clickNextButton();

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledTimes(1);
      });

      const savedTemplate = onSave.mock.calls[0][0] as TemplateDeserialized;
      // When settings, mappings, and aliases are all undefined the template object
      // should only contain lifecycle (which is also undefined here but still present
      // as a key because cleanupTemplateObject only strips the three known keys).
      expect(savedTemplate.template?.settings).toBeUndefined();
      expect(savedTemplate.template?.mappings).toBeUndefined();
      expect(savedTemplate.template?.aliases).toBeUndefined();
    });
  });

  describe('WHEN lifecycle is configured', () => {
    beforeEach(() => {
      mockLogisticsData = {
        name: 'template_with_lifecycle',
        indexPatterns: ['data-*'],
        dataStream: {},
        indexMode: 'standard',
        allowAutoCreate: 'NO_OVERWRITE',
        lifecycle: { enabled: true, value: 7, unit: 'd' },
      };
      mockComponentsData = [];
      mockSettingsData = undefined;
      mockMappingsData = undefined;
      mockAliasesData = undefined;
    });

    it('SHOULD serialize lifecycle into template.lifecycle and remove top-level lifecycle', async () => {
      const onSave = jest.fn();
      renderTemplateForm({ onSave });

      clickNextButton();
      await screen.findByTestId('mockStepComponents');
      clickNextButton();
      await screen.findByTestId('mockStepSettings');
      clickNextButton();
      await screen.findByTestId('mockStepMappings');
      clickNextButton();
      await screen.findByTestId('mockStepAliases');
      clickNextButton();
      await screen.findByTestId('mockStepReview');
      clickNextButton();

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledTimes(1);
      });

      const savedTemplate = onSave.mock.calls[0][0] as TemplateDeserialized;
      // lifecycle should be serialized into template.lifecycle
      expect(savedTemplate.template?.lifecycle).toEqual({
        enabled: true,
        data_retention: '7d',
      });
      // Top-level lifecycle should be removed
      expect(Object.prototype.hasOwnProperty.call(savedTemplate, 'lifecycle')).toBe(false);
    });
  });
});
