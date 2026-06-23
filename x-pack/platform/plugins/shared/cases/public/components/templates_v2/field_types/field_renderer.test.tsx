/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { parse as parseYaml } from 'yaml';
import { render, renderHook, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useForm, FormProvider } from 'react-hook-form';
import { ParsedTemplateDefinitionSchema } from '../../../../common/types/domain/template/latest';
import { CASE_EXTENDED_FIELDS } from '../../../../common/constants';
import { isInlineField } from '../../../../common/types/domain/template/fields';
import { FieldsRenderer, TemplateFieldRenderer } from './field_renderer';

jest.mock('../../field_library/hooks/use_resolved_fields', () => ({
  useResolvedFields: (fields: Array<Record<string, unknown>>) => ({
    // Inline fields have `control`; ref fields have `$ref` without `control`
    resolvedFields: fields.filter((f) => 'control' in f),
    isLoading: false,
  }),
}));

jest.mock('../../cases_context/use_cases_context', () => ({
  useCasesContext: () => ({ owner: ['cases'] }),
}));

/**
 * Template with a required field whose show_when condition is false by default
 * (controller starts empty, not equal to 'yes').
 */
const templateWithHiddenRequired = `
name: Test
fields:
  - name: controller
    control: INPUT_TEXT
    type: keyword
    label: Controller
  - name: hidden_required
    control: INPUT_TEXT
    type: keyword
    label: Hidden Required
    validation:
      required: true
    display:
      show_when:
        field: controller
        operator: eq
        value: 'yes'
`;

const FormWrapper: React.FC<{
  templateDef: string;
  onSubmitResult: (isValid: boolean) => void;
}> = ({ templateDef, onSubmitResult }) => {
  const parseResult = ParsedTemplateDefinitionSchema.safeParse(parseYaml(templateDef));

  const form = useForm({
    defaultValues: { [CASE_EXTENDED_FIELDS]: {} },
  });

  if (!parseResult.success) {
    return <>{`Invalid template: ${parseResult.error}`}</>;
  }

  const resolvedFields = parseResult.data.fields.filter(isInlineField);

  const handleSubmit = form.handleSubmit(
    () => onSubmitResult(true),
    () => onSubmitResult(false)
  );

  return (
    <FormProvider {...form}>
      <FieldsRenderer resolvedFields={resolvedFields} />
      <button type="button" onClick={handleSubmit}>
        {'Submit'}
      </button>
    </FormProvider>
  );
};

const radioTemplate = `
name: Test
fields:
  - name: environment
    control: RADIO_GROUP
    type: keyword
    label: Environment
    metadata:
      options:
        - development
        - staging
        - production
      default: production
  - name: affected_components
    control: CHECKBOX_GROUP
    type: keyword
    label: Affected components
    metadata:
      options:
        - api
        - ui
        - database
      default: []
    display:
      show_when:
        field: environment
        operator: eq
        value: staging
`;

const parseParsedTemplate = (yaml: string) => {
  const result = ParsedTemplateDefinitionSchema.safeParse(parseYaml(yaml));
  if (!result.success) throw new Error(`Invalid template: ${result.error}`);
  return result.data;
};

/**
 * Hook that exposes the stable-fields stabilization logic from TemplateFieldRenderer
 * for isolated unit testing.
 */
const useStableFields = (fields: ReturnType<typeof parseParsedTemplate>['fields']) => {
  const fieldsKey = fields.map((f) => JSON.stringify(f)).join('|');
  const stableFieldsRef = React.useRef(fields);
  const prevKeyRef = React.useRef(fieldsKey);
  if (prevKeyRef.current !== fieldsKey) {
    prevKeyRef.current = fieldsKey;
    stableFieldsRef.current = fields;
  }
  return stableFieldsRef.current;
};

describe('TemplateFieldRenderer — stable fields reference', () => {
  it('returns the same reference when re-rendered with a new but identical fields array', () => {
    const parsedTemplate = parseParsedTemplate(radioTemplate);

    const { result, rerender } = renderHook(({ fields }) => useStableFields(fields), {
      initialProps: { fields: parsedTemplate.fields },
    });

    const firstRef = result.current;

    // Re-parse the same YAML — produces a new object/array with identical content
    const identicalParsedTemplate = parseParsedTemplate(radioTemplate);
    expect(identicalParsedTemplate.fields).not.toBe(parsedTemplate.fields); // confirm new reference

    rerender({ fields: identicalParsedTemplate.fields });

    // stableFields reference must NOT change — same content, same ref
    expect(result.current).toBe(firstRef);
  });

  it('returns a new reference when the field default genuinely changes', () => {
    const parsedTemplate = parseParsedTemplate(radioTemplate);

    const { result, rerender } = renderHook(({ fields }) => useStableFields(fields), {
      initialProps: { fields: parsedTemplate.fields },
    });

    const firstRef = result.current;

    // Change the default from 'production' to 'staging'
    const updatedTemplate = parseParsedTemplate(
      radioTemplate.replace('default: production', 'default: staging')
    );

    rerender({ fields: updatedTemplate.fields });

    // stableFields reference MUST change — content changed
    expect(result.current).not.toBe(firstRef);
    expect(result.current).toBe(updatedTemplate.fields);
  });

  it('returns a new reference when a field is added', () => {
    const parsedTemplate = parseParsedTemplate(radioTemplate);

    const { result, rerender } = renderHook(({ fields }) => useStableFields(fields), {
      initialProps: { fields: parsedTemplate.fields },
    });

    const firstRef = result.current;

    const templateWithExtraField = parseParsedTemplate(
      `${radioTemplate}
  - name: extra_field
    control: INPUT_TEXT
    type: keyword
    label: Extra
`
    );

    rerender({ fields: templateWithExtraField.fields });

    expect(result.current).not.toBe(firstRef);
  });

  it('does not call onFieldDefaultChange when TemplateFieldRenderer re-renders with identical field definitions', async () => {
    const onFieldDefaultChange = jest.fn();
    const parsedTemplate = parseParsedTemplate(radioTemplate);

    const { rerender } = render(
      <TemplateFieldRenderer
        parsedTemplate={parsedTemplate}
        owner="securitySolution"
        onFieldDefaultChange={onFieldDefaultChange}
      />
    );

    // Let the initial sync and setTimeout(0) settle
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    onFieldDefaultChange.mockClear();

    // Simulate TemplatePreview re-parsing the same YAML — new object, same content
    const identicalParsedTemplate = parseParsedTemplate(radioTemplate);
    expect(identicalParsedTemplate.fields).not.toBe(parsedTemplate.fields);

    rerender(
      <TemplateFieldRenderer
        parsedTemplate={identicalParsedTemplate}
        owner="securitySolution"
        onFieldDefaultChange={onFieldDefaultChange}
      />
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // The YAML-to-form sync effect must NOT fire — stableFields ref is unchanged
    expect(onFieldDefaultChange).not.toHaveBeenCalled();
  });
});

describe('FieldsRenderer — hidden required fields', () => {
  it('does not block form submission when a required field is hidden by show_when', async () => {
    const onSubmitResult = jest.fn();

    render(
      <FormWrapper templateDef={templateWithHiddenRequired} onSubmitResult={onSubmitResult} />
    );

    // The hidden_required field is not rendered because controller !== 'yes'
    expect(screen.queryByText('Hidden Required')).not.toBeInTheDocument();

    // Submit the form — the hidden required field must not block submission
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(onSubmitResult).toHaveBeenCalledWith(true);
    });
  });

  it('blocks form submission when a required field is visible', async () => {
    const onSubmitResult = jest.fn();

    render(
      <FormWrapper templateDef={templateWithHiddenRequired} onSubmitResult={onSubmitResult} />
    );

    // Type 'yes' into the controller input to satisfy the show_when condition
    const controllerInput = screen.getByLabelText('Controller');
    await userEvent.type(controllerInput, 'yes');

    // The hidden_required field should now be visible
    await waitFor(() => {
      expect(screen.getByText('Hidden Required')).toBeInTheDocument();
    });

    // Submit without filling in the required field — should be blocked
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(onSubmitResult).toHaveBeenCalledWith(false);
    });
  });
});
