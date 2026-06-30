/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import seedrandom from 'seedrandom';
import { v4 as uuidv4 } from 'uuid';
import type { estypes } from '@elastic/elasticsearch';
import { SUPPORTED_HOST_OS_TYPE } from '../constants';

const OS_FAMILY = SUPPORTED_HOST_OS_TYPE;
/** Array of 14 day offsets */
const DAY_OFFSETS = Array.from({ length: 14 }, (_, i) => 8.64e7 * (i + 1));

const USERS = [
  'elastic',
  'shay',
  'Damian',
  'Sarai',
  'Deirdre',
  'Shawana',
  'Treena',
  'Ellamae',
  'Myriam',
  'Roberto',
  'Cordell',
  'Demetrice',
  'Audrea',
  'Shanel',
  'Gail',
  'Hermila',
  'Mara',
  'Elden',
  'Malisa',
  'Derick',
  'Teddy',
  'Dovie',
  'Betty',
  'Kay',
  'Sharice',
  'Evalyn',
  'Teressa',
  'Teisha',
  'Marianne',
  'Cherelle',
  'Tabitha',
  'Deneen',
  'Leo',
  'Tess',
  'Clair',
  'Marty',
  'Dexter',
  'Candis',
  'Dina',
  'Bennett',
  'Vesta',
  'Trinity',
  'Drusilla',
  'Bree',
  'Bryon',
  'Johnson',
  'Justa',
  'Jada',
  'Armand',
  'Raeann',
  'Yolande',
  'Genevieve',
];

const toEsSearchHit = <T extends object = object>(
  hitSource: T,
  index: string = 'some-index'
): estypes.SearchHit<T> => {
  return {
    _index: index,
    _id: '123',
    _score: 1.0,
    _source: hitSource,
    sort: ['abc'],
  };
};

const toEsSearchResponse = <T extends object = object>(
  hitsSource: Array<estypes.SearchHit<T>>
): estypes.SearchResponse<T> => {
  return {
    took: 3,
    timed_out: false,
    _shards: {
      total: 2,
      successful: 2,
      skipped: 0,
      failed: 0,
    },
    hits: {
      total: {
        value: hitsSource.length,
        relation: 'eq',
      },
      max_score: 0,
      hits: hitsSource,
    },
  };
};

/**
 * A generic base class to assist in creating domain specific data generators. It includes
 * several general purpose random data generators for use within the class and exposes one
 * public method named `generate()` which should be implemented by sub-classes.
 */
export class BaseDataGenerator<GeneratedDoc extends {} = {}> {
  /** A javascript seeded random number (float between 0 and 1). Don't use `Math.random()` */
  protected random: seedrandom.prng;

  constructor(seed: string | seedrandom.prng = Math.random().toString()) {
    if (typeof seed === 'string') {
      this.random = seedrandom(seed);
    } else {
      this.random = seed;
    }
  }

  /**
   * Generate a new record
   */
  public generate(): GeneratedDoc {
    throw new Error('method not implemented!');
  }

  public randomUser(): string {
    return this.randomChoice(USERS);
  }

  /** Returns a future ISO date string */
  protected randomFutureDate(from?: Date): string {
    const now = from ? from.getTime() : Date.now();
    return new Date(now + this.randomChoice(DAY_OFFSETS)).toISOString();
  }

  /** Returns a past ISO date string */
  protected randomPastDate(from?: Date): string {
    const now = from ? from.getTime() : Date.now();
    return new Date(now - this.randomChoice(DAY_OFFSETS)).toISOString();
  }

  /**
   * Generate either `true` or `false`. By default, the boolean is calculated by determining if a
   * float is less than `0.5`, but that can be adjusted via the input argument
   *
   * @param isLessThan
   */
  protected randomBoolean(isLessThan: number = 0.5): boolean {
    return this.random() < isLessThan;
  }

  /** generate random OS family value */
  public randomOSFamily(): (typeof OS_FAMILY)[number] {
    return this.randomChoice(OS_FAMILY);
  }

  /** generate a UUID (v4) */
  protected randomUUID(): string {
    return uuidv4();
  }

  /** generate a seeded random UUID v4 */
  protected seededUUIDv4(): string {
    return uuidv4({ random: new Uint8Array([...this.randomNGenerator(255, 16)]) });
  }

  /** Generate a random number up to the max provided */
  public randomN(max: number): number {
    return Math.floor(this.random() * max);
  }

  protected *randomNGenerator(max: number, count: number) {
    let iCount = count;
    while (iCount > 0) {
      yield this.randomN(max);
      iCount = iCount - 1;
    }
  }

  /**
   * Create an array of a given size and fill it with data provided by a generator
   *
   * @param lengthLimit
   * @param generator
   * @protected
   */
  protected randomArray<T>(lengthLimit: number, generator: () => T): T[] {
    const rand = this.randomN(lengthLimit) + 1;
    return [...Array(rand).keys()].map(generator);
  }

  protected randomMac(): string {
    return [...this.randomNGenerator(255, 6)].map((x) => x.toString(16)).join('-');
  }

  protected randomIP(): string {
    return [10, ...this.randomNGenerator(255, 3)].map((x) => x.toString()).join('.');
  }

  protected randomVersion(): string {
    // the `major` is sometimes (30%) 7 and most of the time (70%) 8
    const major = this.randomBoolean(0.4) ? 7 : 8;
    return [major, ...this.randomNGenerator(20, 2)].map((x) => x.toString()).join('.');
  }

  public randomChoice<T>(choices: T[] | readonly T[]): T {
    return choices[this.randomN(choices.length)];
  }

  protected randomString(length: number): string {
    return [...this.randomNGenerator(36, length)].map((x) => x.toString(36)).join('');
  }

  protected randomHostname(): string {
    return `Host-${this.randomString(10)}`;
  }

  /**
   * Returns an single search hit (normally found in a `SearchResponse`) for the given document source.
   * @param hitSource
   * @param index
   */
  toEsSearchHit<T extends object = object>(
    hitSource: T,
    index: string = 'some-index'
  ): estypes.SearchHit<T> {
    const hit = toEsSearchHit<T>(hitSource, index);
    hit._id = this.seededUUIDv4();

    return hit;
  }

  static toEsSearchHit<T extends object = object>(
    hitSource: T,
    index: string = 'some-index'
  ): estypes.SearchHit<T> {
    return toEsSearchHit<T>(hitSource, index);
  }

  /**
   * Returns an ES Search Response for the give set of records. Each record will be wrapped with
   * the `toEsSearchHit()`
   * @param hitsSource
   */
  toEsSearchResponse<T extends object = object>(
    hitsSource: Array<estypes.SearchHit<T>>
  ): estypes.SearchResponse<T> {
    return toEsSearchResponse<T>(hitsSource);
  }

  static toEsSearchResponse<T extends object = object>(
    hitsSource: Array<estypes.SearchHit<T>>
  ): estypes.SearchResponse<T> {
    return toEsSearchResponse<T>(hitsSource);
  }
}
