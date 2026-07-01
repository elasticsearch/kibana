/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Harden the prototypes of built-in objects to prevent prototype pollution attacks.
 * This function should be called after the polyfills have been loaded, as some polyfills require the prototypes to be mutable.
 * The one known requirement is corejs mutating the Array prototype.
 */
function hardenPrototypesPostPolyfill() {
  // @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/seal
  // > The Object.seal() static method seals an object.
  // > Sealing an object prevents extensions and makes existing properties non-configurable.
  // > A sealed object has a fixed set of properties: new properties cannot be added, existing properties cannot be removed,
  // > their enumerability and configurability cannot be changed, and its prototype cannot be re-assigned.
  // > Values of existing properties can still be changed as long as they are writable.
  // Object.freeze would take this one step further, and prevent the values of the properties from being changed as well.
  // This is not currently feasible for Kibana, as this functionality is required for some of the libraries that we use, such as react-dom/server.
  // While Object.seal() is not a silver bullet, it does provide a good balance between security and compatibility.
  // The goal is to prevent a majority of prototype pollution vulnerabilities that can be exploited by an attacker.

  // ** IMPORTANT **
  // This is used both in the browser and in Node.js.
  // For Node.js, we _additionally_ seal prototypes in `src/setup_node_env/harden/prototype.js`.
  // This results in sealing prototypes twice on the server.
  // The extra seal is a no-op, but it is done to ensure that the same code is run in both environments.

  // Block prototype *reassignment* via the __proto__ setter. Redefine the accessor to keep a
  // working getter (reads like `[].__proto__` still return the correct prototype) but a no-op
  // setter that silently ignores writes. Must run before the seal while the property is still
  // configurable. Object.setPrototypeOf / Object.create are unaffected; object-literal
  // `{ __proto__: x }` syntax is a spec-level operation that does not use this accessor.
  //
  // The guard is required because on the server `src/setup_node_env/harden/prototype.js`
  // runs first and sets the property to non-configurable. This function then runs a second
  // time (intentionally, as a no-op for the seals). After the first run the property is
  // non-configurable, so the second defineProperty call would throw — the guard skips it.
  const protoDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, '__proto__');
  if (protoDescriptor && protoDescriptor.configurable) {
    // eslint-disable-next-line no-extend-native
    Object.defineProperty(Object.prototype, '__proto__', {
      get() {
        return Object.getPrototypeOf(this);
      },
      set() {
        /* no-op: block prototype reassignment via __proto__ */
      },
      enumerable: false,
      configurable: false,
    });
  }

  Object.seal(Object.prototype);
  Object.seal(Number.prototype);
  Object.seal(String.prototype);
  Object.seal(Function.prototype);
  Object.seal(Array.prototype);
  Object.seal(Boolean.prototype);
}

// Use of the `KBN_UNSAFE_DISABLE_PROTOTYPE_HARDENING` environment variable is discouraged, and should only be set to facilitate testing
// specific scenarios. This should never be set in production.
if (!process.env.KBN_UNSAFE_DISABLE_PROTOTYPE_HARDENING) {
  hardenPrototypesPostPolyfill();
}
