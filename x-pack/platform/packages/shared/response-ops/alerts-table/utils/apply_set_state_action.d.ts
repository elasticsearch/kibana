import type { SetStateAction } from 'react';
/**
 * Applies a React SetStateAction to a given state value.
 */
export declare const applySetStateAction: <S>(action: SetStateAction<S>, oldState: S) => S;
