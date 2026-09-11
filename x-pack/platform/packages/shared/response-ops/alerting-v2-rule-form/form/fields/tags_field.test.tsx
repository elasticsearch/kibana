/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFormContext } from 'react-hook-form';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { ALERTING_V2_RULE_API_PATH } from '@kbn/alerting-v2-constants';
import type { RuleFormMeta } from '../contexts';
import type { FormValues } from '../types';
import { TagsField, validateTags } from './tags_field';
import { createFormWrapper, createMockServices } from '../../test_utils';

const TAGS_PATH = `${ALERTING_V2_RULE_API_PATH}/tags`;

const formWithTags = (tags: string[]): Partial<FormValues> => ({
  metadata: { name: 'Test Rule', enabled: true, tags },
});

const createServices = (responses: string[][] = [[]]) => {
  const http = httpServiceMock.createStartContract();
  if (responses.length === 1) {
    http.get.mockResolvedValue({ tags: responses[0] });
  } else {
    for (const tags of responses) {
      http.get.mockResolvedValueOnce({ tags });
    }
  }
  return { ...createMockServices(), http };
};

const SubmitButton = () => {
  const { handleSubmit } = useFormContext();
  return (
    <button type="button" onClick={handleSubmit(() => {})} data-test-subj="submitButton">
      Submit
    </button>
  );
};

const selectedTagPills = () =>
  screen
    .queryAllByTestId('euiComboBoxPill')
    .map((pill) => pill.getAttribute('title') ?? pill.textContent);

const renderTagsField = ({
  values,
  suggestions = [[]],
  layout = 'page',
  withSubmit = false,
}: {
  values?: Partial<FormValues>;
  suggestions?: string[][];
  layout?: RuleFormMeta['layout'];
  withSubmit?: boolean;
} = {}) => {
  const services = createServices(suggestions);
  render(
    <>
      <TagsField />
      {withSubmit ? <SubmitButton /> : null}
    </>,
    { wrapper: createFormWrapper(values, services, { layout }) }
  );
  return { services };
};

describe('validateTags', () => {
  it('passes when tags are undefined or empty', () => {
    expect(validateTags(undefined)).toBe(true);
    expect(validateTags([])).toBe(true);
  });

  it('passes when a tag is exactly at the length limit', () => {
    expect(validateTags(['a'.repeat(128)])).toBe(true);
  });

  it('fails when a tag exceeds the length limit', () => {
    expect(validateTags(['a'.repeat(129)])).toBe('Each tag must be no longer than 128 characters.');
  });

  it('passes when exactly at the tag count limit', () => {
    expect(validateTags(Array.from({ length: 20 }, (_, i) => `tag-${i}`))).toBe(true);
  });

  it('fails when the tag count exceeds the limit', () => {
    expect(validateTags(Array.from({ length: 21 }, (_, i) => `tag-${i}`))).toBe(
      'You can add up to 20 tags.'
    );
  });

  it('reports the length error before the count error', () => {
    const tags = Array.from({ length: 21 }, (_, i) => `tag-${i}`);
    tags[0] = 'a'.repeat(129);
    expect(validateTags(tags)).toBe('Each tag must be no longer than 128 characters.');
  });
});

jest.setTimeout(20_000);

describe('TagsField', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the tags label and optional text', () => {
    renderTagsField();

    expect(screen.getByText('Tags')).toBeInTheDocument();
    expect(screen.getByText('optional')).toBeInTheDocument();
  });

  it('renders the combo box', () => {
    renderTagsField();

    expect(screen.getByTestId('ruleTagsInput')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders existing tags as selected options', () => {
    renderTagsField({ values: formWithTags(['prod', 'critical']) });

    expect(selectedTagPills()).toEqual(['prod', 'critical']);
  });

  it('renders correctly in flyout layout', () => {
    renderTagsField({ layout: 'flyout' });

    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('fetches popular tags on mount and shows them as suggestions', async () => {
    const user = userEvent.setup();
    const { services } = renderTagsField({ suggestions: [['cpu', 'memory']] });

    await waitFor(() => {
      expect(services.http.get).toHaveBeenCalledWith(TAGS_PATH, {
        query: { search: undefined },
      });
    });

    await user.click(screen.getByRole('combobox'));

    expect(await screen.findByText('cpu')).toBeInTheDocument();
    expect(screen.getByText('memory')).toBeInTheDocument();
  });

  it('requests prefix-matched tags after the user types', async () => {
    const user = userEvent.setup();
    const { services } = renderTagsField({
      suggestions: [['cpu', 'memory'], ['tagAlpha']],
    });

    await waitFor(() => {
      expect(services.http.get).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'tagA');

    await waitFor(() => {
      expect(services.http.get).toHaveBeenCalledWith(TAGS_PATH, {
        query: { search: 'tagA' },
      });
    });

    expect(await screen.findByText('tagAlpha')).toBeInTheDocument();
  });

  it('selects a suggested tag from another rule', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderTagsField({ suggestions: [['tagA']] });

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText('tagA'));

    expect(selectedTagPills()).toEqual(['tagA']);
  });

  it('allows creating a new tag', async () => {
    const user = userEvent.setup();
    renderTagsField();

    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'new-tag');
    await user.keyboard('{Enter}');

    expect(selectedTagPills()).toEqual(['new-tag']);
  });

  it('trims custom tags and ignores duplicates', async () => {
    const user = userEvent.setup();
    renderTagsField({ values: formWithTags(['prod']) });

    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), '  prod  ');
    await user.keyboard('{Enter}');

    expect(selectedTagPills()).toEqual(['prod']);
  });

  it('shows validation error on submit after selecting a 21st suggested tag', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderTagsField({
      values: formWithTags(Array.from({ length: 20 }, (_, i) => `tag-${i}`)),
      suggestions: [['extra-tag']],
      withSubmit: true,
    });

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText('extra-tag'));

    expect(selectedTagPills()).toContain('extra-tag');

    await user.click(screen.getByTestId('submitButton'));

    expect(await screen.findByText('You can add up to 20 tags.')).toBeInTheDocument();
  });

  it('shows validation error on submit when more than 20 tags are added', async () => {
    const user = userEvent.setup();
    renderTagsField({
      values: formWithTags(Array.from({ length: 21 }, (_, i) => `tag-${i}`)),
      withSubmit: true,
    });

    await user.click(screen.getByTestId('submitButton'));

    expect(await screen.findByText('You can add up to 20 tags.')).toBeInTheDocument();
  });

  it('passes validation when exactly 20 tags are added', async () => {
    const user = userEvent.setup();
    renderTagsField({
      values: formWithTags(Array.from({ length: 20 }, (_, i) => `tag-${i}`)),
      withSubmit: true,
    });

    await user.click(screen.getByTestId('submitButton'));

    await waitFor(() => {
      expect(screen.queryByText('You can add up to 20 tags.')).not.toBeInTheDocument();
    });
  });
});
