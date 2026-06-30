/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// `ink` is ESM-only and ships an `exports` field that only exposes the root.
// Under TS bundler resolution from a CJS package, the named exports become
// inaccessible. The previous ambient declaration relied on the deep import
// `ink/build` which is now blocked too. Declare the runtime shape explicitly.
declare module 'ink' {
  import type { ComponentType, ReactNode } from 'react';

  export interface BoxProps {
    children?: ReactNode;
    flexDirection?: 'row' | 'column';
    marginTop?: number;
    marginBottom?: number;
    marginLeft?: number;
    marginRight?: number;
    [key: string]: unknown;
  }
  export const Box: ComponentType<BoxProps>;

  export interface TextProps {
    children?: ReactNode;
    color?: string;
    bold?: boolean;
    dimColor?: boolean;
    [key: string]: unknown;
  }
  export const Text: ComponentType<TextProps>;

  export interface Key {
    upArrow: boolean;
    downArrow: boolean;
    leftArrow: boolean;
    rightArrow: boolean;
    return: boolean;
    escape: boolean;
    ctrl: boolean;
    shift: boolean;
    tab: boolean;
    backspace: boolean;
    delete: boolean;
    meta: boolean;
    pageDown: boolean;
    pageUp: boolean;
  }
  export function useInput(callback: (input: string, key: Key) => void): void;

  export function useApp(): { exit: (error?: Error) => void };

  export function render(
    node: ReactNode,
    options?: unknown
  ): { unmount: () => void; waitUntilExit: () => Promise<void> };
}
