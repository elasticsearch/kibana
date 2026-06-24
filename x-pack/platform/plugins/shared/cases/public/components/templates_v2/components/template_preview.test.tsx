/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import { TemplatePreview } from './template_preview';
import { TemplateFieldRenderer } from '../field_types/field_renderer';

jest.mock('../field_types/field_renderer', () => ({
  TemplateFieldRenderer: jest.fn(() => <div data-test-subj="template-field-renderer" />),
}));

jest.mock('../../cases_context/use_cases_context', () => ({
  useCasesContext: () => ({ owner: ['securitySolution'] }),
}));

describe('CreateTemplatePreview', () => {
  const renderPreview = (definition: string) => {
    const Wrapper = () => {
      const form = useForm({
        defaultValues: {
          definition: '',
        },
      });

      useEffect(() => {
        form.setValue('definition', definition);
      }, [form]);

      return (
        <FormProvider {...form}>
          <TemplatePreview />
        </FormProvider>
      );
    };

    return render(<Wrapper />);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the field renderer for valid YAML', () => {
    renderPreview(
      `name: Preview\nfields:\n  - control: INPUT_TEXT\n    name: field_one\n    type: keyword`
    );

    expect(screen.getByTestId('template-field-renderer')).toBeInTheDocument();
    expect(TemplateFieldRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        parsedTemplate: expect.objectContaining({
          name: 'Preview',
          fields: expect.any(Array),
        }),
      }),
      expect.any(Object)
    );
  });

  it('renders nothing when YAML is invalid (no last valid template)', () => {
    renderPreview('name: [');

    // Component returns null when there's no valid template
    expect(screen.queryByTestId('template-field-renderer')).not.toBeInTheDocument();
    expect(TemplateFieldRenderer).not.toHaveBeenCalled();
  });
});
