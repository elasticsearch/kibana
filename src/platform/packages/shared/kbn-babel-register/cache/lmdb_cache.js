/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

const Path = require('path');
const Crypto = require('crypto');

const chalk = require('chalk');
const LmdbStore = require('lmdb');

const { utf8StringKeyEncoder } = require('./lmdb_key_encoder');

const GLOBAL_ATIME = new Date().setHours(0, 0, 0, 0);
const MINUTE = 1000 * 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;

/** @typedef {import('./types').Cache} CacheInterface */
/** @typedef {import('lmdb').Database<import('./types').CacheEntry, string>} Db */

/**
 * @param {Db} db
 * @returns {string}
 */
const dbName = (db) =>
  // @ts-expect-error db.name is not a documented/typed property
  db.name;

/**
 * @implements {CacheInterface}
 */
class LmdbCache {
  /** @type {import('lmdb').RootDatabase<import('./types').CacheEntry, string>} */
  #db;
  /** @type {import('stream').Writable | undefined} */
  #log;
  /** @type {string} */
  #prefix;

  /**
   * @param {import('./types').CacheConfig} config
   */
  constructor(config) {
    this.#log = config.log;
    this.#prefix = config.prefix;
    // LMDB's default ordered-binary key decoder uses eval, which Kibana disallows.
    // Ideally ordered-binary will provide a CSP-safe decoder and this custom encoder can be removed.
    /**
     * `keyEncoder` is supported by lmdb but missing from its DatabaseOptions type.
     * @type {import('lmdb').RootDatabaseOptions & { keyEncoder: typeof utf8StringKeyEncoder }}
     */
    const databaseOptions = {
      name: 'db',
      encoding: 'json',
      keyEncoder: utf8StringKeyEncoder,
    };
    this.#db = LmdbStore.open(Path.resolve(config.dir, 'v6'), databaseOptions);

    const lastClean = this.#db.get('@last clean');
    if (!lastClean || lastClean[0] < GLOBAL_ATIME - 7 * DAY) {
      try {
        this.#pruneOldKeys();
      } catch (error) {
        process.stderr.write(`
Failed to cleanup @kbn/babel-register cache:

  ${error.stack.split('\n').join('\n  ')}

To eliminate this problem you may want to delete the "${Path.relative(process.cwd(), config.dir)}"
directory and report this error to the Operations team.\n`);
      } finally {
        this.#db.putSync('@last clean', [GLOBAL_ATIME, '', {}]);
      }
    }
  }

  /**
   * Get the cache key of the path and source from disk of a file
   * @param {string} path
   * @param {string} source
   * @returns {string}
   */
  getKey(path, source) {
    return `${this.#prefix}:${Crypto.createHash('sha1').update(path).update(source).digest('hex')}`;
  }

  /**
   * @param {string} key
   * @returns {string|undefined}
   */
  getCode(key) {
    const entry = this.#safeGet(this.#db, key);

    if (entry !== undefined && entry[0] !== GLOBAL_ATIME) {
      // when we use a file from the cache set the "atime" of that cache entry
      // so that we know which cache items we use and which haven't been
      // used in a long time (currently 30 days)
      this.#safePut(this.#db, key, [GLOBAL_ATIME, entry[1], entry[2]]);
    }

    return entry?.[1];
  }

  /**
   * @param {string} key
   * @returns {object|undefined}
   */
  getSourceMap(key) {
    const entry = this.#safeGet(this.#db, key);
    if (entry) {
      return entry[2];
    }
  }

  /**
   * @param {string} key
   * @param {{ code: string, map: object }} entry
   */
  async update(key, entry) {
    this.#safePut(this.#db, key, [GLOBAL_ATIME, entry.code, entry.map]);
  }

  /**
   * @param {Db} db
   * @param {string} key
   */
  #safeGet(db, key) {
    try {
      const value = db.get(key);
      this.#debug(value === undefined ? 'MISS' : 'HIT', db, key);
      return value;
    } catch (error) {
      if (error.message.includes('No transaction to renew')) {
        // this happens on errors very early in the process
        return undefined;
      }

      this.#logError('GET', db, key, error);
    }
  }

  /**
   * @param {Db} db
   * @param {string} key
   * @param {import('./types').CacheEntry} value
   */
  #safePut(db, key, value) {
    try {
      db.putSync(key, value);
      this.#debug('PUT', db, key);
    } catch (error) {
      this.#logError('PUT', db, key, error);
    }
  }

  /**
   * @param {string} type
   * @param {Db} db
   * @param {string} key
   */
  #debug(type, db, key) {
    this.#log?.write(`${type}   [${dbName(db)}]   ${String(key)}\n`);
  }

  /**
   * @param {'GET' | 'PUT'} type
   * @param {Db} db
   * @param {string} key
   * @param {Error} error
   */
  #logError(type, db, key, error) {
    this.#debug(`ERROR/${type}`, db, `${String(key)}: ${error.stack}`);
    process.stderr.write(
      chalk.red(
        `[@kbn/optimizer/node] ${type} error [${dbName(db)}/${String(key)}]: ${error.stack}\n`
      )
    );
  }

  #pruneOldKeys() {
    const ATIME_LIMIT = Date.now() - 30 * DAY;

    /** @type {string[]} */
    const toDelete = [];
    const flushDeletes = () => {
      if (!toDelete.length) {
        return;
      }

      this.#db.transactionSync(() => {
        for (const key of toDelete) {
          this.#db.removeSync(key);
        }
      });
    };

    for (const { key, value } of this.#db.getRange()) {
      if (Number.isNaN(value[0]) || value[0] < ATIME_LIMIT) {
        toDelete.push(key);

        // flush deletes early if there are many deleted
        if (toDelete.length > 10_000) {
          flushDeletes();
        }
      }
    }

    // delete all the old keys
    flushDeletes();
  }
}

exports.LmdbCache = LmdbCache;
