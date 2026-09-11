/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PropsWithChildren, SetStateAction, Dispatch } from 'react';
import React, {
  useContext,
  useState,
  useRef,
  createContext,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useEffect,
  type ComponentProps,
} from 'react';
import useLatest from 'react-use/lib/useLatest';
import useUnmount from 'react-use/lib/useUnmount';
import useMount from 'react-use/lib/useMount';
import { BehaviorSubject, Subject, map } from 'rxjs';
import { Storage } from '@kbn/kibana-utils-plugin/public';

const storage = new Storage(localStorage);

export interface RestorableStateProviderProps<TState extends object> {
  /** Previously persisted state to restore on mount */
  initialState?: Partial<TState>;
  /** Called whenever the restorable state changes, allowing the host to persist it */
  onInitialStateChange?: (initialState: Partial<TState>) => void;
}

export interface RestorableStateProviderApi {
  refreshInitialState: () => void;
}

type RestorableStateContext<TState extends object> = Pick<
  RestorableStateProviderProps<TState>,
  'onInitialStateChange'
> & {
  initialState$: BehaviorSubject<Partial<TState> | undefined>;
  initialStateRefresh$: Subject<Partial<TState> | undefined>;
};

type InitialValue<TState extends object, TKey extends keyof TState> =
  | TState[TKey]
  | (() => TState[TKey]);

type ShouldIgnoredRestoredValue<TState extends object, TKey extends keyof TState> = (
  restoredValue: TState[TKey]
) => boolean;

export const createRestorableStateProvider = <TState extends object>() => {
  const context = createContext<RestorableStateContext<TState>>({
    initialState$: new BehaviorSubject<Partial<TState> | undefined>(undefined),
    initialStateRefresh$: new Subject<Partial<TState> | undefined>(),
    onInitialStateChange: undefined,
  });

  const RestorableStateProvider = forwardRef<
    RestorableStateProviderApi,
    PropsWithChildren<RestorableStateProviderProps<TState>>
  >(function RestorableStateProvider(
    { initialState, onInitialStateChange: currentOnInitialStateChange, children },
    ref
  ) {
    const latestInitialState = useLatest(initialState);
    const [initialState$] = useState(() => new BehaviorSubject(latestInitialState.current));
    const [initialStateRefresh$] = useState(() => new Subject<Partial<TState> | undefined>());
    const onInitialStateChange = useStableFunction((newInitialState: Partial<TState>) => {
      initialState$.next(newInitialState);
      currentOnInitialStateChange?.(newInitialState);
    });

    useImperativeHandle(
      ref,
      () => ({
        refreshInitialState: () => {
          initialState$.next(latestInitialState.current);
          initialStateRefresh$.next(initialState$.getValue());
        },
      }),
      [initialState$, initialStateRefresh$, latestInitialState]
    );

    const value = useMemo<RestorableStateContext<TState>>(
      () => ({
        initialState$,
        initialStateRefresh$,
        onInitialStateChange,
      }),
      [initialState$, initialStateRefresh$, onInitialStateChange]
    );

    return <context.Provider value={value}>{children}</context.Provider>;
  });

  const withRestorableState = <TComponent extends React.ComponentType<any>>(
    Component: TComponent
  ) => {
    const ComponentMemoized = React.memo(Component);
    type TProps = ComponentProps<typeof ComponentMemoized>;
    type TRef = React.ElementRef<TComponent>;

    return forwardRef<
      TRef & RestorableStateProviderApi,
      TProps & Pick<RestorableStateProviderProps<TState>, 'initialState' | 'onInitialStateChange'>
    >(function RestorableStateProviderHOC({ initialState, onInitialStateChange, ...props }, ref) {
      const restorableStateProviderRef = useRef<RestorableStateProviderApi>(null);
      const componentRef = useRef<TRef>(null);

      useImperativeHandle(
        ref,
        () =>
          ({
            ...(componentRef.current || {}),
            ...(restorableStateProviderRef.current || {}),
          } as TRef & RestorableStateProviderApi)
      );

      // Function components cannot forward refs and show a warning if you try to do so.
      // When a component is a class component or a forwardRef component, we can safely forward the ref.
      const canForwardRef =
        typeof Component !== 'function' || Component.prototype?.isReactComponent;

      const componentProps = {
        ...props,
        ...(canForwardRef ? { ref: componentRef } : {}),
      } as TProps;

      return (
        <RestorableStateProvider
          ref={restorableStateProviderRef}
          initialState={initialState}
          onInitialStateChange={onInitialStateChange}
        >
          <ComponentMemoized {...componentProps} />
        </RestorableStateProvider>
      );
    });
  };

  const getInitialValue = <TKey extends keyof TState>(
    initialState: Partial<TState> | undefined,
    key: TKey,
    initialValue: InitialValue<TState, TKey>,
    shouldIgnoredRestoredValue?: ShouldIgnoredRestoredValue<TState, TKey>
  ): TState[TKey] => {
    if (
      initialState &&
      key in initialState &&
      !shouldIgnoredRestoredValue?.(initialState[key] as TState[TKey])
    ) {
      return initialState[key] as TState[TKey];
    }
    if (typeof initialValue === 'function') {
      return (initialValue as () => TState[TKey])();
    }
    return initialValue;
  };

  const useInitialStateRefresh = <TKey extends keyof TState>(
    key: TKey,
    initialValue: InitialValue<TState, TKey>,
    refreshValue: Dispatch<TState[TKey]>,
    shouldIgnoredRestoredValue?: ShouldIgnoredRestoredValue<TState, TKey>
  ) => {
    const { initialStateRefresh$ } = useContext(context);
    const latestInitialValue = useLatest(initialValue);
    const latestShouldIgnoredRestoredValue = useLatest(shouldIgnoredRestoredValue);
    const stableRefreshValue = useStableFunction(refreshValue);

    useEffect(() => {
      const subscription = initialStateRefresh$
        .pipe(
          map((initialState) =>
            getInitialValue(
              initialState,
              key,
              latestInitialValue.current,
              latestShouldIgnoredRestoredValue.current
            )
          )
        )
        .subscribe(stableRefreshValue);

      return () => {
        subscription.unsubscribe();
      };
    }, [
      initialStateRefresh$,
      key,
      latestShouldIgnoredRestoredValue,
      latestInitialValue,
      stableRefreshValue,
    ]);
  };

  const useRestorableState = <TKey extends keyof TState>(
    key: TKey,
    initialValue: InitialValue<TState, TKey>,
    options?: {
      shouldIgnoredRestoredValue?: ShouldIgnoredRestoredValue<TState, TKey>;
      shouldStoreDefaultValueRightAway?: boolean;
    }
  ) => {
    const { shouldIgnoredRestoredValue, shouldStoreDefaultValueRightAway } = options || {};
    const { initialState$, onInitialStateChange } = useContext(context);
    const [value, _setValue] = useState(() =>
      getInitialValue(initialState$.getValue(), key, initialValue, shouldIgnoredRestoredValue)
    );
    const valueRef = useRef(value);

    const setValue = useStableFunction<Dispatch<SetStateAction<TState[TKey]>>>((newValue) => {
      const prevValue = valueRef.current;
      const nextValue =
        typeof newValue === 'function'
          ? (newValue as (prevValue: TState[TKey]) => TState[TKey])(prevValue)
          : newValue;

      if (prevValue !== nextValue) {
        valueRef.current = nextValue;
        _setValue(nextValue);
        // TODO: another approach to consider is to call `onInitialStateChange` only on unmount and not on every state change
        onInitialStateChange?.({ ...initialState$.getValue(), [key]: nextValue });
      }
    });

    useMount(() => {
      const restorableState = initialState$.getValue();
      if (shouldStoreDefaultValueRightAway && value !== restorableState?.[key]) {
        onInitialStateChange?.({ ...restorableState, [key]: value });
      }
    });

    useInitialStateRefresh(
      key,
      initialValue,
      (newValue) => {
        valueRef.current = newValue;
        _setValue(newValue);
      },
      shouldIgnoredRestoredValue
    );

    return [value, setValue] as const;
  };

  const useRestorableRef = <TKey extends keyof TState>(
    key: TKey,
    initialValue: TState[TKey],
    options?: {
      shouldStoreDefaultValueRightAway?: boolean;
    }
  ) => {
    const { shouldStoreDefaultValueRightAway } = options || {};
    const { initialState$, onInitialStateChange } = useContext(context);
    const initialState = initialState$.getValue();
    const valueRef = useRef(getInitialValue(initialState, key, initialValue));

    useMount(() => {
      const value = valueRef.current;
      const restorableState = initialState$.getValue();
      if (shouldStoreDefaultValueRightAway && value !== restorableState?.[key]) {
        onInitialStateChange?.({ ...restorableState, [key]: value });
      }
    });

    useUnmount(() => {
      onInitialStateChange?.({ ...initialState$.getValue(), [key]: valueRef.current });
    });

    useInitialStateRefresh(key, initialValue, (newValue) => {
      valueRef.current = newValue;
    });

    return valueRef;
  };

  /**
   * Allows to react to changes of a specific key of the state.
   *
   * As difference from `useRestorableState`, this re-renders whenever any consumer updates that key,
   * so a parent can react to a child's state changes.
   */
  const useRestorableStateValue = <TKey extends keyof TState>(key: TKey): Partial<TState>[TKey] => {
    const { initialState$ } = useContext(context);
    const [value, setValue] = useState<Partial<TState>[TKey]>(
      () => initialState$.getValue()?.[key]
    );

    useEffect(() => {
      const subscription = initialState$.subscribe((state) => {
        setValue(state?.[key]);
      });
      return () => subscription.unsubscribe();
    }, [initialState$, key]);

    return value;
  };

  const useRestorableLocalStorage = <TKey extends keyof TState>(
    key: TKey,
    localStorageKey: string,
    initialValue: TState[TKey]
  ) => {
    const [value, _setValue] = useRestorableState(
      key,
      storage.get(localStorageKey) ?? initialValue,
      {
        shouldStoreDefaultValueRightAway: true,
      }
    );

    const setValue = useStableFunction<typeof _setValue>((newValue) => {
      _setValue((prevValue) => {
        const nextValue =
          typeof newValue === 'function'
            ? (newValue as (prevValue: TState[TKey]) => TState[TKey])(prevValue)
            : newValue;

        storage.set(localStorageKey, nextValue);

        return nextValue;
      });
    });

    return [value, setValue] as const;
  };

  return {
    withRestorableState,
    useRestorableState,
    useRestorableStateValue,
    useRestorableRef,
    useRestorableLocalStorage,
  };
};

const useStableFunction = <T extends (...args: Parameters<T>) => ReturnType<T>>(fn: T) => {
  const lastestFn = useLatest(fn);
  const [stableFn] = useState(() => (...args: Parameters<T>) => {
    return lastestFn.current(...args);
  });

  return stableFn;
};
