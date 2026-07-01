/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

const MutationObserver = require('mutation-observer');
Object.defineProperty(window, 'MutationObserver', { value: MutationObserver });

// Required until JSDOM supports fetch: https://github.com/jsdom/jsdom/issues/1724
require('whatwg-fetch');

if (!Object.hasOwn(global.URL, 'createObjectURL')) {
  Object.defineProperty(global.URL, 'createObjectURL', { value: () => '' });
}

// https://github.com/jsdom/jsdom/issues/2524
if (!Object.hasOwn(global, 'TextEncoder')) {
  const customTextEncoding = require('@kayahr/text-encoding');
  global.TextEncoder = customTextEncoding.TextEncoder;
  global.TextDecoder = customTextEncoding.TextDecoder;
}

// JSDOM 20's Blob lacks .arrayBuffer() and .text() (jsdom#2555).
// Patch the missing methods with a FileReader rather than pulling in blob-polyfill.
if (typeof Blob !== 'undefined') {
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function () {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(this);
      });
    };
  }
  if (!Blob.prototype.text) {
    Blob.prototype.text = function () {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(this);
      });
    };
  }
}

if (!Object.hasOwn(global, 'ResizeObserver')) {
  global.ResizeObserver = class ResizeObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe(element) {
      element.addEventListener('resize', this.callback);
    }
    unobserve(element) {
      element.removeEventListener('resize', this.callback);
    }
    disconnect() {}
  };
}

if (!Object.hasOwn(global, 'Worker')) {
  class Worker {
    constructor(stringUrl) {
      this.url = stringUrl;
      this.onmessage = () => {};
    }

    postMessage(msg) {
      this.onmessage(msg);
    }
  }

  global.Worker = Worker;

  // Mocking matchMedia to resolve TypeError: window.matchMedia is not a function
  // For more info, see https://jestjs.io/docs/manual-mocks#mocking-methods-which-are-not-implemented-in-jsdom
  if (!Object.hasOwn(global, 'matchMedia')) {
    Object.defineProperty(global, 'matchMedia', {
      writable: true,
      value: (query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => {},
      }),
    });
  }
}

// @elastic/elasticsearch imports undici that requires on MessagePort (even when unused in the tests)
if (!Object.hasOwn(global, 'MessagePort')) {
  global.MessagePort = {};
}

// Required from ts decorators support in tests
import 'reflect-metadata/lite';
