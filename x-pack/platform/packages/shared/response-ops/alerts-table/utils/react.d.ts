import type { ReactElement } from 'react';
import type React from 'react';
/**
 * A `React.memo` variant that keeps generic type information
 */
export declare const typedMemo: <T>(c: T) => T;
/**
 * A `React.forwardRef` variant that keeps generic type information
 */
export declare function typedForwardRef<T, P = {}>(render: (props: P, ref: React.Ref<T>) => ReactElement): (props: P & React.RefAttributes<T>) => ReactElement;
