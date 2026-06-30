import { type Dispatch, type SetStateAction } from 'react';
type ChangeHandler<T> = (state: T) => void;
type SetStateFn<T> = Dispatch<SetStateAction<T>>;
export declare function useControllableState<T>(params: {
    value?: T;
    onChange?: ChangeHandler<T>;
    defaultValue?: T;
}): [T, SetStateFn<T>];
export {};
