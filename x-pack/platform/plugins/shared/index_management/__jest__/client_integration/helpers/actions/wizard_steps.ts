/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { screen, fireEvent, within, waitFor } from '@testing-library/react';
import { EuiComboBoxTestHarness } from '@kbn/test-eui-helpers';

export type AllowAutoCreateValue = 'TRUE' | 'FALSE' | 'NO_OVERWRITE' | 'DO_NOT_OVERWRITE';

export interface StepOneOptions {
  indexPatterns?: string[];
  priority?: number;
  allowAutoCreate?: AllowAutoCreateValue;
  version?: number;
  lifecycle?: { enabled?: boolean; value: number | string; unit?: string };
  indexMode?: string;
  name?: string;
}

/**
 * Shared actions for interacting with the template wizard steps.
 */
export const wizardSteps = {
  /**
   * Complete step 1 (Logistics): Name, index patterns, priority, version, lifecycle, index mode
   */
  async completeStepOne(stepOptions: StepOneOptions = {}) {
    const { indexPatterns, priority, allowAutoCreate, version, lifecycle, indexMode, name } =
      stepOptions;

    if (name) {
      const nameRow = screen.getByTestId('nameField');
      const nameInput = within(nameRow).getByRole('textbox');
      fireEvent.change(nameInput, { target: { value: name } });
    }

    if (indexMode) {
      // Set indexMode before indexPatterns to avoid any automatic reset logic
      // First ensure the toggle is checked (setIndexMode must be true for indexMode to persist)
      const toggle = screen.getByTestId('toggleIndexMode');
      const isChecked = toggle.getAttribute('aria-checked') === 'true';
      if (!isChecked) {
        fireEvent.click(toggle);
        await screen.findByTestId('indexModeField');
      }
      const indexModeSelect = screen.getByTestId('indexModeField');
      // Try clicking first to see if dropdown opens (for real SuperSelect)
      fireEvent.click(indexModeSelect);

      // Map indexMode values to their test-subj values
      const indexModeTestSubjMap: Record<string, string> = {
        standard: 'index_mode_standard',
        time_series: 'index_mode_time_series',
        logsdb: 'index_mode_logsdb',
        lookup: 'index_mode_logsdb', // Note: lookup and logsdb share the same test-subj
      };
      const optionTestSubj = indexModeTestSubjMap[indexMode];

      // Try to find the option in the dropdown (if SuperSelect opened)
      // Use queryAllByTestId and filter by id attribute since logsdb and lookup share the same test-subj
      const options = screen.queryAllByTestId(optionTestSubj);
      const option = options.find((el) => el.getAttribute('id') === indexMode);
      if (option) {
        // SuperSelect opened, click the option
        fireEvent.click(option);
      } else {
        // SuperSelect is mocked as input, use change event directly
        // The value must match one of the option values exactly
        fireEvent.change(indexModeSelect, { target: { value: indexMode }, bubbles: true });
        fireEvent.blur(indexModeSelect);
      }
    }

    if (indexPatterns) {
      await screen.findByTestId('indexPatternsField');
      const indexPatternsComboBox = new EuiComboBoxTestHarness('indexPatternsField');

      // Clear existing selections first
      await indexPatternsComboBox.clear();

      // Add each pattern
      for (const pattern of indexPatterns) {
        // Index patterns are entered as custom values (createable combo box).
        // Use the fast custom-value path to avoid expensive async option list heuristics.
        indexPatternsComboBox.addCustomValue(pattern);
      }

      // Close the combobox popover (portal) to avoid it intercepting later clicks
      // and scheduling late async updates that can cause test timeouts/flakes.
      await indexPatternsComboBox.close({ timeout: 250 });
    }

    if (priority !== undefined) {
      const priorityRow = screen.getByTestId('priorityField');
      const priorityInput = within(priorityRow).getByRole('spinbutton');
      fireEvent.change(priorityInput, { target: { value: String(priority) } });
    }

    if (version !== undefined) {
      const versionRow = screen.getByTestId('versionField');
      const versionInput = within(versionRow).getByRole('spinbutton');
      fireEvent.change(versionInput, { target: { value: String(version) } });
    }

    if (lifecycle) {
      const deletePhaseCard = await screen.findByTestId('dlmPhasesSelectorDeletePhaseCard');
      const isEnabled = (deletePhaseCard as HTMLInputElement).checked;

      // Default to enabled if lifecycle.enabled is undefined
      const targetEnabled = lifecycle.enabled ?? true;

      if (isEnabled !== targetEnabled) {
        fireEvent.click(deletePhaseCard);
      }

      if (targetEnabled) {
        const retentionInput = await screen.findByTestId('deleteDurationValue');
        fireEvent.change(retentionInput, { target: { value: String(lifecycle.value) } });
      }
    }

    if (allowAutoCreate) {
      const autoCreateRow = screen.getByTestId('allowAutoCreateField');

      let labelMatch = /Do not overwrite/;
      if (allowAutoCreate === 'TRUE') labelMatch = /True/;
      if (allowAutoCreate === 'FALSE') labelMatch = /False/;

      const radio = within(autoCreateRow).getByLabelText(labelMatch);
      fireEvent.click(radio);
    }

    // Wait for next button to be enabled (form validation complete)
    await waitFor(() => expect(screen.getByTestId('nextButton')).toBeEnabled());

    fireEvent.click(screen.getByTestId('nextButton'));
    await screen.findByTestId('stepComponents');
  },

  /**
   * Complete step 2 (Component templates): Select optional component templates
   */
  async completeStepTwo(componentName?: string) {
    if (componentName) {
      // Get the component templates list container
      const listContainer = await screen.findByTestId('componentTemplatesList');
      // Find all component name elements within the list
      const componentNames = within(listContainer).getAllByTestId('name');
      const componentsFound = componentNames.map((el) => el.textContent);
      const index = componentsFound.indexOf(componentName);
      if (index >= 0) {
        // Find all add buttons within the list
        const addButtons = within(listContainer).getAllByTestId('action-plusCircle');
        fireEvent.click(addButtons[index]);
      }
    }

    fireEvent.click(screen.getByTestId('nextButton'));
    await screen.findByTestId('stepSettings');
  },

  /**
   * Complete step 3 (Index settings): Optional JSON settings
   */
  async completeStepThree(settingsJson?: string, shouldNavigate: boolean = true) {
    if (settingsJson) {
      const editor = screen.getByTestId('settingsEditor');
      fireEvent.change(editor, { target: { value: settingsJson } });
    }
    fireEvent.click(screen.getByTestId('nextButton'));
    if (shouldNavigate) {
      await screen.findByTestId('stepMappings');
    }
  },

  /**
   * Complete step 4 (Mappings): Add mapping fields
   */
  async completeStepFour(
    mappingFields?: Array<{ name: string; type: string }>,
    shouldNavigate: boolean = true
  ) {
    if (mappingFields) {
      // Prefer the "Load JSON" modal when we need deterministic mappings.
      // It avoids flaky EuiComboBox interactions (the field type form defaults to "text").
      const mappingsJson = {
        properties: mappingFields.reduce<Record<string, { type: string }>>((acc, field) => {
          acc[field.name] = { type: field.type };
          return acc;
        }, {}),
      };

      const loadJsonButton = screen.getByRole('button', { name: 'Load JSON' });
      fireEvent.click(loadJsonButton);

      // Wait for modal controls to appear
      const confirmButton = await screen.findByRole('button', { name: 'Load and overwrite' });

      // JsonEditor uses CodeEditor under the hood; in tests we mock it as an <input />
      const jsonEditorInput = screen.getByTestId('mockCodeEditor');
      const json = JSON.stringify(mappingsJson, null, 2);
      fireEvent.change(jsonEditorInput, { target: { value: json } });

      // JsonEditor debounces updates by ~300ms
      const jsonEditorBlur = screen.getByTestId('mockCodeEditor');
      fireEvent.blur(jsonEditorBlur);
      await waitFor(() => {
        const value = jsonEditorBlur.getAttribute('data-currentvalue');
        expect(value).toBeTruthy();
        expect(JSON.parse(String(value))).toEqual(JSON.parse(json));
      });

      fireEvent.click(confirmButton);
    }

    await screen.findByTestId('documentFields');

    // When we are staying on this step (e.g. tests that only verify mapping editing),
    // avoid waiting for navigation-related validation. It can be significantly slower
    // and is not needed for verifying the mappings UI state.
    if (!shouldNavigate) return;

    await waitFor(() => expect(screen.getByTestId('nextButton')).toBeEnabled());

    fireEvent.click(screen.getByTestId('nextButton'));

    await screen.findByTestId('stepAliases');
  },

  /**
   * Complete step 5 (Aliases): Optional JSON aliases
   */
  async completeStepFive(aliasesJson?: string, shouldNavigate: boolean = true) {
    if (aliasesJson) {
      const editor = screen.getByTestId('aliasesEditor');
      fireEvent.change(editor, { target: { value: aliasesJson } });
    }
    fireEvent.click(screen.getByTestId('nextButton'));
    if (shouldNavigate) {
      await screen.findByTestId('summaryTabContent');
    }
  },
};
