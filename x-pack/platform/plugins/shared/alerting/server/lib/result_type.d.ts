export interface Ok<T> {
    tag: 'ok';
    value: T;
}
export interface Err<E> {
    tag: 'err';
    error: E;
}
export type Result<T, E> = Ok<T> | Err<E>;
export type Resultable<T, E> = {
    [P in keyof T]: Result<T[P], E>;
};
export declare function asOk<T>(value: T): Ok<T>;
export declare function asErr<T>(error: T): Err<T>;
export declare function isOk<T, E>(result: Result<T, E>): result is Ok<T>;
export declare function isErr<T, E>(result: Result<T, E>): result is Err<E>;
export declare function promiseResult<T, E>(future: Promise<T>): Promise<Result<T, E>>;
export declare function map<T, E, Resolution>(result: Result<T, E>, onOk: (value: T) => Resolution, onErr: (error: E) => Resolution): Resolution;
export declare function resolveErr<T, E>(result: Result<T, E>, onErr: (error: E) => T): T;
