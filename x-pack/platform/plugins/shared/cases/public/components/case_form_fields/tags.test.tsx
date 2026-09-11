/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC, PropsWithChildren } from 'react';
import React from 'react';
import { waitFor, screen } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';

import type { FormHook } from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import { useForm, Form } from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import { Tags } from './tags';
import { schema } from '../create/schema';

import { TestProviders, renderWithTestingProviders } from '../../common/mock';
import { useGetTags } from '../../containers/use_get_tags';
import { MAX_LENGTH_PER_TAG } from '../../../common/constants';
import type { CaseFormFieldsSchemaProps } from './schema';

jest.mock('../../common/lib/kibana');
jest.mock('../../containers/use_get_tags');

const useGetTagsMock = useGetTags as jest.Mock;

describe('Tags', () => {
  let globalForm: FormHook;
  let user: UserEvent;

  const MockHookWrapperComponent: FC<PropsWithChildren<unknown>> = ({ children }) => {
    const { form } = useForm<CaseFormFieldsSchemaProps>({
      defaultValue: { tags: [] },
      schema: {
        tags: schema.tags,
      },
    });

    globalForm = form;

    return (
      <TestProviders>
        <Form form={form}>{children}</Form>
      </TestProviders>
    );
  };

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    useGetTagsMock.mockReturnValue({ data: ['test'] });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('it renders', async () => {
    renderWithTestingProviders(
      <MockHookWrapperComponent>
        <Tags isLoading={false} />
      </MockHookWrapperComponent>
    );

    await waitFor(() => {
      expect(screen.getByTestId('caseTags')).toBeInTheDocument();
    });
  });

  it('it changes the tags', async () => {
    renderWithTestingProviders(
      <MockHookWrapperComponent>
        <Tags isLoading={false} />
      </MockHookWrapperComponent>
    );

    await user.click(screen.getByRole('combobox'));
    await user.paste('test');
    await user.keyboard('{enter}');
    await user.paste('case');
    await user.keyboard('{enter}');

    expect(await screen.findByTitle('test')).toBeInTheDocument();
    expect(await screen.findByTitle('case')).toBeInTheDocument();
    expect(globalForm.getFormData()).toEqual({ tags: ['test', 'case'] });
  });

  it('it shows error when tag is empty', async () => {
    renderWithTestingProviders(
      <MockHookWrapperComponent>
        <Tags isLoading={false} />
      </MockHookWrapperComponent>
    );

    await user.click(screen.getByRole('combobox'));
    await user.paste(' ');
    await user.keyboard('{enter}');

    expect(
      await screen.findByText('A tag must contain at least one non-space character.')
    ).toBeInTheDocument();
  });

  it('it shows error when tag is too long', async () => {
    const longTag = 'z'.repeat(MAX_LENGTH_PER_TAG + 1);

    renderWithTestingProviders(
      <MockHookWrapperComponent>
        <Tags isLoading={false} />
      </MockHookWrapperComponent>
    );

    await user.click(screen.getByRole('combobox'));
    await user.paste(`${longTag}`);
    await user.keyboard('{enter}');

    await waitFor(() => {
      expect(
        screen.getByText('The length of the tag is too long. The maximum length is 256 characters.')
      );
    });
  });
});
