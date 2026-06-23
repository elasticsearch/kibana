/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { screen, fireEvent } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { useLocalStorage } from './use_local_storage';

describe('useLocalStorage', () => {
  const KEY = 'fields';

  const TestComponent = () => {
    const [fields, setFields] = useLocalStorage(KEY, {
      options: ['foo', 'bar', 'baz'],
    });
    return (
      <div>
        <button
          id="change"
          data-test-subj="change"
          onClick={() => {
            setFields({
              options: ['big', 'new', 'values'],
            });
          }}
        />
        {fields?.options?.join(', ')}
      </div>
    );
  };

  beforeEach(() => {
    global.localStorage.clear();
    jest.clearAllMocks();
  });

  it('will read state from localStorage on init if values already exist', () => {
    global.localStorage.setItem(
      KEY,
      JSON.stringify({
        options: ['some', 'old', 'values'],
      })
    );
    renderWithKibanaRenderContext(<TestComponent />);
    expect(screen.getByText('some, old, values')).toBeInTheDocument();
  });

  it('will ignore non-JSON values in localStorage', () => {
    global.localStorage.setItem(KEY, 'blah blah blah');
    renderWithKibanaRenderContext(<TestComponent />);
    expect(screen.getByText('foo, bar, baz')).toBeInTheDocument();
    expect(global.localStorage.getItem(KEY)).toBe('{"options":["foo","bar","baz"]}');
  });

  it('if will use provided default values if state does not already exist in localStorage', () => {
    renderWithKibanaRenderContext(<TestComponent />);
    expect(screen.getByText('foo, bar, baz')).toBeInTheDocument();
    expect(global.localStorage.getItem(KEY)).toBe('{"options":["foo","bar","baz"]}');
  });

  it('state can be updated with new values', () => {
    renderWithKibanaRenderContext(<TestComponent />);
    fireEvent.click(screen.getByTestId('change'));
    expect(screen.getByText('big, new, values')).toBeInTheDocument();
    expect(global.localStorage.getItem(KEY)).toBe('{"options":["big","new","values"]}');
  });
});
