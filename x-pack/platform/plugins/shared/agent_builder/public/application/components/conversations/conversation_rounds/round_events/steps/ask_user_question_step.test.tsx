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
import { createAskUserQuestionStep } from '@kbn/agent-builder-common/chat/conversation';
import type { AskUserQuestionAnswer } from '@kbn/agent-builder-common/agents';
import { AskUserQuestionStepEvent } from './ask_user_question_step';

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <I18nProvider>
      <EuiProvider>{ui}</EuiProvider>
    </I18nProvider>
  );

const makeStep = (answers?: AskUserQuestionAnswer[]) =>
  createAskUserQuestionStep({
    prompt_id: 'p1',
    questions: [
      {
        question: 'Pick a color',
        multi_select: false,
        options: [{ label: 'Red' }, { label: 'Blue' }],
      },
      {
        question: 'Pick sizes',
        multi_select: true,
        options: [{ label: 'S' }, { label: 'M' }, { label: 'L' }],
      },
      { question: 'Any notes?', multi_select: false, options: [{ label: 'Yes' }, { label: 'No' }] },
    ],
    answers,
  });

describe('AskUserQuestionStepEvent', () => {
  it('renders "Clarification • 2 answered, 1 skipped" and flyout is not open by default', () => {
    renderWithProviders(
      <AskUserQuestionStepEvent
        step={makeStep([{ choice: [0] }, { choice: [0] }, { skipped: true }])}
      />
    );
    expect(screen.getByText('Clarification • 2 answered, 1 skipped')).toBeInTheDocument();
    expect(screen.queryByText('Pick a color')).not.toBeInTheDocument();
  });

  it('returns null when answers are not defined', () => {
    const { container } = renderWithProviders(
      <AskUserQuestionStepEvent step={makeStep(undefined)} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('opens flyout on click and shows question text', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AskUserQuestionStepEvent
        step={makeStep([{ choice: [0] }, { choice: [0, 1] }, { skipped: true }])}
      />
    );
    await user.click(screen.getByText('Clarification • 2 answered, 1 skipped'));
    expect(screen.getByText('Pick a color')).toBeInTheDocument();
    expect(screen.getByText('Clarification')).toBeInTheDocument();
  });

  it('closes flyout when close button is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AskUserQuestionStepEvent
        step={makeStep([{ choice: [0] }, { choice: [0] }, { skipped: true }])}
      />
    );
    await user.click(screen.getByText('Clarification • 2 answered, 1 skipped'));
    expect(screen.getByText('Pick a color')).toBeInTheDocument();
    await user.click(screen.getByTestId('euiFlyoutCloseButton'));
    expect(screen.queryByText('Pick a color')).not.toBeInTheDocument();
  });

  describe('answer variants (in flyout)', () => {
    const openFlyout = async (answers: AskUserQuestionAnswer[]) => {
      const user = userEvent.setup();
      const skipped = answers.filter((a) => a.skipped).length;
      const answered = answers.filter((a) => !a.skipped).length;
      const step = createAskUserQuestionStep({
        prompt_id: 'p1',
        questions: [
          {
            question: 'Q1',
            multi_select: false,
            options: [{ label: 'Opt A' }, { label: 'Opt B' }],
          },
        ],
        answers,
      });
      renderWithProviders(<AskUserQuestionStepEvent step={step} />);
      const label =
        skipped > 0
          ? `Clarification • ${answered} answered, ${skipped} skipped`
          : `Clarification • ${answered} answered`;
      await user.click(screen.getByText(label));
      return user;
    };

    it('choice only — shows option label', async () => {
      await openFlyout([{ choice: [0] }]);
      expect(screen.getByText('Opt A')).toBeInTheDocument();
    });

    it('custom only — shows "Custom" subdued label and typed text', async () => {
      const user = userEvent.setup();
      const step = createAskUserQuestionStep({
        prompt_id: 'p1',
        questions: [{ question: 'Q1', multi_select: false, options: [{ label: 'Opt A' }] }],
        answers: [{ custom: 'my answer' }],
      });
      renderWithProviders(<AskUserQuestionStepEvent step={step} />);
      await user.click(screen.getByText('Clarification • 1 answered'));
      expect(screen.getByText(/Custom/)).toBeInTheDocument();
      expect(screen.getByText(/my answer/)).toBeInTheDocument();
    });

    it('choice + custom — shows choice label with "Custom" badge, no separate custom text', async () => {
      const user = userEvent.setup();
      const step = createAskUserQuestionStep({
        prompt_id: 'p1',
        questions: [
          { question: 'Q1', multi_select: true, options: [{ label: 'Opt A' }, { label: 'Opt B' }] },
        ],
        answers: [{ choice: [0, 1], custom: 'extra' }],
      });
      renderWithProviders(<AskUserQuestionStepEvent step={step} />);
      await user.click(screen.getByText('Clarification • 1 answered'));
      expect(screen.getByText(/Opt A, Opt B/)).toBeInTheDocument();
      expect(screen.getByText(/Custom/)).toBeInTheDocument();
      expect(screen.queryByText('extra')).not.toBeInTheDocument();
    });

    it('skipped — shows italic "Skipped" below question heading', async () => {
      await openFlyout([{ skipped: true }]);
      expect(screen.getByText('Skipped')).toBeInTheDocument();
    });

    it('all-skipped — shows italic "Skipped" for each question', async () => {
      const user = userEvent.setup();
      const step = createAskUserQuestionStep({
        prompt_id: 'p1',
        questions: [
          { question: 'Q1', multi_select: false, options: [{ label: 'A' }] },
          { question: 'Q2', multi_select: false, options: [{ label: 'B' }] },
        ],
        answers: [{ skipped: true }, { skipped: true }],
      });
      renderWithProviders(<AskUserQuestionStepEvent step={step} />);
      await user.click(screen.getByText('Clarification • 0 answered, 2 skipped'));
      expect(screen.getAllByText('Skipped')).toHaveLength(2);
    });
  });
});
