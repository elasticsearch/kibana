/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PropsWithChildren } from 'react';
import React, {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import type { ConsoleDataState } from '../console_state/types';
import { ConsolePageOverlay } from './components/console_page_overlay';
import type {
  ConsoleManagerClient,
  ConsoleRegistrationInterface,
  RegisteredConsoleClient,
} from './types';
import { Console } from '../../console';

interface ManagedConsole
  extends Pick<
    ConsoleRegistrationInterface,
    | 'consoleProps'
    | 'PageTitleComponent'
    | 'PageBodyComponent'
    | 'ActionComponents'
    | 'showCloseButton'
  > {
  client: RegisteredConsoleClient;
  console: JSX.Element; // actual console component
  isOpen: boolean;
  key: symbol;
}

type RunningConsoleStorage = Record<string, ManagedConsole>;

interface ConsoleManagerInternalClient {
  /**
   * Returns the managed console record for the given ConsoleProps object if its being managed
   * @param key
   */
  getManagedConsole(key: ManagedConsole['key']): ManagedConsole | undefined;

  /** Returns the Console's internal state (if any) */
  getManagedConsoleState(key: ManagedConsole['key']): ConsoleDataState | undefined;

  /** Stores the console's internal state */
  storeManagedConsoleState(key: ManagedConsole['key'], state: ConsoleDataState): void;
}

interface ConsoleManagerContextClients {
  client: ConsoleManagerClient;
  internal: ConsoleManagerInternalClient;
}

const ConsoleManagerContext = React.createContext<ConsoleManagerContextClients | undefined>(
  undefined
);

// -------------------------------------------------------------------------------------------------
// Module-level shared console store
//
// The running consoles and their internal state live OUTSIDE React, at module scope, so that EVERY
// mounted `<ConsoleManager>` - the one in the Security app shell AND the ones mounted inside each
// detached flyout React tree (including Discover doc-viewer fragments) - reads from and writes to the
// SAME data. This is what allows a console (and its in-memory state, e.g. command/input history) to
// survive across pages, flyouts, and the Security-app/Discover boundary, instead of each manager
// owning its own isolated copy that is lost the moment that particular tree unmounts.
// -------------------------------------------------------------------------------------------------
let currentConsoleStorage: RunningConsoleStorage = {};
const consoleStateStorage = new Map<ManagedConsole['key'], ConsoleDataState>();
const consoleStorageListeners = new Set<() => void>();

const emitConsoleStorageChange = (): void => {
  consoleStorageListeners.forEach((listener) => listener());
};

const consoleStore = {
  subscribe: (listener: () => void): (() => void) => {
    consoleStorageListeners.add(listener);
    return () => {
      consoleStorageListeners.delete(listener);
    };
  },
  getStorage: (): RunningConsoleStorage => currentConsoleStorage,
  setStorage: (updater: (prev: RunningConsoleStorage) => RunningConsoleStorage): void => {
    currentConsoleStorage = updater(currentConsoleStorage);
    emitConsoleStorageChange();
  },
  getManagedConsoleState: (key: ManagedConsole['key']): ConsoleDataState | undefined =>
    consoleStateStorage.get(key),
  storeManagedConsoleState: (key: ManagedConsole['key'], state: ConsoleDataState): void => {
    consoleStateStorage.set(key, state);
  },
};

// -------------------------------------------------------------------------------------------------
// Renderer election
//
// Because the console store is shared, every mounted `<ConsoleManager>` would otherwise render the
// `ConsolePageOverlay` for the visible console - producing duplicate overlays whenever more than one
// manager is mounted (e.g. the app shell + a flyout, or several Discover fragments at once). To avoid
// that, each manager registers a token on mount and only the "primary" (first-registered) one renders
// the overlay. When the primary unmounts, the next registered manager takes over.
// -------------------------------------------------------------------------------------------------
let primaryElectionTokens: object[] = [];
const primaryElectionListeners = new Set<() => void>();

const emitPrimaryElectionChange = (): void => {
  primaryElectionListeners.forEach((listener) => listener());
};

const rendererElection = {
  subscribe: (listener: () => void): (() => void) => {
    primaryElectionListeners.add(listener);
    return () => {
      primaryElectionListeners.delete(listener);
    };
  },
  register: (token: object): void => {
    primaryElectionTokens = [...primaryElectionTokens, token];
    emitPrimaryElectionChange();
  },
  unregister: (token: object): void => {
    primaryElectionTokens = primaryElectionTokens.filter((current) => current !== token);
    emitPrimaryElectionChange();
  },
  isPrimary: (token: object): boolean => primaryElectionTokens[0] === token,
};

/**
 * Test-only helper that clears the module-level console store + renderer election between test cases.
 * The store intentionally outlives individual `<ConsoleManager>` unmounts in production (so console
 * state survives navigation/flyouts), which means tests must reset it explicitly to avoid leaking
 * state across cases. This is wired into `createAppRootMockRenderer()`.
 */
export const resetConsoleManagerStateForTesting = (): void => {
  currentConsoleStorage = {};
  consoleStateStorage.clear();
  primaryElectionTokens = [];
};

export type ConsoleManagerProps = PropsWithChildren<{
  storage?: RunningConsoleStorage;
}>;

/**
 * A console management context. Allow for the show/hide of consoles without them loosing their
 * command history while running in "hidden" mode.
 */
export const ConsoleManager = memo<ConsoleManagerProps>(({ storage = {}, children }) => {
  // Subscribe to the module-level shared store (see above) so every manager re-renders together when
  // a console is registered/shown/hidden/terminated, regardless of which manager applied the change.
  const consoleStorage = useSyncExternalStore(consoleStore.subscribe, consoleStore.getStorage);

  // Renderer election: a stable per-instance token, registered on mount. Only the primary instance
  // renders the `ConsolePageOverlay` so we never render duplicate overlays from multiple managers.
  const electionTokenRef = useRef<object>();
  if (!electionTokenRef.current) {
    electionTokenRef.current = {};
  }
  const electionToken = electionTokenRef.current;

  useEffect(() => {
    rendererElection.register(electionToken);
    return () => rendererElection.unregister(electionToken);
  }, [electionToken]);

  const isPrimaryRenderer = useSyncExternalStore(rendererElection.subscribe, () =>
    rendererElection.isPrimary(electionToken)
  );

  // Seed the shared store from the `storage` prop the first time a manager mounts with one. Guarded
  // on the store being empty so additional (e.g. flyout-mounted) managers don't clobber live state.
  useEffect(() => {
    if (Object.keys(storage).length > 0 && Object.keys(consoleStore.getStorage()).length === 0) {
      consoleStore.setStorage(() => ({ ...storage }));
    }
  }, [storage]);

  const validateIdOrThrow = useCallback((id: string) => {
    if (!consoleStore.getStorage()[id]) {
      throw new Error(`Console with id ${id} not found`);
    }
  }, []); // << IMPORTANT: this callback should have no dependencies

  const show = useCallback<ConsoleManagerClient['show']>(
    (id) => {
      validateIdOrThrow(id);

      consoleStore.setStorage((prevState) => {
        const newState = { ...prevState };

        // if any is visible, hide it
        Object.entries(newState).forEach(([consoleId, managedConsole]) => {
          if (managedConsole.isOpen) {
            newState[consoleId] = {
              ...managedConsole,
              isOpen: false,
            };
          }
        });

        newState[id] = {
          ...newState[id],
          isOpen: true,
        };

        return newState;
      });
    },
    [validateIdOrThrow] // << IMPORTANT: this callback should have only immutable dependencies
  );

  const hide = useCallback<ConsoleManagerClient['hide']>(
    (id) => {
      validateIdOrThrow(id);

      consoleStore.setStorage((prevState) => {
        const newState = { ...prevState };
        newState[id].isOpen = false;
        return newState;
      });
    },
    [validateIdOrThrow] // << IMPORTANT: this callback should have only immutable dependencies
  );

  const terminate = useCallback<ConsoleManagerClient['terminate']>(
    (id) => {
      validateIdOrThrow(id);

      consoleStore.setStorage((prevState) => {
        const newState = { ...prevState };
        delete newState[id];

        return newState;
      });
    },
    [validateIdOrThrow] // << IMPORTANT: this callback should have only immutable dependencies
  );

  const getOne = useCallback<ConsoleManagerClient['getOne']>(
    <Meta extends object = Record<string, unknown>>(id: string) => {
      const managedConsole = consoleStore.getStorage()[id];
      if (managedConsole) {
        return managedConsole.client as Readonly<RegisteredConsoleClient<Meta>>;
      }
    },
    [] // << IMPORTANT: this callback should have no dependencies or only immutable dependencies
  );

  const getList = useCallback<ConsoleManagerClient['getList']>(<
    Meta extends object = Record<string, unknown>
  >() => {
    return Object.values(consoleStorage).map(
      (managedConsole) => managedConsole.client
    ) as ReadonlyArray<Readonly<RegisteredConsoleClient<Meta>>>;
  }, [consoleStorage]); // << This callback should always use `consoleStorage`

  const isVisible = useCallback((id: string): boolean => {
    return consoleStore.getStorage()[id]?.isOpen ?? false;
  }, []); // << IMPORTANT: this callback should have no dependencies

  const register = useCallback<ConsoleManagerClient['register']>(
    ({ id, meta, consoleProps, ...otherRegisterProps }) => {
      if (consoleStore.getStorage()[id]) {
        throw new Error(`Console with id ${id} already registered`);
      }

      const managedKey = Symbol(id);
      // Referencing/using the interface methods here (defined in the outer scope of this function)
      // is ok because those are immutable and thus will not change between state changes
      const showThisConsole = show.bind(null, id);
      const hideThisConsole = hide.bind(null, id);
      const terminateThisConsole = terminate.bind(null, id);
      const isThisConsoleVisible = isVisible.bind(null, id);

      const managedConsole: ManagedConsole = {
        PageBodyComponent: undefined,
        PageTitleComponent: undefined,
        ActionComponents: undefined,
        ...otherRegisterProps,
        client: {
          id,
          meta,
          // The use of `setTimeout()` below is needed because this client interface can be consumed
          // prior to the component state being updated. Placing a delay on the execution of these
          // methods allows for state to be updated first and then the action is applied.
          // So someone can do: `.register({...}).show()` and it will work
          show: () => {
            setTimeout(showThisConsole, 0);
          },
          hide: () => {
            setTimeout(hideThisConsole, 0);
          },
          terminate: () => {
            setTimeout(terminateThisConsole, 0);
          },
          isVisible: () => isThisConsoleVisible(),
        },
        consoleProps,
        console: <Console {...consoleProps} managedKey={managedKey} key={id} />,
        isOpen: false,
        key: managedKey,
      };

      consoleStore.setStorage((prevState) => {
        return {
          ...prevState,
          [id]: managedConsole,
        };
      });

      return managedConsole.client;
    },
    [hide, isVisible, show, terminate]
  );

  const consoleManagerClient = useMemo<ConsoleManagerClient>(() => {
    return {
      register,
      show,
      hide,
      terminate,
      getOne,
      getList,
    };
  }, [getList, getOne, hide, register, show, terminate]);

  const consoleManageContextClients = useMemo<ConsoleManagerContextClients>(() => {
    return {
      client: consoleManagerClient,

      internal: {
        getManagedConsole(key): ManagedConsole | undefined {
          return Object.values(consoleStorage).find((managedConsole) => managedConsole.key === key);
        },

        getManagedConsoleState(key: ManagedConsole['key']): ConsoleDataState | undefined {
          return consoleStore.getManagedConsoleState(key);
        },

        storeManagedConsoleState(key: ManagedConsole['key'], state: ConsoleDataState) {
          consoleStore.storeManagedConsoleState(key, state);
        },
      },
    };
  }, [consoleManagerClient, consoleStorage]);

  const visibleConsole = useMemo(() => {
    return Object.values(consoleStorage).find((managedConsole) => managedConsole.isOpen);
  }, [consoleStorage]);

  const visibleConsoleMeta = useMemo(() => {
    return visibleConsole?.client.meta ?? {};
  }, [visibleConsole?.client.meta]);

  const handleOnHide = useCallback(() => {
    if (visibleConsole) {
      consoleManagerClient.hide(visibleConsole.client.id);
    }
  }, [consoleManagerClient, visibleConsole]);

  return (
    <ConsoleManagerContext.Provider value={consoleManageContextClients}>
      {children}

      {isPrimaryRenderer && visibleConsole && (
        <ConsolePageOverlay
          onHide={handleOnHide}
          console={
            <Console
              {...visibleConsole.consoleProps}
              managedKey={visibleConsole.key}
              key={visibleConsole.client.id}
            />
          }
          isHidden={!visibleConsole}
          pageTitle={
            visibleConsole.PageTitleComponent && (
              <visibleConsole.PageTitleComponent meta={visibleConsoleMeta} />
            )
          }
          body={
            visibleConsole.PageBodyComponent && (
              <visibleConsole.PageBodyComponent meta={visibleConsoleMeta} />
            )
          }
          actions={
            visibleConsole.ActionComponents &&
            visibleConsole.ActionComponents.map((ActionComponent) => {
              return <ActionComponent meta={visibleConsoleMeta} />;
            })
          }
          showCloseButton={visibleConsole.showCloseButton}
        />
      )}
    </ConsoleManagerContext.Provider>
  );
});
ConsoleManager.displayName = 'ConsoleManager';

/**
 * Returns the interface for managing consoles withing a `<ConsoleManager/>` context.
 */
export const useConsoleManager = (): ConsoleManagerClient => {
  const consoleManagerClients = useContext(ConsoleManagerContext);

  if (!consoleManagerClients) {
    throw new Error('ConsoleManagerContext not found');
  }

  return consoleManagerClients.client;
};

/**
 * For internal use within Console code only!
 * Hook will return the `ManagedConsole` interface stored in the manager if it finds
 * the `ConsoleProps` provided on input to be one that the ConsoleManager is tracking.
 *
 * @protected
 */
export const useWithManagedConsole = (
  key: ManagedConsole['key'] | undefined
): ManagedConsole | undefined => {
  const consoleManagerClients = useContext(ConsoleManagerContext);

  if (key && consoleManagerClients) {
    return consoleManagerClients.internal.getManagedConsole(key);
  }
};

type WithManagedConsoleState = Readonly<
  [
    getState: undefined | (() => ConsoleDataState | undefined),
    storeState: undefined | ((state: ConsoleDataState) => void)
  ]
>;
/**
 * Provides methods for retrieving/storing a console's internal state (if any)
 * @param key
 */
export const useWithManagedConsoleState = (
  key: ManagedConsole['key'] | undefined
): WithManagedConsoleState => {
  const consoleManagerClients = useContext(ConsoleManagerContext);

  return useMemo(() => {
    if (!key || !consoleManagerClients) {
      return [undefined, undefined];
    }

    return [
      // getState()
      () => {
        return consoleManagerClients.internal.getManagedConsoleState(key);
      },

      // storeState()
      (state: ConsoleDataState) => {
        if (consoleManagerClients.internal.getManagedConsole(key)) {
          consoleManagerClients.internal.storeManagedConsoleState(key, state);
        }
      },
    ];
  }, [consoleManagerClients, key]);
};
