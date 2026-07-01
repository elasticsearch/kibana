/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { BehaviorSubject } from 'rxjs';

export interface SidebarVisibility {
  isCollapsed$: BehaviorSubject<boolean>;
  toggle: (isCollapsed: boolean, updateLocalStorage?: boolean) => void;
  initialValue: boolean;
}

export interface GetSidebarStateParams {
  localStorageKey?: string;
  isInitiallyCollapsed?: boolean;
}

/**
 * For managing sidebar visibility state
 * @param localStorageKey
 * @param isInitiallyCollapsed
 */
export const getSidebarVisibility = ({
  localStorageKey,
  isInitiallyCollapsed,
}: GetSidebarStateParams): SidebarVisibility => {
  const isCollapsedBasedOnLocalStorage = localStorageKey ? getIsCollapsed(localStorageKey) : false;
  const initialValue =
    typeof isInitiallyCollapsed === 'boolean'
      ? isInitiallyCollapsed
      : isCollapsedBasedOnLocalStorage;

  const isCollapsed$ = new BehaviorSubject<boolean>(initialValue);

  return {
    initialValue,
    isCollapsed$,
    toggle: (isCollapsed, updateLocalStorage = true) => {
      isCollapsed$.next(isCollapsed);
      if (updateLocalStorage && localStorageKey) {
        setIsCollapsed(localStorageKey, isCollapsed);
      }
    },
  };
};

function getIsCollapsed(localStorageKey: string) {
  let isCollapsed = false;
  try {
    isCollapsed = localStorage?.getItem(localStorageKey) === 'true';
  } catch {
    // nothing
  }

  return isCollapsed;
}

function setIsCollapsed(localStorageKey: string, isCollapsed: boolean) {
  try {
    localStorage?.setItem(localStorageKey, String(isCollapsed));
  } catch {
    // nothing
  }
}
