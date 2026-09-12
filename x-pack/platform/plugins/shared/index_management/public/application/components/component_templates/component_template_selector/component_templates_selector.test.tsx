/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';

import type { ComponentTemplateListItem } from '../../../../../common';
import { ComponentTemplatesSelector } from './component_templates_selector';

const mockUseLoadComponentTemplates = jest.fn();
const mockSelectionComponentsSpy = jest.fn();

jest.mock('../component_templates_context', () => ({
  useApi: () => ({ useLoadComponentTemplates: () => mockUseLoadComponentTemplates() }),
}));

jest.mock('../../template_form/steps/use_creates_data_stream', () => ({
  useCreatesDataStream: () => false,
}));

jest.mock('../shared_imports', () => ({
  SectionError: () => <div data-test-subj="sectionError" />,
  SectionLoading: () => <div data-test-subj="sectionLoading" />,
  GlobalFlyout: {
    useGlobalFlyout: () => ({ addContent: jest.fn(), removeContent: jest.fn() }),
  },
}));

jest.mock('../component_template_details', () => ({
  ComponentTemplateDetailsFlyoutContent: () => null,
  defaultFlyoutProps: {},
}));

jest.mock('./components', () => ({
  CreateButtonPopOver: () => null,
}));

jest.mock('./component_templates', () => ({
  ComponentTemplates: () => <div data-test-subj="mockComponentTemplatesList" />,
}));

jest.mock('./component_templates_selection', () => ({
  ComponentTemplatesSelection: ({ components }: { components: ComponentTemplateListItem[] }) => {
    mockSelectionComponentsSpy(components);

    return (
      <ul>
        {components.map(({ name }) => (
          <li key={name} data-test-subj="selectedComponent">
            {name}
          </li>
        ))}
      </ul>
    );
  },
}));

// Every field other than `name` differs from the placeholder entry, so the object
// assertions fail when an existing template falls back to a placeholder (or a partial copy).
const buildComponent = (name: string): ComponentTemplateListItem => ({
  name,
  usedBy: [`${name}_template`],
  hasMappings: true,
  hasAliases: true,
  hasSettings: true,
  isManaged: true,
});

const renderSelector = (defaultValue: string[]) => {
  const onChange = jest.fn();
  render(
    <I18nProvider>
      <ComponentTemplatesSelector
        onChange={onChange}
        onComponentsLoaded={jest.fn()}
        defaultValue={defaultValue}
        docUri="https://docs"
      />
    </I18nProvider>
  );
  return { onChange };
};

const getSelectedNames = () =>
  screen.getAllByTestId('selectedComponent').map((el) => el.textContent);

describe('ComponentTemplatesSelector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLoadComponentTemplates.mockReturnValue({
      data: [buildComponent('ct_a'), buildComponent('ct_b')],
      isLoading: false,
      error: null,
    });
  });

  describe('WHEN defaultValue contains a component template that does not exist', () => {
    it('SHOULD keep the defaultValue order in the selection and in onChange', () => {
      const { onChange } = renderSelector(['ct_missing', 'ct_a', 'ct_b']);

      expect(getSelectedNames()).toEqual(['ct_missing', 'ct_a', 'ct_b']);
      expect(onChange).toHaveBeenLastCalledWith(['ct_missing', 'ct_a', 'ct_b']);
    });

    it('SHOULD keep a missing template between existing ones in place as a placeholder entry', () => {
      const { onChange } = renderSelector(['ct_b', 'ct_missing', 'ct_a']);

      expect(getSelectedNames()).toEqual(['ct_b', 'ct_missing', 'ct_a']);
      expect(onChange).toHaveBeenLastCalledWith(['ct_b', 'ct_missing', 'ct_a']);

      const [selection] = mockSelectionComponentsSpy.mock.lastCall;
      expect(selection).toEqual([
        buildComponent('ct_b'),
        {
          name: 'ct_missing',
          usedBy: [],
          hasMappings: false,
          hasAliases: false,
          hasSettings: false,
          isManaged: false,
        },
        buildComponent('ct_a'),
      ]);
    });
  });

  describe('WHEN no component templates are loaded', () => {
    // Regression guard: the effect runs on an empty list and every defaultValue name becomes a stub.
    it('SHOULD emit every defaultValue name in order', () => {
      mockUseLoadComponentTemplates.mockReturnValue({ data: [], isLoading: false, error: null });

      const { onChange } = renderSelector(['ct_missing_2', 'ct_missing_1']);

      expect(onChange).toHaveBeenLastCalledWith(['ct_missing_2', 'ct_missing_1']);
    });
  });

  describe('WHEN every defaultValue component template exists', () => {
    // Regression guard: this path is already order-preserving.
    it('SHOULD keep the defaultValue order rather than the loaded list order', () => {
      const { onChange } = renderSelector(['ct_b', 'ct_a']);

      expect(getSelectedNames()).toEqual(['ct_b', 'ct_a']);
      expect(onChange).toHaveBeenLastCalledWith(['ct_b', 'ct_a']);
    });
  });
});
