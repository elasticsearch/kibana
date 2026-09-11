/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

const Fs = require('fs');
const Path = require('path');
const Crypto = require('crypto');

const chalk = require('chalk');
const LmdbStore = require('lmdb');

const { utf8StringKeyEncoder } = require('./lmdb_key_encoder');

const GLOBAL_ATIME = new Date().setHours(0, 0, 0, 0);
const MINUTE = 1000 * 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const ATIME_REFRESH_INTERVAL = 7 * DAY;
const ATIME_LIMIT = 30 * DAY;
const DELETE_BATCH_SIZE = 10_000;
const LAST_CLEAN_KEY = '@last clean';
const CODE_KEY_PREFIX = 'code:';
const MAP_KEY_PREFIX = 'map:';

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
 * @param {unknown} value
 * @returns {value is import('./types').LegacyCacheEntry | import('./types').CodeCacheEntry}
 */
const isCacheCodeEntry = (value) => Array.isArray(value) && typeof value[0] === 'number';

/**
 * @param {string} key
 */
const getCodeKey = (key) => `${CODE_KEY_PREFIX}${key}`;

/**
 * @param {string} key
 */
const getMapKey = (key) => `${MAP_KEY_PREFIX}${key}`;

/**
 * @param {string} prefix
 * @param {string} path
 * @param {string} source
 * @returns {string}
 */
const getHashCacheKey = (prefix, path, source) =>
  `${prefix}:${Crypto.createHash('sha256').update(path).update(source).digest('hex')}`;

/**
 * @param {bigint | number} value
 * @returns {string | undefined}
 */
const getStatValue = (value) => {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  return Number.isFinite(value) ? String(value) : undefined;
};

/**
 * @param {string} prefix
 * @param {string} path
 * @returns {string | undefined}
 */
const getMetadataCacheKey = (prefix, path) => {
  let stat;
  try {
    stat = Fs.statSync(path, { bigint: true });
  } catch {
    return undefined;
  }

  const keyParts = [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs].map(
    getStatValue
  );

  if (keyParts.some((part) => part === undefined)) {
    return undefined;
  }

  return `${prefix}:stat:${keyParts.join(':')}:${Path.resolve(path)}`;
};

/**
 * @implements {CacheInterface}
 */
class LmdbCache {
  /** @type {import('lmdb').RootDatabase<import('./types').CacheEntry, string>} */
  #db;
  /** @type {boolean} */
  #closed = false;
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
    this.#db = LmdbStore.open(Path.resolve(config.dir, 'v2'), databaseOptions);

    const lastClean = this.#db.get(LAST_CLEAN_KEY);
    if (!isCacheCodeEntry(lastClean) || lastClean[0] < GLOBAL_ATIME - 7 * DAY) {
      try {
        this.#pruneOldKeys();
      } catch (error) {
        process.stderr.write(`
Failed to cleanup @kbn/swc-register cache:

  ${error.stack.split('\n').join('\n  ')}

To eliminate this problem you may want to delete the "${Path.relative(process.cwd(), config.dir)}"
directory and report this error to the Operations team.\n`);
      } finally {
        this.#db.putSync(LAST_CLEAN_KEY, [GLOBAL_ATIME, '']);
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
    return getMetadataCacheKey(this.#prefix, path) ?? getHashCacheKey(this.#prefix, path, source);
  }

  /**
   * @param {string} key
   * @returns {string|undefined}
   */
  getCode(key) {
    const entry = this.#safeGet(this.#db, getCodeKey(key));

    if (!isCacheCodeEntry(entry)) {
      return undefined;
    }

    if (entry[0] < GLOBAL_ATIME - ATIME_REFRESH_INTERVAL) {
      this.#safePutAsync(this.#db, getCodeKey(key), [GLOBAL_ATIME, entry[1]]);
    }

    return entry[1];
  }

  /**
   * @param {string} key
   * @returns {object|undefined}
   */
  getSourceMap(key) {
    const entry = this.#safeGet(this.#db, getMapKey(key));
    return entry && !Array.isArray(entry) ? entry : undefined;
  }

  /**
   * @param {string} key
   * @param {{ code: string, map?: object | null }} entry
   * @returns {Promise<void>}
   */
  update(key, entry) {
    const writes = [this.#safePutAsync(this.#db, getCodeKey(key), [GLOBAL_ATIME, entry.code])];

    if (entry.map) {
      writes.push(this.#safePutAsync(this.#db, getMapKey(key), entry.map));
    }

    return Promise.all(writes).then(() => undefined);
  }

  /**
   * @returns {Promise<void>}
   */
  close() {
    if (this.#closed) {
      return Promise.resolve();
    }

    this.#closed = true;
    const db = this.#db;

    try {
      return Promise.resolve(db.close()).then(
        () => undefined,
        (error) => {
          this.#logError('CLOSE', db, '', error);
        }
      );
    } catch (error) {
      this.#logError('CLOSE', db, '', error);
      return Promise.resolve();
    }
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
  #safePutAsync(db, key, value) {
    try {
      return Promise.resolve(db.put(key, value)).then(
        () => {
          this.#debug('PUT', db, key);
        },
        (error) => {
          this.#logError('PUT', db, key, error);
        }
      );
    } catch (error) {
      this.#logError('PUT', db, key, error);
      return Promise.resolve();
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
   * @param {'GET' | 'PUT' | 'CLOSE'} type
   * @param {Db} db
   * @param {string} key
   * @param {Error} error
   */
  #logError(type, db, key, error) {
    this.#debug(`ERROR/${type}`, db, `${String(key)}: ${error.stack}`);
    process.stderr.write(
      chalk.red(
        `[@kbn/swc-register] ${type} error [${dbName(db)}/${String(key)}]: ${error.stack}\n`
      )
    );
  }

  #pruneOldKeys() {
    const atimeLimit = Date.now() - ATIME_LIMIT;

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
      toDelete.length = 0;
    };

    for (const { key, value } of this.#db.getRange()) {
      if (key === LAST_CLEAN_KEY || key.startsWith(MAP_KEY_PREFIX)) {
        continue;
      }

      if (!isCacheCodeEntry(value) || Number.isNaN(value[0]) || value[0] < atimeLimit) {
        toDelete.push(key);

        if (key.startsWith(CODE_KEY_PREFIX)) {
          toDelete.push(getMapKey(key.slice(CODE_KEY_PREFIX.length)));
        }

        if (toDelete.length > DELETE_BATCH_SIZE) {
          flushDeletes();
        }
      }
    }

    flushDeletes();
  }
}

module.exports = {
  LmdbCache,
};
