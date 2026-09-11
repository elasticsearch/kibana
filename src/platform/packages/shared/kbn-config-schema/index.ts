/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Duration } from 'moment';
import type { Stream } from 'stream';
import {
  savedObjectId,
  savedObjectType,
  savedObjectVersion,
  spaceId,
  displayName,
  description,
  searchFilter,
  aggregation,
  querySortField,
  unboundedString,
} from './src/helpers';

import type { ByteSizeValue } from './src/byte_size_value';
import type { Reference } from './src/references';
import { ContextReference, SiblingReference } from './src/references';
import type {
  ArrayOptions,
  ByteSizeOptions,
  ConditionalTypeValue,
  DurationOptions,
  IntersectionTypeOptions,
  IpOptions,
  MapOfOptions,
  NumberOptions,
  ObjectTypeOptions,
  ObjectResultType,
  Props,
  NullableProps,
  RecordOfOptions,
  SchemaStructureEntry,
  StringOptions,
  TypeOf,
  TypeOptions,
  URIOptions,
  UnionTypeOptions,
  PropsWithDiscriminator,
  ObjectResultUnionType,
} from './src/types';
import {
  AnyType,
  ArrayType,
  BooleanType,
  BufferType,
  ByteSizeType,
  ConditionalType,
  DurationType,
  IntersectionType,
  IpType,
  LiteralType,
  MapOfType,
  MaybeType,
  NeverType,
  NumberType,
  ObjectType,
  RecordOfType,
  StringType,
  Type,
  UnionType,
  DiscriminatedUnionType,
  URIType,
  StreamType,
  Lazy,
} from './src/types';

export type { AnyType, ConditionalType, TypeOf, Props, SchemaStructureEntry, NullableProps };
export { ObjectType, Type };
export type { SchemaValidationOptions } from './src/types';
export { ByteSizeValue } from './src/byte_size_value';
export { SchemaTypeError, ValidationError } from './src/errors';
export { isConfigSchema } from './src/typeguards';
export {
  offeringBasedSchema,
  savedObjectId,
  savedObjectType,
  savedObjectVersion,
  spaceId,
  displayName,
  description,
  searchFilter,
  aggregation,
  querySortField,
  unboundedString,
} from './src/helpers';
export type { SchemaHelper, StringWarnOptions, UnboundedStringOptions } from './src/helpers';

function any(options?: TypeOptions<any>) {
  return new AnyType(options);
}

function boolean(options?: TypeOptions<boolean>): Type<boolean> {
  return new BooleanType(options);
}

function buffer(options?: TypeOptions<Buffer>): Type<Buffer> {
  return new BufferType(options);
}

function stream(options?: TypeOptions<Stream>): Type<Stream> {
  return new StreamType(options);
}

function string(options?: StringOptions): Type<string> {
  return new StringType(options);
}

function uri(options?: URIOptions): Type<string> {
  return new URIType(options);
}

function literal<T extends string | number | boolean | null>(value: T): Type<T> {
  return new LiteralType(value);
}

function number(options?: NumberOptions): Type<number> {
  return new NumberType(options);
}

function byteSize(options?: ByteSizeOptions): Type<ByteSizeValue> {
  return new ByteSizeType(options);
}

function duration(options?: DurationOptions): Type<Duration> {
  return new DurationType(options);
}

function never(): Type<never> {
  return new NeverType();
}

function ip(options?: IpOptions): Type<string> {
  return new IpType(options);
}

/**
 * Create an optional type
 */
function maybe<V>(type: Type<V>): Type<V | undefined> {
  return new MaybeType(type);
}

function nullable<V>(type: Type<V>): Type<V | null> {
  return schema.oneOf([type, schema.literal(null)], { defaultValue: null });
}

function object<P extends Props>(props: P, options?: ObjectTypeOptions<P>): ObjectType<P> {
  return new ObjectType(props, options);
}

function arrayOf<T>(itemType: Type<T>, options?: ArrayOptions<T>): Type<T[]> {
  return new ArrayType(itemType, options);
}

function mapOf<K, V>(
  keyType: Type<K>,
  valueType: Type<V>,
  options?: MapOfOptions<K, V>
): Type<Map<K, V>> {
  return new MapOfType(keyType, valueType, options);
}

function recordOf<K extends string, V>(
  keyType: Type<K>,
  valueType: Type<V>,
  options?: RecordOfOptions<K, V>
): Type<Record<K, V>> {
  return new RecordOfType(keyType, valueType, options);
}

function oneOf<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q>(
  types: [
    Type<A>,
    Type<B>,
    Type<C>,
    Type<D>,
    Type<E>,
    Type<F>,
    Type<G>,
    Type<H>,
    Type<I>,
    Type<J>,
    Type<K>,
    Type<L>,
    Type<M>,
    Type<N>,
    Type<O>,
    Type<P>,
    Type<Q>
  ],
  options?: UnionTypeOptions<A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q>
): Type<A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q>;
function oneOf<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P>(
  types: [
    Type<A>,
    Type<B>,
    Type<C>,
    Type<D>,
    Type<E>,
    Type<F>,
    Type<G>,
    Type<H>,
    Type<I>,
    Type<J>,
    Type<K>,
    Type<L>,
    Type<M>,
    Type<N>,
    Type<O>,
    Type<P>
  ],
  options?: UnionTypeOptions<A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P>
): Type<A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P>;
function oneOf<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O>(
  types: [
    Type<A>,
    Type<B>,
    Type<C>,
    Type<D>,
    Type<E>,
    Type<F>,
    Type<G>,
    Type<H>,
    Type<I>,
    Type<J>,
    Type<K>,
    Type<L>,
    Type<M>,
    Type<N>,
    Type<O>
  ],
  options?: UnionTypeOptions<A | B | C | D | E | F | G | H | I | J | K | L | M | N | O>
): Type<A | B | C | D | E | F | G | H | I | J | K | L | M | N | O>;
function oneOf<A, B, C, D, E, F, G, H, I, J, K, L, M, N>(
  types: [
    Type<A>,
    Type<B>,
    Type<C>,
    Type<D>,
    Type<E>,
    Type<F>,
    Type<G>,
    Type<H>,
    Type<I>,
    Type<J>,
    Type<K>,
    Type<L>,
    Type<M>,
    Type<N>
  ],
  options?: UnionTypeOptions<A | B | C | D | E | F | G | H | I | J | K | L | M | N>
): Type<A | B | C | D | E | F | G | H | I | J | K | L | M | N>;
function oneOf<A, B, C, D, E, F, G, H, I, J, K, L, M>(
  types: [
    Type<A>,
    Type<B>,
    Type<C>,
    Type<D>,
    Type<E>,
    Type<F>,
    Type<G>,
    Type<H>,
    Type<I>,
    Type<J>,
    Type<K>,
    Type<L>,
    Type<M>
  ],
  options?: UnionTypeOptions<A | B | C | D | E | F | G | H | I | J | K | L | M>
): Type<A | B | C | D | E | F | G | H | I | J | K | L | M>;
function oneOf<A, B, C, D, E, F, G, H, I, J, K, L>(
  types: [
    Type<A>,
    Type<B>,
    Type<C>,
    Type<D>,
    Type<E>,
    Type<F>,
    Type<G>,
    Type<H>,
    Type<I>,
    Type<J>,
    Type<K>,
    Type<L>
  ],
  options?: UnionTypeOptions<A | B | C | D | E | F | G | H | I | J | K | L>
): Type<A | B | C | D | E | F | G | H | I | J | K | L>;
function oneOf<A, B, C, D, E, F, G, H, I, J, K>(
  types: [
    Type<A>,
    Type<B>,
    Type<C>,
    Type<D>,
    Type<E>,
    Type<F>,
    Type<G>,
    Type<H>,
    Type<I>,
    Type<J>,
    Type<K>
  ],
  options?: UnionTypeOptions<A | B | C | D | E | F | G | H | I | J | K>
): Type<A | B | C | D | E | F | G | H | I | J | K>;
function oneOf<A, B, C, D, E, F, G, H, I, J>(
  types: [Type<A>, Type<B>, Type<C>, Type<D>, Type<E>, Type<F>, Type<G>, Type<H>, Type<I>, Type<J>],
  options?: UnionTypeOptions<A | B | C | D | E | F | G | H | I | J>
): Type<A | B | C | D | E | F | G | H | I | J>;
function oneOf<A, B, C, D, E, F, G, H, I>(
  types: [Type<A>, Type<B>, Type<C>, Type<D>, Type<E>, Type<F>, Type<G>, Type<H>, Type<I>],
  options?: UnionTypeOptions<A | B | C | D | E | F | G | H | I>
): Type<A | B | C | D | E | F | G | H | I>;
function oneOf<A, B, C, D, E, F, G, H>(
  types: [Type<A>, Type<B>, Type<C>, Type<D>, Type<E>, Type<F>, Type<G>, Type<H>],
  options?: UnionTypeOptions<A | B | C | D | E | F | G | H>
): Type<A | B | C | D | E | F | G | H>;
function oneOf<A, B, C, D, E, F, G>(
  types: [Type<A>, Type<B>, Type<C>, Type<D>, Type<E>, Type<F>, Type<G>],
  options?: UnionTypeOptions<A | B | C | D | E | F | G>
): Type<A | B | C | D | E | F | G>;
function oneOf<A, B, C, D, E, F>(
  types: [Type<A>, Type<B>, Type<C>, Type<D>, Type<E>, Type<F>],
  options?: UnionTypeOptions<A | B | C | D | E | F>
): Type<A | B | C | D | E | F>;
function oneOf<A, B, C, D, E>(
  types: [Type<A>, Type<B>, Type<C>, Type<D>, Type<E>],
  options?: UnionTypeOptions<A | B | C | D | E>
): Type<A | B | C | D | E>;
function oneOf<A, B, C, D>(
  types: [Type<A>, Type<B>, Type<C>, Type<D>],
  options?: UnionTypeOptions<A | B | C | D>
): Type<A | B | C | D>;
function oneOf<A, B, C>(
  types: [Type<A>, Type<B>, Type<C>],
  options?: UnionTypeOptions<A | B | C>
): Type<A | B | C>;
function oneOf<A, B>(types: [Type<A>, Type<B>], options?: UnionTypeOptions<A | B>): Type<A | B>;
function oneOf<A>(types: [Type<A>], options?: UnionTypeOptions<A>): Type<A>;
function oneOf<RTS extends Array<Type<any>>>(
  types: RTS,
  options?: UnionTypeOptions<any>
): Type<any> {
  return new UnionType(types, options);
}

function discriminatedUnion<
  Discriminator extends string,
  A extends PropsWithDiscriminator<Discriminator, Props>,
  B extends PropsWithDiscriminator<Discriminator, Props>,
  C extends PropsWithDiscriminator<Discriminator, Props>,
  D extends PropsWithDiscriminator<Discriminator, Props>,
  E extends PropsWithDiscriminator<Discriminator, Props>,
  F extends PropsWithDiscriminator<Discriminator, Props>,
  G extends PropsWithDiscriminator<Discriminator, Props>,
  H extends PropsWithDiscriminator<Discriminator, Props>,
  I extends PropsWithDiscriminator<Discriminator, Props>,
  J extends PropsWithDiscriminator<Discriminator, Props>,
  K extends PropsWithDiscriminator<Discriminator, Props>,
  L extends PropsWithDiscriminator<Discriminator, Props>
>(
  discriminator: Discriminator,
  types: [
    ObjectType<A>,
    ObjectType<B>,
    ObjectType<C>,
    ObjectType<D>,
    ObjectType<E>,
    ObjectType<F>,
    ObjectType<G>,
    ObjectType<H>,
    ObjectType<I>,
    ObjectType<J>,
    ObjectType<K>,
    ObjectType<L>
  ],
  options?: UnionTypeOptions<ObjectResultUnionType<A | B | C | D | E | F | G | H | I | J | K | L>>
): Type<ObjectResultUnionType<A | B | C | D | E | F | G | H | I | J | K | L>>;
function discriminatedUnion<
  Discriminator extends string,
  A extends PropsWithDiscriminator<Discriminator, Props>,
  B extends PropsWithDiscriminator<Discriminator, Props>,
  C extends PropsWithDiscriminator<Discriminator, Props>,
  D extends PropsWithDiscriminator<Discriminator, Props>,
  E extends PropsWithDiscriminator<Discriminator, Props>,
  F extends PropsWithDiscriminator<Discriminator, Props>,
  G extends PropsWithDiscriminator<Discriminator, Props>,
  H extends PropsWithDiscriminator<Discriminator, Props>,
  I extends PropsWithDiscriminator<Discriminator, Props>,
  J extends PropsWithDiscriminator<Discriminator, Props>,
  K extends PropsWithDiscriminator<Discriminator, Props>
>(
  discriminator: Discriminator,
  types: [
    ObjectType<A>,
    ObjectType<B>,
    ObjectType<C>,
    ObjectType<D>,
    ObjectType<E>,
    ObjectType<F>,
    ObjectType<G>,
    ObjectType<H>,
    ObjectType<I>,
    ObjectType<J>,
    ObjectType<K>
  ],
  options?: UnionTypeOptions<ObjectResultUnionType<A | B | C | D | E | F | G | H | I | J | K>>
): Type<ObjectResultUnionType<A | B | C | D | E | F | G | H | I | J | K>>;
function discriminatedUnion<
  Discriminator extends string,
  A extends PropsWithDiscriminator<Discriminator, Props>,
  B extends PropsWithDiscriminator<Discriminator, Props>,
  C extends PropsWithDiscriminator<Discriminator, Props>,
  D extends PropsWithDiscriminator<Discriminator, Props>,
  E extends PropsWithDiscriminator<Discriminator, Props>,
  F extends PropsWithDiscriminator<Discriminator, Props>,
  G extends PropsWithDiscriminator<Discriminator, Props>,
  H extends PropsWithDiscriminator<Discriminator, Props>,
  I extends PropsWithDiscriminator<Discriminator, Props>,
  J extends PropsWithDiscriminator<Discriminator, Props>
>(
  discriminator: Discriminator,
  types: [
    ObjectType<A>,
    ObjectType<B>,
    ObjectType<C>,
    ObjectType<D>,
    ObjectType<E>,
    ObjectType<F>,
    ObjectType<G>,
    ObjectType<H>,
    ObjectType<I>,
    ObjectType<J>
  ],
  options?: UnionTypeOptions<ObjectResultUnionType<A | B | C | D | E | F | G | H | I | J>>
): Type<ObjectResultUnionType<A | B | C | D | E | F | G | H | I | J>>;
function discriminatedUnion<
  Discriminator extends string,
  A extends PropsWithDiscriminator<Discriminator, Props>,
  B extends PropsWithDiscriminator<Discriminator, Props>,
  C extends PropsWithDiscriminator<Discriminator, Props>,
  D extends PropsWithDiscriminator<Discriminator, Props>,
  E extends PropsWithDiscriminator<Discriminator, Props>,
  F extends PropsWithDiscriminator<Discriminator, Props>,
  G extends PropsWithDiscriminator<Discriminator, Props>,
  H extends PropsWithDiscriminator<Discriminator, Props>,
  I extends PropsWithDiscriminator<Discriminator, Props>
>(
  discriminator: Discriminator,
  types: [
    ObjectType<A>,
    ObjectType<B>,
    ObjectType<C>,
    ObjectType<D>,
    ObjectType<E>,
    ObjectType<F>,
    ObjectType<G>,
    ObjectType<H>,
    ObjectType<I>
  ],
  options?: UnionTypeOptions<ObjectResultUnionType<A | B | C | D | E | F | G | H | I>>
): Type<ObjectResultUnionType<A | B | C | D | E | F | G | H | I>>;
function discriminatedUnion<
  Discriminator extends string,
  A extends PropsWithDiscriminator<Discriminator, Props>,
  B extends PropsWithDiscriminator<Discriminator, Props>,
  C extends PropsWithDiscriminator<Discriminator, Props>,
  D extends PropsWithDiscriminator<Discriminator, Props>,
  E extends PropsWithDiscriminator<Discriminator, Props>,
  F extends PropsWithDiscriminator<Discriminator, Props>,
  G extends PropsWithDiscriminator<Discriminator, Props>,
  H extends PropsWithDiscriminator<Discriminator, Props>
>(
  discriminator: Discriminator,
  types: [
    ObjectType<A>,
    ObjectType<B>,
    ObjectType<C>,
    ObjectType<D>,
    ObjectType<E>,
    ObjectType<F>,
    ObjectType<G>,
    ObjectType<H>
  ],
  options?: UnionTypeOptions<ObjectResultUnionType<A | B | C | D | E | F | G | H>>
): Type<ObjectResultUnionType<A | B | C | D | E | F | G | H>>;
function discriminatedUnion<
  Discriminator extends string,
  A extends PropsWithDiscriminator<Discriminator, Props>,
  B extends PropsWithDiscriminator<Discriminator, Props>,
  C extends PropsWithDiscriminator<Discriminator, Props>,
  D extends PropsWithDiscriminator<Discriminator, Props>,
  E extends PropsWithDiscriminator<Discriminator, Props>,
  F extends PropsWithDiscriminator<Discriminator, Props>,
  G extends PropsWithDiscriminator<Discriminator, Props>
>(
  discriminator: Discriminator,
  types: [
    ObjectType<A>,
    ObjectType<B>,
    ObjectType<C>,
    ObjectType<D>,
    ObjectType<E>,
    ObjectType<F>,
    ObjectType<G>
  ],
  options?: UnionTypeOptions<ObjectResultUnionType<A | B | C | D | E | F | G>>
): Type<ObjectResultUnionType<A | B | C | D | E | F | G>>;
function discriminatedUnion<
  Discriminator extends string,
  A extends PropsWithDiscriminator<Discriminator, Props>,
  B extends PropsWithDiscriminator<Discriminator, Props>,
  C extends PropsWithDiscriminator<Discriminator, Props>,
  D extends PropsWithDiscriminator<Discriminator, Props>,
  E extends PropsWithDiscriminator<Discriminator, Props>,
  F extends PropsWithDiscriminator<Discriminator, Props>
>(
  discriminator: Discriminator,
  types: [ObjectType<A>, ObjectType<B>, ObjectType<C>, ObjectType<D>, ObjectType<E>, ObjectType<F>],
  options?: UnionTypeOptions<ObjectResultUnionType<A | B | C | D | E | F>>
): Type<ObjectResultUnionType<A | B | C | D | E | F>>;
function discriminatedUnion<
  Discriminator extends string,
  A extends PropsWithDiscriminator<Discriminator, Props>,
  B extends PropsWithDiscriminator<Discriminator, Props>,
  C extends PropsWithDiscriminator<Discriminator, Props>,
  D extends PropsWithDiscriminator<Discriminator, Props>,
  E extends PropsWithDiscriminator<Discriminator, Props>
>(
  discriminator: Discriminator,
  types: [ObjectType<A>, ObjectType<B>, ObjectType<C>, ObjectType<D>, ObjectType<E>],
  options?: UnionTypeOptions<ObjectResultUnionType<A | B | C | D | E>>
): Type<ObjectResultUnionType<A | B | C | D | E>>;
function discriminatedUnion<
  Discriminator extends string,
  A extends PropsWithDiscriminator<Discriminator, Props>,
  B extends PropsWithDiscriminator<Discriminator, Props>,
  C extends PropsWithDiscriminator<Discriminator, Props>,
  D extends PropsWithDiscriminator<Discriminator, Props>
>(
  discriminator: Discriminator,
  types: [ObjectType<A>, ObjectType<B>, ObjectType<C>, ObjectType<D>],
  options?: UnionTypeOptions<ObjectResultUnionType<A | B | C | D>>
): Type<ObjectResultUnionType<A | B | C | D>>;
function discriminatedUnion<
  Discriminator extends string,
  A extends PropsWithDiscriminator<Discriminator, Props>,
  B extends PropsWithDiscriminator<Discriminator, Props>,
  C extends PropsWithDiscriminator<Discriminator, Props>
>(
  discriminator: Discriminator,
  types: [ObjectType<A>, ObjectType<B>, ObjectType<C>],
  options?: UnionTypeOptions<ObjectResultUnionType<A | B | C>>
): Type<ObjectResultUnionType<A | B | C>>;
function discriminatedUnion<
  Discriminator extends string,
  A extends PropsWithDiscriminator<Discriminator, Props>,
  B extends PropsWithDiscriminator<Discriminator, Props>
>(
  discriminator: Discriminator,
  types: [ObjectType<A>, ObjectType<B>],
  options?: UnionTypeOptions<ObjectResultUnionType<A | B>>
): Type<ObjectResultUnionType<A | B>>;
function discriminatedUnion<
  Discriminator extends string,
  A extends PropsWithDiscriminator<Discriminator, Props>
>(
  discriminator: Discriminator,
  types: [ObjectType<A>],
  options?: UnionTypeOptions<ObjectResultType<A>>
): Type<ObjectResultType<A>>;
function discriminatedUnion<Discriminator extends string, RTS extends Array<ObjectType<any>>>(
  discriminator: Discriminator,
  types: RTS,
  options?: UnionTypeOptions<any>
): Type<ObjectResultType<any>> {
  return new DiscriminatedUnionType(discriminator, types, options);
}

function allOf<
  A extends Props,
  B extends Props,
  C extends Props,
  D extends Props,
  E extends Props,
  F extends Props,
  G extends Props,
  H extends Props,
  I extends Props,
  J extends Props,
  K extends Props
>(
  types: [
    ObjectType<A>,
    ObjectType<B>,
    ObjectType<C>,
    ObjectType<D>,
    ObjectType<E>,
    ObjectType<F>,
    ObjectType<G>,
    ObjectType<H>,
    ObjectType<I>,
    ObjectType<J>,
    ObjectType<K>
  ],
  options?: UnionTypeOptions<A & B & C & D & E & F & G & H & I & J & K>
): Type<ObjectResultType<A & B & C & D & E & F & G & H & I & J & K>>;
function allOf<
  A extends Props,
  B extends Props,
  C extends Props,
  D extends Props,
  E extends Props,
  F extends Props,
  G extends Props,
  H extends Props,
  I extends Props,
  J extends Props
>(
  types: [
    ObjectType<A>,
    ObjectType<B>,
    ObjectType<C>,
    ObjectType<D>,
    ObjectType<E>,
    ObjectType<F>,
    ObjectType<G>,
    ObjectType<H>,
    ObjectType<I>,
    ObjectType<J>
  ],
  options?: UnionTypeOptions<A & B & C & D & E & F & G & H & I & J>
): Type<ObjectResultType<A & B & C & D & E & F & G & H & I & J>>;
function allOf<
  A extends Props,
  B extends Props,
  C extends Props,
  D extends Props,
  E extends Props,
  F extends Props,
  G extends Props,
  H extends Props,
  I extends Props
>(
  types: [
    ObjectType<A>,
    ObjectType<B>,
    ObjectType<C>,
    ObjectType<D>,
    ObjectType<E>,
    ObjectType<F>,
    ObjectType<G>,
    ObjectType<H>,
    ObjectType<I>
  ],
  options?: UnionTypeOptions<A & B & C & D & E & F & G & H & I>
): Type<ObjectResultType<A & B & C & D & E & F & G & H & I>>;
function allOf<
  A extends Props,
  B extends Props,
  C extends Props,
  D extends Props,
  E extends Props,
  F extends Props,
  G extends Props,
  H extends Props
>(
  types: [
    ObjectType<A>,
    ObjectType<B>,
    ObjectType<C>,
    ObjectType<D>,
    ObjectType<E>,
    ObjectType<F>,
    ObjectType<G>,
    ObjectType<H>
  ],
  options?: UnionTypeOptions<A & B & C & D & E & F & G & H>
): Type<ObjectResultType<A & B & C & D & E & F & G & H>>;
function allOf<
  A extends Props,
  B extends Props,
  C extends Props,
  D extends Props,
  E extends Props,
  F extends Props,
  G extends Props
>(
  types: [
    ObjectType<A>,
    ObjectType<B>,
    ObjectType<C>,
    ObjectType<D>,
    ObjectType<E>,
    ObjectType<F>,
    ObjectType<G>
  ],
  options?: UnionTypeOptions<A & B & C & D & E & F & G>
): Type<ObjectResultType<A & B & C & D & E & F & G>>;
function allOf<
  A extends Props,
  B extends Props,
  C extends Props,
  D extends Props,
  E extends Props,
  F extends Props
>(
  types: [ObjectType<A>, ObjectType<B>, ObjectType<C>, ObjectType<D>, ObjectType<E>, ObjectType<F>],
  options?: UnionTypeOptions<A & B & C & D & E & F>
): Type<ObjectResultType<A & B & C & D & E & F>>;
function allOf<A extends Props, B extends Props, C extends Props, D extends Props, E extends Props>(
  types: [ObjectType<A>, ObjectType<B>, ObjectType<C>, ObjectType<D>, ObjectType<E>],
  options?: UnionTypeOptions<A & B & C & D & E>
): Type<ObjectResultType<A & B & C & D & E>>;
function allOf<A extends Props, B extends Props, C extends Props, D extends Props>(
  types: [ObjectType<A>, ObjectType<B>, ObjectType<C>, ObjectType<D>],
  options?: UnionTypeOptions<A & B & C & D>
): Type<ObjectResultType<A & B & C & D>>;
function allOf<A extends Props, B extends Props, C extends Props>(
  types: [ObjectType<A>, ObjectType<B>, ObjectType<C>],
  options?: UnionTypeOptions<A & B & C>
): Type<ObjectResultType<A & B & C>>;
function allOf<A extends Props, B extends Props>(
  types: [ObjectType<A>, ObjectType<B>],
  options?: UnionTypeOptions<A & B>
): Type<ObjectResultType<A & B>>;
function allOf<A extends Props>(
  types: [ObjectType<A>],
  options?: UnionTypeOptions<A>
): Type<ObjectResultType<A>>;
function allOf<RTS extends Array<ObjectType<any>>>(
  types: RTS,
  options?: IntersectionTypeOptions<any>
): Type<any> {
  return new IntersectionType(types, options);
}

function contextRef<T>(key: string): ContextReference<T> {
  return new ContextReference(key);
}

function siblingRef<T>(key: string): SiblingReference<T> {
  return new SiblingReference(key);
}

function conditional<A extends ConditionalTypeValue, B, C>(
  leftOperand: Reference<A>,
  rightOperand: Reference<A> | A | Type<unknown>,
  equalType: Type<B>,
  notEqualType: Type<C>,
  options?: TypeOptions<B | C>
) {
  return new ConditionalType(leftOperand, rightOperand, equalType, notEqualType, options);
}

/**
 * Useful for creating recursive schemas.
 */
function lazy<T>(id: string) {
  return new Lazy<T>(id);
}

export const schema = {
  allOf,
  any,
  arrayOf,
  boolean,
  buffer,
  byteSize,
  conditional,
  contextRef,
  duration,
  intersection: allOf,
  ip,
  lazy,
  literal,
  mapOf,
  maybe,
  nullable,
  never,
  number,
  object,
  oneOf,
  union: oneOf,
  discriminatedUnion,
  recordOf,
  stream,
  siblingRef,
  savedObjectId,
  savedObjectType,
  savedObjectVersion,
  spaceId,
  displayName,
  description,
  searchFilter,
  aggregation,
  querySortField,
  unboundedString,
  string,
  uri,
};

export type Schema = typeof schema;

import {
  META_FIELD_X_OAS_DISCONTINUED,
  META_FIELD_X_OAS_AVAILABILITY,
  META_FIELD_X_OAS_ANY,
  META_FIELD_X_OAS_OPTIONAL,
  META_FIELD_X_OAS_DEPRECATED,
  META_FIELD_X_OAS_MAX_LENGTH,
  META_FIELD_X_OAS_MIN_LENGTH,
  META_FIELD_X_OAS_GET_ADDITIONAL_PROPERTIES,
  META_FIELD_X_OAS_DISCRIMINATOR,
  META_FIELD_X_OAS_DISCRIMINATOR_DEFAULT_CASE,
} from './src/oas_meta_fields';

export const metaFields = Object.freeze({
  META_FIELD_X_OAS_DISCONTINUED,
  META_FIELD_X_OAS_AVAILABILITY,
  META_FIELD_X_OAS_ANY,
  META_FIELD_X_OAS_OPTIONAL,
  META_FIELD_X_OAS_DEPRECATED,
  META_FIELD_X_OAS_MAX_LENGTH,
  META_FIELD_X_OAS_MIN_LENGTH,
  META_FIELD_X_OAS_GET_ADDITIONAL_PROPERTIES,
  META_FIELD_X_OAS_DISCRIMINATOR,
  META_FIELD_X_OAS_DISCRIMINATOR_DEFAULT_CASE,
});
