/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { CaseUI } from '../../../../common';
import type { ParsedTemplate } from '../../../../common/types/domain/template/v1';
import { FieldType } from '../../../../common/types/domain/template/fields';
import { TemplateFields } from './template_fields';

const mockUseGetTemplate = jest.fn();
jest.mock('../../templates_v2/hooks/use_get_template', () => ({
  useGetTemplate: (...args: unknown[]) => mockUseGetTemplate(...args),
}));

const mockUseGetFieldDefinitions = jest.fn();
jest.mock('../../field_library/hooks/use_get_field_definitions', () => ({
  useGetFieldDefinitions: (...args: unknown[]) => mockUseGetFieldDefinitions(...args),
}));

jest.mock('../../field_library/hooks/use_resolved_fields', () => ({
  useResolvedFields: (fields: unknown[]) => ({
    resolvedFields: fields,
    isLoading: false,
  }),
}));

const mockTemplate: ParsedTemplate = {
  templateId: 'template-1',
  name: 'Test Template',
  owner: 'securitySolution',
  templateVersion: 1,
  deletedAt: null,
  isLatest: true,
  latestVersion: 1,
  definitionString: 'name: Test Template\nfields: []',
  definition: {
    name: 'Test Template',
    fields: [
      { name: 'summary', control: FieldType.INPUT_TEXT, type: 'keyword', label: 'Summary' },
      { name: 'effort', control: FieldType.INPUT_NUMBER, type: 'integer', label: 'Effort' },
      { name: 'notes', control: FieldType.TEXTAREA, type: 'keyword', label: 'Notes' },
      {
        name: 'priority',
        control: FieldType.SELECT_BASIC,
        type: 'keyword',
        label: 'Priority',
        metadata: { options: ['low', 'medium', 'high'] },
      },
    ],
  },
};

const defaultCaseData = {
  template: { id: 'template-1', version: 1 },
  extendedFields: {
    summaryAsKeyword: 'test summary',
    effortAsInteger: 5,
    notesAsKeyword: 'some notes',
    priorityAsKeyword: 'medium',
  },
} as unknown as CaseUI;

const onUpdateField = jest.fn();

const defaultProps = {
  caseData: defaultCaseData,
  onUpdateField,
  isLoading: false,
  loadingKey: null,
};

describe('TemplateFields', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetTemplate.mockReturnValue({ data: mockTemplate, isLoading: false });
    mockUseGetFieldDefinitions.mockReturnValue({
      data: { fieldDefinitions: [] },
      isLoading: false,
    });
  });

  it('renders the Extended fields heading and all template fields', () => {
    render(<TemplateFields {...defaultProps} />);

    expect(screen.getByText('Extended fields')).toBeInTheDocument();
    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Effort')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('Priority')).toBeInTheDocument();
  });

  it('fetches the template with the correct id and version', () => {
    render(<TemplateFields {...defaultProps} />);

    expect(mockUseGetTemplate).toHaveBeenCalledWith('template-1', 1);
  });

  it('renders nothing when template is loading', () => {
    mockUseGetTemplate.mockReturnValue({ data: undefined, isLoading: true });

    const { container } = render(<TemplateFields {...defaultProps} />);

    expect(container.textContent).toBe('');
  });

  it('renders nothing when template has no fields', () => {
    mockUseGetTemplate.mockReturnValue({
      data: { ...mockTemplate, definition: { name: 'Empty', fields: [] } },
      isLoading: false,
    });

    const { container } = render(<TemplateFields {...defaultProps} />);

    expect(container.textContent).toBe('');
  });

  it('falls back to field.name when label is not provided', () => {
    const templateWithoutLabels: ParsedTemplate = {
      ...mockTemplate,
      definition: {
        name: 'Test',
        fields: [{ name: 'hostname', control: FieldType.INPUT_TEXT, type: 'keyword' }],
      },
    };
    mockUseGetTemplate.mockReturnValue({ data: templateWithoutLabels, isLoading: false });

    render(<TemplateFields {...defaultProps} />);

    expect(screen.getByText('hostname')).toBeInTheDocument();
  });

  it('returns null for unknown field control types', () => {
    const templateWithUnknown: ParsedTemplate = {
      ...mockTemplate,
      definition: {
        name: 'Test',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fields: [{ name: 'unknownField', control: 'UNKNOWN_TYPE' as any, type: 'keyword' }],
      },
    };
    mockUseGetTemplate.mockReturnValue({ data: templateWithUnknown, isLoading: false });

    render(<TemplateFields {...defaultProps} />);

    expect(screen.queryByTestId('template-field-unknownField')).not.toBeInTheDocument();
  });

  it('uses data-test-subj based on field name', () => {
    render(<TemplateFields {...defaultProps} />);

    expect(screen.getByTestId('template-field-summary')).toBeInTheDocument();
    expect(screen.getByTestId('template-field-effort')).toBeInTheDocument();
    expect(screen.getByTestId('template-field-notes')).toBeInTheDocument();
    expect(screen.getByTestId('template-field-priority')).toBeInTheDocument();
  });

  it('renders fields with empty inputs when extended field values are absent', () => {
    const caseWithNoExtended = {
      ...defaultCaseData,
      extendedFields: {},
    } as unknown as CaseUI;

    render(<TemplateFields {...defaultProps} caseData={caseWithNoExtended} />);

    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Effort')).toBeInTheDocument();
  });

  describe('text field inline-edit confirm/cancel', () => {
    const getSummaryInput = (): HTMLInputElement =>
      within(screen.getByTestId('template-field-summary')).getByRole('textbox') as HTMLInputElement;

    it('does NOT show confirm/cancel buttons before the field is focused', () => {
      render(<TemplateFields {...defaultProps} />);

      expect(screen.queryByTestId('template-field-confirm-summary')).not.toBeInTheDocument();
      expect(screen.queryByTestId('template-field-cancel-summary')).not.toBeInTheDocument();
    });

    it('shows confirm and cancel buttons when the text field is focused', async () => {
      const user = userEvent.setup();
      render(<TemplateFields {...defaultProps} />);

      await user.click(getSummaryInput());

      expect(screen.getByTestId('template-field-confirm-summary')).toBeInTheDocument();
      expect(screen.getByTestId('template-field-cancel-summary')).toBeInTheDocument();
    });

    it('calls onUpdateField with updated value when confirm button is clicked', async () => {
      const user = userEvent.setup();
      render(<TemplateFields {...defaultProps} />);

      const summary = getSummaryInput();
      await user.click(summary);
      await user.clear(summary);
      await user.type(summary, 'updated summary');

      await user.click(screen.getByTestId('template-field-confirm-summary'));

      await waitFor(() => {
        expect(onUpdateField).toHaveBeenCalled();
      });
      const lastCall = onUpdateField.mock.calls[onUpdateField.mock.calls.length - 1][0];
      expect(lastCall.key).toBe('extended_fields');
      expect(lastCall.value).toEqual(
        expect.objectContaining({
          summary_as_keyword: 'updated summary',
        })
      );
    });

    it('does NOT call onUpdateField when cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(<TemplateFields {...defaultProps} />);

      const summary = getSummaryInput();
      await user.click(summary);
      await user.clear(summary);
      await user.type(summary, 'discarded value');

      await user.click(screen.getByTestId('template-field-cancel-summary'));

      expect(onUpdateField).not.toHaveBeenCalled();
    });

    it('reverts the field value to the last saved value when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<TemplateFields {...defaultProps} />);

      const summary = getSummaryInput();
      await user.click(summary);
      await user.clear(summary);
      await user.type(summary, 'discarded value');

      expect(summary.value).toBe('discarded value');

      await user.click(screen.getByTestId('template-field-cancel-summary'));

      await waitFor(() => {
        expect(summary.value).toBe('test summary');
      });
    });

    it('hides confirm/cancel buttons after confirm is clicked', async () => {
      const user = userEvent.setup();
      render(<TemplateFields {...defaultProps} />);

      await user.click(getSummaryInput());
      expect(screen.getByTestId('template-field-confirm-summary')).toBeInTheDocument();

      await user.click(screen.getByTestId('template-field-confirm-summary'));

      await waitFor(() => {
        expect(screen.queryByTestId('template-field-confirm-summary')).not.toBeInTheDocument();
      });
    });

    it('hides confirm/cancel buttons after cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<TemplateFields {...defaultProps} />);

      await user.click(getSummaryInput());
      expect(screen.getByTestId('template-field-cancel-summary')).toBeInTheDocument();

      await user.click(screen.getByTestId('template-field-cancel-summary'));

      await waitFor(() => {
        expect(screen.queryByTestId('template-field-cancel-summary')).not.toBeInTheDocument();
      });
    });

    it('does NOT call onUpdateField on blur (no implicit save)', async () => {
      const user = userEvent.setup();
      render(<TemplateFields {...defaultProps} />);

      const summary = getSummaryInput();
      await user.click(summary);
      await user.clear(summary);
      await user.type(summary, 'typed but not confirmed');
      // Tab away without clicking confirm
      await user.tab();

      expect(onUpdateField).not.toHaveBeenCalled();
    });

    it('hides confirm/cancel buttons when the field loses focus (tab away)', async () => {
      const user = userEvent.setup();
      render(<TemplateFields {...defaultProps} />);

      await user.click(getSummaryInput());
      expect(screen.getByTestId('template-field-confirm-summary')).toBeInTheDocument();

      await user.tab();

      await waitFor(() => {
        expect(screen.queryByTestId('template-field-confirm-summary')).not.toBeInTheDocument();
      });
      await waitFor(() => {
        expect(screen.queryByTestId('template-field-cancel-summary')).not.toBeInTheDocument();
      });
    });
  });

  describe('textarea field inline-edit confirm/cancel', () => {
    const getNotesInput = (): HTMLTextAreaElement =>
      within(screen.getByTestId('template-field-notes')).getByRole(
        'textbox'
      ) as HTMLTextAreaElement;

    it('does NOT show confirm/cancel buttons before the field is focused', () => {
      render(<TemplateFields {...defaultProps} />);

      expect(screen.queryByTestId('template-field-confirm-notes')).not.toBeInTheDocument();
      expect(screen.queryByTestId('template-field-cancel-notes')).not.toBeInTheDocument();
    });

    it('shows confirm and cancel buttons when the textarea is focused', async () => {
      const user = userEvent.setup();
      render(<TemplateFields {...defaultProps} />);

      await user.click(getNotesInput());

      expect(screen.getByTestId('template-field-confirm-notes')).toBeInTheDocument();
      expect(screen.getByTestId('template-field-cancel-notes')).toBeInTheDocument();
    });

    it('calls onUpdateField with updated value when confirm is clicked', async () => {
      const user = userEvent.setup();
      render(<TemplateFields {...defaultProps} />);

      const notes = getNotesInput();
      await user.click(notes);
      await user.clear(notes);
      await user.type(notes, 'updated notes');

      await user.click(screen.getByTestId('template-field-confirm-notes'));

      await waitFor(() => {
        expect(onUpdateField).toHaveBeenCalled();
      });
      const lastCall = onUpdateField.mock.calls[onUpdateField.mock.calls.length - 1][0];
      expect(lastCall.key).toBe('extended_fields');
      expect(lastCall.value).toEqual(
        expect.objectContaining({ notes_as_keyword: 'updated notes' })
      );
    });

    it('does NOT call onUpdateField and reverts value when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<TemplateFields {...defaultProps} />);

      const notes = getNotesInput();
      await user.click(notes);
      await user.clear(notes);
      await user.type(notes, 'discarded notes');

      await user.click(screen.getByTestId('template-field-cancel-notes'));

      expect(onUpdateField).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(notes.value).toBe('some notes');
      });
    });

    it('hides confirm/cancel buttons when the textarea loses focus', async () => {
      const user = userEvent.setup();
      render(<TemplateFields {...defaultProps} />);

      await user.click(getNotesInput());
      expect(screen.getByTestId('template-field-confirm-notes')).toBeInTheDocument();

      await user.tab();

      await waitFor(() => {
        expect(screen.queryByTestId('template-field-confirm-notes')).not.toBeInTheDocument();
      });
      await waitFor(() => {
        expect(screen.queryByTestId('template-field-cancel-notes')).not.toBeInTheDocument();
      });
    });
  });

  describe('number field inline-edit confirm/cancel', () => {
    const getEffortInput = (): HTMLInputElement =>
      within(screen.getByTestId('template-field-effort')).getByRole(
        'spinbutton'
      ) as HTMLInputElement;

    it('does NOT show confirm/cancel buttons before the field is focused', () => {
      render(<TemplateFields {...defaultProps} />);

      expect(screen.queryByTestId('template-field-confirm-effort')).not.toBeInTheDocument();
      expect(screen.queryByTestId('template-field-cancel-effort')).not.toBeInTheDocument();
    });

    it('shows confirm and cancel buttons when the number field is focused', async () => {
      const user = userEvent.setup();
      render(<TemplateFields {...defaultProps} />);

      await user.click(getEffortInput());

      expect(screen.getByTestId('template-field-confirm-effort')).toBeInTheDocument();
      expect(screen.getByTestId('template-field-cancel-effort')).toBeInTheDocument();
    });

    it('calls onUpdateField with updated value when confirm is clicked', async () => {
      const user = userEvent.setup();
      render(<TemplateFields {...defaultProps} />);

      const effort = getEffortInput();
      await user.click(effort);
      await user.clear(effort);
      await user.type(effort, '10');

      await user.click(screen.getByTestId('template-field-confirm-effort'));

      await waitFor(() => {
        expect(onUpdateField).toHaveBeenCalled();
      });
      const lastCall = onUpdateField.mock.calls[onUpdateField.mock.calls.length - 1][0];
      expect(lastCall.key).toBe('extended_fields');
      expect(lastCall.value).toEqual(expect.objectContaining({ effort_as_integer: '10' }));
    });

    it('does NOT call onUpdateField and reverts value when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<TemplateFields {...defaultProps} />);

      const effort = getEffortInput();
      await user.click(effort);
      await user.clear(effort);
      await user.type(effort, '99');

      await user.click(screen.getByTestId('template-field-cancel-effort'));

      expect(onUpdateField).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(effort.value).toBe('5');
      });
    });

    it('hides confirm/cancel buttons when the number field loses focus', async () => {
      const user = userEvent.setup();
      render(<TemplateFields {...defaultProps} />);

      await user.click(getEffortInput());
      expect(screen.getByTestId('template-field-confirm-effort')).toBeInTheDocument();

      await user.tab();

      await waitFor(() => {
        expect(screen.queryByTestId('template-field-confirm-effort')).not.toBeInTheDocument();
      });
      await waitFor(() => {
        expect(screen.queryByTestId('template-field-cancel-effort')).not.toBeInTheDocument();
      });
    });
  });

  describe('select field inline-edit confirm/cancel', () => {
    const getPrioritySelect = (): HTMLSelectElement =>
      within(screen.getByTestId('template-field-priority')).getByRole(
        'combobox'
      ) as HTMLSelectElement;

    it('does NOT show confirm/cancel buttons before a value is changed', () => {
      render(<TemplateFields {...defaultProps} />);

      expect(screen.queryByTestId('template-field-confirm-priority')).not.toBeInTheDocument();
      expect(screen.queryByTestId('template-field-cancel-priority')).not.toBeInTheDocument();
    });

    it('shows confirm and cancel buttons after the user changes the selection', async () => {
      const user = userEvent.setup();
      render(<TemplateFields {...defaultProps} />);

      await user.selectOptions(getPrioritySelect(), 'high');

      expect(screen.getByTestId('template-field-confirm-priority')).toBeInTheDocument();
      expect(screen.getByTestId('template-field-cancel-priority')).toBeInTheDocument();
    });

    it('calls onUpdateField with the new value when confirm is clicked', async () => {
      const user = userEvent.setup();
      render(<TemplateFields {...defaultProps} />);

      await user.selectOptions(getPrioritySelect(), 'high');
      await user.click(screen.getByTestId('template-field-confirm-priority'));

      await waitFor(() => {
        expect(onUpdateField).toHaveBeenCalled();
      });
      const lastCall = onUpdateField.mock.calls[onUpdateField.mock.calls.length - 1][0];
      expect(lastCall.key).toBe('extended_fields');
      expect(lastCall.value).toEqual(expect.objectContaining({ priority_as_keyword: 'high' }));
    });

    it('does NOT call onUpdateField and reverts value when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<TemplateFields {...defaultProps} />);

      const select = getPrioritySelect();
      await user.selectOptions(select, 'low');

      await user.click(screen.getByTestId('template-field-cancel-priority'));

      expect(onUpdateField).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(select.value).toBe('medium');
      });
    });

    it('hides confirm/cancel buttons after confirm is clicked', async () => {
      const user = userEvent.setup();
      render(<TemplateFields {...defaultProps} />);

      await user.selectOptions(getPrioritySelect(), 'high');
      expect(screen.getByTestId('template-field-confirm-priority')).toBeInTheDocument();

      await user.click(screen.getByTestId('template-field-confirm-priority'));

      await waitFor(() => {
        expect(screen.queryByTestId('template-field-confirm-priority')).not.toBeInTheDocument();
      });
    });

    it('hides confirm/cancel buttons after cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<TemplateFields {...defaultProps} />);

      await user.selectOptions(getPrioritySelect(), 'low');
      expect(screen.getByTestId('template-field-cancel-priority')).toBeInTheDocument();

      await user.click(screen.getByTestId('template-field-cancel-priority'));

      await waitFor(() => {
        expect(screen.queryByTestId('template-field-cancel-priority')).not.toBeInTheDocument();
      });
    });
  });
});
