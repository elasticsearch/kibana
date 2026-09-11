/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ComponentProps } from 'react';
import React, { Profiler, useImperativeHandle, useRef, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createRestorableStateProvider,
  type RestorableStateProviderApi,
} from './restorable_state_provider';

const mockCustomLocalStorageKey = 'test-restorable-state';
let mockStoredValue: string | undefined;

// mock localStorage
jest.mock('@kbn/kibana-utils-plugin/public', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    get: jest.fn((key) => {
      if (key !== mockCustomLocalStorageKey) {
        throw new Error(`Unexpected key: ${key}`);
      }
      return mockStoredValue !== undefined ? JSON.parse(mockStoredValue) : undefined;
    }),
    set: jest.fn((key, value) => {
      if (key !== mockCustomLocalStorageKey) {
        throw new Error(`Unexpected key: ${key}`);
      }
      mockStoredValue = JSON.stringify(value);
    }),
  })),
}));

interface RestorableState {
  count?: number;
  message?: string;
  anotherMessage?: string;
}

describe('createRestorableStateProvider', () => {
  beforeEach(() => {
    mockStoredValue = undefined; // Reset mock storage before each test
  });

  it('withRestorableState should work correctly', async () => {
    const { withRestorableState, useRestorableState } =
      createRestorableStateProvider<RestorableState>();

    const MockChildComponent = () => {
      const [message, setMessage] = useRestorableState('message', 'Hello');
      const [count, setCount] = useRestorableState('count', 0);
      return (
        <button
          data-test-subj="message-button"
          onClick={() => {
            setMessage((value) => `${value} World`);
            setCount((value) => (value || 0) + 1);
          }}
        >
          {message} - {count || 0}
        </button>
      );
    };

    const MockParentComponent = () => {
      const [anotherMessage, setAnotherMessage] = useRestorableState('anotherMessage', '+');
      return (
        <div>
          <MockChildComponent />
          <button
            data-test-subj="another-message-button"
            onClick={() => {
              setAnotherMessage((value) => `${value}+`);
            }}
          >
            {anotherMessage}
          </button>
        </div>
      );
    };

    const WrappedComponent = withRestorableState(MockParentComponent);

    let mockStoredState: RestorableState | undefined;
    const props: ComponentProps<typeof WrappedComponent> = {
      initialState: undefined,
      onInitialStateChange: jest.fn((state) => {
        mockStoredState = state;
      }),
    };

    render(<WrappedComponent {...props} />);

    const button = screen.getByTestId('message-button');
    expect(button).toHaveTextContent('Hello');
    expect(props.onInitialStateChange).not.toHaveBeenCalled();
    await userEvent.click(button);
    await userEvent.click(button);
    expect(button).toHaveTextContent('Hello World World - 2');
    expect(props.onInitialStateChange).toHaveBeenCalledTimes(4);
    expect(mockStoredState).toEqual({ message: 'Hello World World', count: 2 });

    const anotherButton = screen.getByTestId('another-message-button');
    expect(anotherButton).toHaveTextContent('+');
    await userEvent.click(anotherButton);
    expect(anotherButton).toHaveTextContent('++');
    expect(props.onInitialStateChange).toHaveBeenCalledTimes(5);
    expect(mockStoredState).toEqual({
      message: 'Hello World World',
      count: 2,
      anotherMessage: '++',
    });

    const propsWithSavedState: ComponentProps<typeof WrappedComponent> = {
      initialState: { message: 'Hi', anotherMessage: '---' },
      onInitialStateChange: jest.fn((state) => {
        mockStoredState = state;
      }),
    };

    render(<WrappedComponent {...propsWithSavedState} />);
    expect(screen.getAllByTestId('message-button')[1]).toHaveTextContent('Hi - 0');
    expect(screen.getAllByTestId('another-message-button')[1]).toHaveTextContent('---');
  });

  it('withRestorableState should preserve the ref of the wrapped component', () => {
    const { withRestorableState } = createRestorableStateProvider<RestorableState>();

    interface CustomRef {
      someMethod: () => null;
    }
    const ComponentWithRef = React.forwardRef<CustomRef>((props, ref) => {
      useImperativeHandle(ref, () => ({
        someMethod: () => null,
      }));
      return <div>Hello</div>;
    });

    const WrappedComponent = withRestorableState(ComponentWithRef);
    const ref = React.createRef<CustomRef & RestorableStateProviderApi>();
    render(<WrappedComponent ref={ref} initialState={{}} onInitialStateChange={() => {}} />);
    expect(ref.current?.someMethod).toBeDefined();
  });

  it('useRestorableRef should work correctly', async () => {
    const { withRestorableState, useRestorableRef } =
      createRestorableStateProvider<RestorableState>();

    const MockChildComponent = () => {
      const countRef = useRestorableRef('count', 0);
      return (
        <button
          data-test-subj="count-button"
          onClick={() => {
            countRef.current = (countRef.current || 0) + 1;
          }}
        >
          {countRef.current || 0}
        </button>
      );
    };

    const MockParentComponent = () => {
      const [isVisible, setIsVisible] = useState(true);
      return (
        <div>
          {isVisible && <MockChildComponent />}
          <button onClick={() => setIsVisible(false)}>Hide</button>
        </div>
      );
    };

    const WrappedComponent = withRestorableState(MockParentComponent);

    let mockStoredState: RestorableState | undefined;
    const props: ComponentProps<typeof WrappedComponent> = {
      initialState: undefined,
      onInitialStateChange: jest.fn((state) => {
        mockStoredState = state;
      }),
    };

    render(<WrappedComponent {...props} />);

    const button = screen.getByTestId('count-button');
    expect(button).toHaveTextContent('0');
    expect(props.onInitialStateChange).not.toHaveBeenCalled();
    await userEvent.click(button);
    await userEvent.click(button);
    await userEvent.click(button);
    expect(props.onInitialStateChange).not.toHaveBeenCalled();

    await userEvent.click(screen.getByText('Hide'));
    expect(props.onInitialStateChange).toHaveBeenCalled();
    expect(mockStoredState).toEqual({ count: 3 });

    render(<WrappedComponent {...props} initialState={{ count: 5 }} />);
    expect(screen.getByTestId('count-button')).toHaveTextContent('5');
  });

  it('useRestorableLocalStorage should work correctly', async () => {
    const { useRestorableLocalStorage } = createRestorableStateProvider<RestorableState>();

    const MockComponent = () => {
      const [message, setMessage] = useRestorableLocalStorage(
        'message',
        mockCustomLocalStorageKey,
        'Hello'
      );
      return (
        <button
          data-test-subj="local-storage-button"
          onClick={() => {
            setMessage((value) => `${value} World`);
          }}
        >
          {message}
        </button>
      );
    };

    expect(mockStoredValue).toBeUndefined();
    render(<MockComponent />);

    const button = screen.getByTestId('local-storage-button');
    expect(button).toHaveTextContent('Hello');
    await userEvent.click(button);
    expect(button).toHaveTextContent('Hello World');
    await waitFor(() => {
      expect(mockStoredValue).toBe(JSON.stringify('Hello World'));
    });

    // Simulate a page reload
    render(<MockComponent />);
    expect(screen.getAllByTestId('local-storage-button')[1]).toHaveTextContent('Hello World');
    await waitFor(() => {
      expect(mockStoredValue).toBe(JSON.stringify('Hello World'));
    });

    // Reset the localStorage value
    mockStoredValue = undefined;
    render(<MockComponent />);
    expect(screen.getAllByTestId('local-storage-button')[2]).toHaveTextContent('Hello');
    await waitFor(() => {
      expect(mockStoredValue).toBeUndefined();
    });
  });

  it('batches persistence with the state update', () => {
    const { withRestorableState, useRestorableState } =
      createRestorableStateProvider<RestorableState>();

    const renderCounts = {
      commits: 0,
      childRenders: 0,
    };

    const Child = () => {
      renderCounts.childRenders += 1;
      const [message, setMessage] = useRestorableState('message', 'Hello');

      return (
        <button data-test-subj="batched-button" onClick={() => setMessage('Hello World')}>
          {message}
        </button>
      );
    };

    const WrappedChild = withRestorableState(Child);

    const Harness = () => {
      const [initialState, setInitialState] = useState<RestorableState | undefined>(undefined);
      const mountedRef = useRef(false);

      return (
        <Profiler
          id="restorable-state"
          onRender={() => {
            if (mountedRef.current) {
              renderCounts.commits += 1;
            } else {
              mountedRef.current = true;
            }
          }}
        >
          <WrappedChild initialState={initialState} onInitialStateChange={setInitialState} />
        </Profiler>
      );
    };

    render(<Harness />);

    expect(renderCounts.childRenders).toBe(1);

    fireEvent.click(screen.getByTestId('batched-button'));

    expect(screen.getByTestId('batched-button')).toHaveTextContent('Hello World');
    expect(renderCounts.childRenders).toBe(2);
    expect(renderCounts.commits).toBe(1);
  });

  it('useRestorableStateValue reflects updates made by another consumer', async () => {
    const { withRestorableState, useRestorableState, useRestorableStateValue } =
      createRestorableStateProvider<RestorableState>();

    const Child = () => {
      const [, setCount] = useRestorableState('count', 0);
      return (
        <button
          data-test-subj="value-child-button"
          onClick={() => setCount((prev) => (prev ?? 0) + 1)}
        >
          increment
        </button>
      );
    };

    const Parent = () => {
      const count = useRestorableStateValue('count');
      return (
        <>
          <div data-test-subj="value-observer">count: {count ?? 'unset'}</div>
          <Child />
        </>
      );
    };

    const WrappedParent = withRestorableState(Parent);
    render(<WrappedParent />);

    expect(screen.getByTestId('value-observer')).toHaveTextContent('count: unset');

    await userEvent.click(screen.getByTestId('value-child-button'));
    expect(screen.getByTestId('value-observer')).toHaveTextContent('count: 1');

    await userEvent.click(screen.getByTestId('value-child-button'));
    expect(screen.getByTestId('value-observer')).toHaveTextContent('count: 2');
  });
});
