/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render, renderHook } from '@testing-library/react';
import React from 'react';
import type { UseCreateFieldButtonProps } from '.';
import { useCreateFieldButton } from '.';

import { TestProviders } from '../../../../common/mock';

const mockOpenFieldEditor = jest.fn();
const mockOnHide = jest.fn();

const renderUseCreateFieldButton = (props: Partial<UseCreateFieldButtonProps> = {}) =>
  renderHook(
    () =>
      useCreateFieldButton({
        isAllowed: true,
        loading: false,
        openFieldEditor: mockOpenFieldEditor,
        ...props,
      }),
    {
      wrapper: TestProviders,
    }
  );

describe('useCreateFieldButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return the button component function when user has edit permissions', async () => {
    const { result } = renderUseCreateFieldButton();
    expect(result.current).not.toBeUndefined();
  });

  it('should return the undefined when user do not has edit permissions', async () => {
    const { result } = renderUseCreateFieldButton({ isAllowed: false });
    expect(result.current).toBeUndefined();
  });

  it('should return a button wrapped component', async () => {
    const { result } = renderUseCreateFieldButton();

    const CreateFieldButton = result.current!;
    const { getByTestId } = render(<CreateFieldButton onHide={mockOnHide} />, {
      wrapper: TestProviders,
    });

    expect(getByTestId('create-field')).toBeInTheDocument();
  });

  it('should call openFieldEditor and hide the modal when button clicked', async () => {
    const { result } = renderUseCreateFieldButton();

    const CreateFieldButton = result.current!;
    const { getByTestId } = render(<CreateFieldButton onHide={mockOnHide} />, {
      wrapper: TestProviders,
    });

    getByTestId('create-field').click();
    expect(mockOpenFieldEditor).toHaveBeenCalled();
    expect(mockOnHide).toHaveBeenCalled();
  });
});
