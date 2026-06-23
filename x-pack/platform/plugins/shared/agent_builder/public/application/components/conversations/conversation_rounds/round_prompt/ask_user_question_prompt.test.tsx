/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiProvider } from '@elastic/eui';
import { I18nProvider } from '@kbn/i18n-react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  AskUserQuestionPromptResponse,
  AskUserQuestionItem,
} from '@kbn/agent-builder-common/agents';
import { AskUserQuestionPrompt } from './ask_user_question_prompt';

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <I18nProvider>
      <EuiProvider>{ui}</EuiProvider>
    </I18nProvider>
  );

// The custom ("Be more specific") option has no visible label; its radio/checkbox
// input carries the row test-subj directly.
const getCustomCheckable = () => screen.getByTestId('agentBuilderAskUserQuestionPromptCustomRow');

const singleQuestion: AskUserQuestionItem[] = [
  {
    question: 'Pick a color',
    multi_select: false,
    options: [{ label: 'Red' }, { label: 'Blue' }],
  },
];

const multiQuestion: AskUserQuestionItem[] = [
  {
    question: 'Pick multiple animals',
    multi_select: true,
    options: [{ label: 'Cat' }, { label: 'Dog' }, { label: 'Bird' }],
  },
];

const threeQuestions: AskUserQuestionItem[] = [
  {
    question: 'Q1: pick one',
    multi_select: false,
    options: [{ label: 'A' }, { label: 'B' }],
  },
  {
    question: 'Q2: pick many',
    multi_select: true,
    options: [{ label: 'X' }, { label: 'Y' }, { label: 'Z' }],
  },
  {
    question: 'Q3: pick one',
    multi_select: false,
    options: [{ label: 'P' }, { label: 'Q' }],
  },
];

describe('AskUserQuestionPrompt', () => {
  describe('Confirm gating', () => {
    it('Confirm is disabled until the current question is answered', async () => {
      renderWithProviders(
        <AskUserQuestionPrompt promptId="p1" questions={singleQuestion} onSubmit={jest.fn()} />
      );
      const confirm = screen.getByRole('button', { name: 'Submit' });
      expect(confirm).toBeDisabled();

      await userEvent.click(screen.getByLabelText('Red'));
      expect(confirm).toBeEnabled();
    });

    it('Confirm becomes enabled when only "Other" text is provided', async () => {
      renderWithProviders(
        <AskUserQuestionPrompt promptId="p1" questions={singleQuestion} onSubmit={jest.fn()} />
      );
      const confirm = screen.getByRole('button', { name: 'Submit' });
      expect(confirm).toBeDisabled();

      await userEvent.type(screen.getByRole('textbox'), 'magenta');
      expect(confirm).toBeEnabled();
    });
  });

  describe('single-select submission', () => {
    it('Confirm on the only question fires onSubmit with { choice: [N] }', async () => {
      const onSubmit = jest.fn();
      renderWithProviders(
        <AskUserQuestionPrompt promptId="p1" questions={singleQuestion} onSubmit={onSubmit} />
      );
      await userEvent.click(screen.getByLabelText('Blue'));
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
      expect(onSubmit).toHaveBeenCalledWith({
        answers: [{ choice: [1] }],
      } satisfies AskUserQuestionPromptResponse);
    });
  });

  describe('multi-select selection', () => {
    it('encodes multiple checked options as a sorted choice array', async () => {
      const onSubmit = jest.fn();
      renderWithProviders(
        <AskUserQuestionPrompt promptId="p1" questions={multiQuestion} onSubmit={onSubmit} />
      );
      await userEvent.click(screen.getByLabelText('Cat'));
      await userEvent.click(screen.getByLabelText('Bird'));
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
      expect(onSubmit).toHaveBeenCalledWith({
        answers: [{ choice: [0, 2] }],
      } satisfies AskUserQuestionPromptResponse);
    });

    it('combines choice + custom in multi-select mode', async () => {
      const onSubmit = jest.fn();
      renderWithProviders(
        <AskUserQuestionPrompt promptId="p1" questions={multiQuestion} onSubmit={onSubmit} />
      );
      await userEvent.click(screen.getByLabelText('Cat'));
      await userEvent.type(screen.getByRole('textbox'), 'Fish');
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
      expect(onSubmit).toHaveBeenCalledWith({
        answers: [{ choice: [0], custom: 'Fish' }],
      } satisfies AskUserQuestionPromptResponse);
    });

    it('drops custom from the payload when the "Other" checkbox is unchecked', async () => {
      const onSubmit = jest.fn();
      renderWithProviders(
        <AskUserQuestionPrompt promptId="p1" questions={multiQuestion} onSubmit={onSubmit} />
      );
      await userEvent.type(screen.getByRole('textbox'), 'Fish');
      await userEvent.click(screen.getByLabelText('Cat'));

      // explicitly uncheck the "Other" checkbox
      await userEvent.click(getCustomCheckable());

      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
      expect(onSubmit).toHaveBeenCalledWith({
        answers: [{ choice: [0] }],
      } satisfies AskUserQuestionPromptResponse);
    });
  });

  describe('custom option selection + validation', () => {
    it('shows an error and blocks submit when custom is selected but empty', async () => {
      const onSubmit = jest.fn();
      renderWithProviders(
        <AskUserQuestionPrompt promptId="p1" questions={singleQuestion} onSubmit={onSubmit} />
      );
      await userEvent.click(getCustomCheckable());
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

      expect(onSubmit).not.toHaveBeenCalled();
      expect(
        screen.getByText('Enter a response or choose a different option.')
      ).toBeInTheDocument();
    });

    it('clears the error and submits once text is entered', async () => {
      const onSubmit = jest.fn();
      renderWithProviders(
        <AskUserQuestionPrompt promptId="p1" questions={singleQuestion} onSubmit={onSubmit} />
      );
      await userEvent.click(getCustomCheckable());
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
      expect(
        screen.getByText('Enter a response or choose a different option.')
      ).toBeInTheDocument();

      await userEvent.type(screen.getByRole('textbox'), 'teal');
      expect(
        screen.queryByText('Enter a response or choose a different option.')
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
      expect(onSubmit).toHaveBeenCalledWith({
        answers: [{ custom: 'teal' }],
      } satisfies AskUserQuestionPromptResponse);
    });

    it('errors when the custom checkbox stays checked but its text is cleared (multi-select)', async () => {
      const onSubmit = jest.fn();
      renderWithProviders(
        <AskUserQuestionPrompt promptId="p1" questions={multiQuestion} onSubmit={onSubmit} />
      );
      const otherInput = screen.getByRole('textbox');
      await userEvent.type(otherInput, 'Fish');
      await userEvent.clear(otherInput);

      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
      expect(onSubmit).not.toHaveBeenCalled();
      expect(
        screen.getByText('Enter a response or choose a different option.')
      ).toBeInTheDocument();
    });
  });

  describe('single-select "Other" exclusivity', () => {
    it('typing into "Other" clears the predefined radio', async () => {
      const onSubmit = jest.fn();
      renderWithProviders(
        <AskUserQuestionPrompt promptId="p1" questions={singleQuestion} onSubmit={onSubmit} />
      );
      await userEvent.click(screen.getByLabelText('Red'));
      await userEvent.type(screen.getByRole('textbox'), 'green');
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
      expect(onSubmit).toHaveBeenCalledWith({
        answers: [{ custom: 'green' }],
      } satisfies AskUserQuestionPromptResponse);
    });

    it('clicking a predefined radio deselects custom but keeps its text', async () => {
      const onSubmit = jest.fn();
      renderWithProviders(
        <AskUserQuestionPrompt promptId="p1" questions={singleQuestion} onSubmit={onSubmit} />
      );
      const otherInput = screen.getByRole('textbox');
      await userEvent.type(otherInput, 'green');
      await userEvent.click(screen.getByLabelText('Blue'));

      // Text stays in the field even though custom is no longer the selected answer.
      expect(otherInput).toHaveValue('green');

      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
      expect(onSubmit).toHaveBeenCalledWith({
        answers: [{ choice: [1] }],
      } satisfies AskUserQuestionPromptResponse);
    });

    it('preserves the custom text across a deselect → reselect round-trip', async () => {
      const onSubmit = jest.fn();
      renderWithProviders(
        <AskUserQuestionPrompt promptId="p1" questions={singleQuestion} onSubmit={onSubmit} />
      );
      const otherInput = screen.getByRole('textbox');
      await userEvent.type(otherInput, 'green');
      // Switch away to a predefined option, then back to custom.
      await userEvent.click(screen.getByLabelText('Red'));
      await userEvent.click(getCustomCheckable());

      expect(otherInput).toHaveValue('green');
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
      expect(onSubmit).toHaveBeenCalledWith({
        answers: [{ custom: 'green' }],
      } satisfies AskUserQuestionPromptResponse);
    });
  });

  describe('Skip', () => {
    it('Skip on a non-final question advances and records { skipped: true }', async () => {
      const onSubmit = jest.fn();
      renderWithProviders(
        <AskUserQuestionPrompt promptId="p1" questions={threeQuestions} onSubmit={onSubmit} />
      );
      await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
      // advanced — Q2 visible
      expect(screen.getByRole('heading', { name: 'Q2: pick many' })).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('Skip on the final question submits immediately', async () => {
      const onSubmit = jest.fn();
      renderWithProviders(
        <AskUserQuestionPrompt promptId="p1" questions={singleQuestion} onSubmit={onSubmit} />
      );
      await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
      expect(onSubmit).toHaveBeenCalledWith({
        answers: [{ skipped: true }],
      } satisfies AskUserQuestionPromptResponse);
    });
  });

  describe('Back navigation', () => {
    it('returns to the previous question with its prior answer preserved', async () => {
      const onSubmit = jest.fn();
      renderWithProviders(
        <AskUserQuestionPrompt promptId="p1" questions={threeQuestions} onSubmit={onSubmit} />
      );
      // Q1: pick A and confirm → advance
      await userEvent.click(screen.getByLabelText('A'));
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      // Now on Q2 — Back becomes available
      await userEvent.click(screen.getByRole('button', { name: 'Back' }));
      // Q1 visible again with A still checked
      expect(screen.getByRole('heading', { name: 'Q1: pick one' })).toBeInTheDocument();
      expect(screen.getByLabelText('A')).toBeChecked();
    });
  });

  describe('Confirm advance vs submit', () => {
    it('Confirm on a non-final question advances without calling onSubmit', async () => {
      const onSubmit = jest.fn();
      renderWithProviders(
        <AskUserQuestionPrompt promptId="p1" questions={threeQuestions} onSubmit={onSubmit} />
      );
      await userEvent.click(screen.getByLabelText('A'));
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByRole('heading', { name: 'Q2: pick many' })).toBeInTheDocument();
    });

    it('Confirm on the final question submits the assembled answers array', async () => {
      const onSubmit = jest.fn();
      renderWithProviders(
        <AskUserQuestionPrompt promptId="p1" questions={threeQuestions} onSubmit={onSubmit} />
      );
      // Q1: A
      await userEvent.click(screen.getByLabelText('A'));
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      // Q2: skip
      await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
      // Q3: custom text
      await userEvent.type(screen.getByRole('textbox'), 'free text');
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

      expect(onSubmit).toHaveBeenCalledWith({
        answers: [{ choice: [0] }, { skipped: true }, { custom: 'free text' }],
      } satisfies AskUserQuestionPromptResponse);
    });
  });
});
