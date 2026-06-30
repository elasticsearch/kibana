import type { ValuesType, SetIntersection, OmitByValueExact } from 'utility-types';
type SplitByDot<TPath extends string, TPrefix extends string = ''> = TPath extends `${infer TKey}.${infer TRest}` ? [`${TPrefix}${TKey}.*`, ...SplitByDot<TRest, `${TPrefix}${TKey}.`>] : [`${TPrefix}${TPath}`];
type PatternMapOf<T extends Record<string, any>> = {
    [TKey in keyof T]: ValuesType<TKey extends string ? ['*', ...SplitByDot<TKey>] : never>;
};
export type PickWithPatterns<T extends Record<string, any>, TPatterns extends string[]> = OmitByValueExact<{
    [TFieldName in keyof T]: SetIntersection<ValuesType<TPatterns>, PatternMapOf<T>[TFieldName]> extends never ? never : T[TFieldName];
}, never>;
export type PatternsUnionOf<T extends Record<string, any>> = '*' | ValuesType<PatternMapOf<T>>;
export declare function pickWithPatterns<T extends Record<string, any>, TPatterns extends Array<PatternsUnionOf<T>>>(map: T, ...patterns: TPatterns): PickWithPatterns<T, TPatterns>;
export {};
