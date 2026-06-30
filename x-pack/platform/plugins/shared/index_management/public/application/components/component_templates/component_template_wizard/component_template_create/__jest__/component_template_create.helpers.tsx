/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Route } from '@kbn/shared-ux-router';
import { i18nServiceMock, themeServiceMock, analyticsServiceMock } from '@kbn/core/public/mocks';
import { KibanaRenderContextProvider } from '@kbn/react-kibana-context-render';
import { EuiComboBoxTestHarness } from '@kbn/test-eui-helpers';
import type { HttpSetup } from '@kbn/core/public';

import { runPendingTimersUntil } from '../../../../../../../__jest__/helpers/fake_timers';
import { ComponentTemplateCreate } from '..';
import { BASE_PATH } from '../../../../../../../common';
import { WithAppDependencies } from '../../../__jest__/client_integration/helpers/setup_environment';

// Services required for KibanaRenderContextProvider (provides i18n, theme, analytics)
const startServicesMock = {
  i18n: i18nServiceMock.createStartContract(),
  theme: themeServiceMock.createStartContract(),
  analytics: analyticsServiceMock.createAnalyticsServiceStart(),
};

export const renderComponentTemplateCreate = (httpSetup: HttpSetup) => {
  const routePath = `${BASE_PATH}/create_component_template`;
  const CreateWithRouter = () => (
    <MemoryRouter initialEntries={[routePath]}>
      <Route path={`${BASE_PATH}/create_component_template`} component={ComponentTemplateCreate} />
    </MemoryRouter>
  );

  return render(
    <KibanaRenderContextProvider {...startServicesMock}>
      {React.createElement(WithAppDependencies(CreateWithRouter, httpSetup))}
    </KibanaRenderContextProvider>
  );
};

/**
 * Helper to fill form step-by-step.
 */
interface LifecycleConfig {
  enabled: boolean;
  value?: number | string;
  unit?: string;
}

interface MappingField {
  name: string;
  type: string;
}

export const completeStep = {
  async logistics({ name, lifecycle }: { name: string; lifecycle?: LifecycleConfig }) {
    if (name) {
      const nameRow = screen.getByTestId('nameField');
      const nameInput = within(nameRow).getByRole('textbox');
      fireEvent.change(nameInput, { target: { value: name } });
    }

    if (lifecycle && lifecycle.enabled) {
      const deleteCheckbox = screen.getByTestId('dlmPhasesSelectorDeletePhaseCard');
      if (!(deleteCheckbox as HTMLInputElement).checked) {
        fireEvent.click(deleteCheckbox);
      }

      await runPendingTimersUntil(() => screen.queryByTestId('deleteDurationValue') !== null);

      const retentionInput = screen.getByTestId('deleteDurationValue');
      fireEvent.change(retentionInput, { target: { value: String(lifecycle.value) } });
    }

    // Wait for form validation to complete
    await waitFor(() => expect(screen.getByTestId('nextButton')).toBeEnabled());

    fireEvent.click(screen.getByTestId('nextButton'));
    await screen.findByTestId('stepSettings');
  },
  async settings(settingsJson?: string) {
    if (settingsJson) {
      const editor = screen.getByTestId('settingsEditor');
      fireEvent.change(editor, { target: { value: settingsJson } });
    }
    fireEvent.click(screen.getByTestId('nextButton'));
    await screen.findByTestId('stepMappings');
  },
  async mappings(mappingFields?: MappingField[]) {
    if (mappingFields) {
      for (const field of mappingFields) {
        const { name, type } = field;
        const createFieldForm = screen.getByTestId('createFieldForm');

        const nameInput = screen.getByTestId('nameParameterInput');
        fireEvent.change(nameInput, { target: { value: name } });

        // Use EuiComboBoxTestHarness for field type selection
        await within(createFieldForm).findByTestId('fieldType');
        const fieldTypeComboBox = new EuiComboBoxTestHarness('fieldType');
        await fieldTypeComboBox.select(type);
        // Close the combobox popover (portal) so it doesn't leak across fields/tests.
        await fieldTypeComboBox.close();

        const addButton = within(createFieldForm).getByTestId('addButton');

        // Count fields before adding
        const fieldsBefore = screen.queryAllByText(name).length;

        fireEvent.click(addButton);

        // Wait for the field to be added
        await waitFor(() => {
          expect(screen.queryAllByText(name).length).toBeGreaterThan(fieldsBefore);
        });
      }
    }

    await screen.findByTestId('documentFields');
    await waitFor(() => expect(screen.getByTestId('nextButton')).toBeEnabled());
    fireEvent.click(screen.getByTestId('nextButton'));

    await screen.findByTestId('stepAliases');
  },
  async aliases(aliasesJson?: string) {
    if (aliasesJson) {
      const editor = screen.getByTestId('aliasesEditor');
      fireEvent.change(editor, { target: { value: aliasesJson } });
    }
    fireEvent.click(screen.getByTestId('nextButton'));
    await screen.findByTestId('stepReview');
  },
};
