import type { Optional } from 'utility-types';
import * as t from 'io-ts';
import type { FieldMap } from '@kbn/alerts-as-data-utils';
declare const esFieldTypeMap: {
    keyword: t.StringC;
    version: t.StringC;
    text: t.StringC;
    date: t.StringC;
    boolean: t.UnionC<[t.BooleanC, t.Type<boolean, boolean, unknown>]>;
    byte: t.UnionC<[t.NumberC, t.Type<number, number, unknown>]>;
    long: t.UnionC<[t.NumberC, t.Type<number, number, unknown>]>;
    integer: t.UnionC<[t.NumberC, t.Type<number, number, unknown>]>;
    short: t.UnionC<[t.NumberC, t.Type<number, number, unknown>]>;
    double: t.UnionC<[t.NumberC, t.Type<number, number, unknown>]>;
    float: t.UnionC<[t.NumberC, t.Type<number, number, unknown>]>;
    scaled_float: t.UnionC<[t.NumberC, t.Type<number, number, unknown>]>;
    unsigned_long: t.UnionC<[t.NumberC, t.Type<number, number, unknown>]>;
    flattened: t.UnknownRecordC;
};
type EsFieldTypeMap = typeof esFieldTypeMap;
type EsFieldTypeOf<T extends string> = T extends keyof EsFieldTypeMap ? EsFieldTypeMap[T] : t.UnknownC;
type SetOptional<T extends FieldMap> = Optional<T, {
    [key in keyof T]: T[key]['required'] extends true ? never : key;
}[keyof T]>;
type OutputOfField<T extends {
    type: string;
    array?: boolean;
}> = T['array'] extends true ? Array<t.OutputOf<EsFieldTypeOf<T['type']>>> : t.OutputOf<EsFieldTypeOf<T['type']>>;
type TypeOfField<T extends {
    type: string;
    array?: boolean;
}> = t.TypeOf<EsFieldTypeOf<T['type']>> | Array<t.TypeOf<EsFieldTypeOf<T['type']>>>;
type OutputOf<T extends FieldMap> = {
    [key in keyof T]: OutputOfField<Exclude<T[key], undefined>>;
};
type TypeOf<T extends FieldMap> = {
    [key in keyof T]: TypeOfField<Exclude<T[key], undefined>>;
};
export type TypeOfFieldMap<T extends FieldMap> = TypeOf<SetOptional<T>>;
export type OutputOfFieldMap<T extends FieldMap> = OutputOf<SetOptional<T>>;
export type FieldMapType<T extends FieldMap> = t.Type<TypeOfFieldMap<T>, OutputOfFieldMap<T>>;
export declare function runtimeTypeFromFieldMap<TFieldMap extends FieldMap>(fieldMap: TFieldMap): FieldMapType<TFieldMap>;
export {};
