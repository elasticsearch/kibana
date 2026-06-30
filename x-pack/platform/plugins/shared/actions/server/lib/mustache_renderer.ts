/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Mustache from 'mustache';
import { isString, isPlainObject, cloneDeepWith } from 'lodash';
import { setWith } from '@kbn/safer-lodash-set';
import type { Logger } from '@kbn/core/server';
import { getMustacheLambdas } from './mustache_lambdas';

export type Escape = 'markdown' | 'slack' | 'json' | 'none' | 'html';

// Capture Mustache's built-in HTML escape before any render calls can change it.
// This is the default Mustache.escape: it escapes &, <, >, ", ', /, `, and =.
const mustacheEscapeHtml = Mustache.escape;

type Variables = Record<string, unknown>;

// return a rendered mustache template with no escape given the specified variables and escape
// Individual variable values should be stringified already
export function renderMustacheStringNoEscape(string: string, variables: Variables): string {
  try {
    return Mustache.render(`${string}`, variables);
  } catch (err) {
    // log error; the mustache code does not currently leak variables
    return `error rendering mustache template "${string}": ${err.message}`;
  }
}

// return a rendered mustache template given the specified variables and escape
export function renderMustacheString(
  logger: Logger,
  string: string,
  variables: Variables,
  escape: Escape
): string;
export function renderMustacheString(
  logger: Logger,
  string: string | null,
  variables: Variables,
  escape: Escape
): string | null;
export function renderMustacheString(
  logger: Logger,
  string: string | undefined,
  variables: Variables,
  escape: Escape
): string | undefined;
export function renderMustacheString(
  logger: Logger,
  string: string | null | undefined,
  variables: Variables,
  escape: Escape
): string | null | undefined {
  if (string == null) return string;
  const augmentedVariables = augmentObjectVariables(variables);
  return renderMustacheStringWithAugmentedVariables(logger, string, augmentedVariables, escape);
}

// render a string with variables that have already been augmented with augmentObjectVariables().
function renderMustacheStringWithAugmentedVariables(
  logger: Logger,
  string: string,
  augmentedVariables: Variables,
  escape: Escape
): string {
  const lambdas = getMustacheLambdas(logger);

  const previousMustacheEscape = Mustache.escape;
  Mustache.escape = getEscape(escape);

  try {
    return Mustache.render(`${string}`, { ...lambdas, ...augmentedVariables });
  } catch (err) {
    // log error; the mustache code does not currently leak variables
    return `error rendering mustache template "${string}": ${err.message}`;
  } finally {
    Mustache.escape = previousMustacheEscape;
  }
}

// return a cloned object with all strings rendered as mustache templates
export function renderMustacheObject<Params>(
  logger: Logger,
  params: Params,
  variables: Variables
): Params {
  const augmentedVariables = augmentObjectVariables(variables);
  const result = cloneDeepWith(params, (value: unknown) => {
    if (!isString(value)) return;

    // since we're rendering a JS object, no escaping needed
    return renderMustacheStringWithAugmentedVariables(logger, value, augmentedVariables, 'none');
  });

  // The return type signature for `cloneDeep()` ends up taking the return
  // type signature for the customizer, but rather than pollute the customizer
  // with casts, seemed better to just do it in one place, here.
  return result as unknown as Params;
}

// Returns a fresh, isolated copy of the variables (the caller's object is not
// mutated), prepared for mustache rendering:
//   - dotted keys are expanded into nested objects ({ 'a.b': 2 } → { a: { b: 2 } }),
//     with sibling dotted keys accumulating into the same object
//     (kibana.alert.rule.name + kibana.alert.rule.category → one `rule` object)
//   - every plain object gets a toString() that serialises it to JSON
//   - every array gets an asJSON()
//
// When a dotted key and a nested object resolve to the same path, the last write
// wins (the leaf is overwritten, not deep-merged). Alerting payloads never mix
// the dotted and nested representations at the same node, so rendered output is
// unaffected.
function augmentObjectVariables(variables: Variables): Variables {
  const result = JSON.parse(JSON.stringify(variables));
  expandDottedKeys(result);
  addToStringDeep(result);
  return result;
}

// Path segments that must never be used to index into an object: __proto__,
// constructor and prototype expose the prototype chain and could be used for
// prototype pollution. Any dotted key containing one of these is dropped.
function isUnsafeKey(key: string): boolean {
  return key === '__proto__' || key === 'constructor' || key === 'prototype';
}

// setWith path-creation customizer: reuse an existing object/array at a path
// segment, otherwise create a fresh plain object. Always using plain objects
// keeps numeric-looking segments as object keys (instead of array indices), and
// replaces a scalar already sitting at an intermediate path with the object
// ({ a: 1, 'a.b': 2 } → { a: { b: 2 } }).
function expandPathSegment(existing: unknown): unknown {
  return existing !== null && typeof existing === 'object' ? existing : {};
}

// Expands dotted own-keys ('a.b.c') into nested objects in place, removing the
// original dotted key. setWith walks into objects a prior sibling already
// created, so keys sharing a prefix accumulate into one object. Recurses so
// dotted keys nested inside values are expanded too.
function expandDottedKeys(node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach(expandDottedKeys);
    return;
  }
  if (!isNonNullObject(node)) return;

  // Snapshot keys up front: we mutate `node` (delete dotted keys, add expanded
  // ones) while iterating.
  for (const key of Object.keys(node)) {
    if (!key.includes('.')) continue;
    const value = node[key];
    delete node[key];
    const parts = key.split('.');
    if (parts.some(isUnsafeKey)) continue;
    setWith(node, parts, value, expandPathSegment);
  }

  // Recurse after expansion so dotted keys nested inside values are handled too.
  for (const key of Object.keys(node)) {
    expandDottedKeys(node[key]);
  }
}

// Recursively attaches a toString() that JSON-serialises each plain object, and
// an asJSON() to each array (arrays keep their default mustache toString). A
// user-supplied 'toString' key is left untouched.
function addToStringDeep(object: unknown): void {
  if (isNonNullObject(object)) {
    if (!Object.hasOwn(object, 'toString')) {
      object.toString = () => JSON.stringify(object);
    }
    Object.values(object).forEach(addToStringDeep);
    return;
  }

  if (Array.isArray(object)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (object as any).asJSON = () => JSON.stringify(object);
    object.forEach(addToStringDeep);
  }
}

function isNonNullObject(object: unknown): object is Record<string, unknown> {
  if (object == null) return false;
  if (typeof object !== 'object') return false;
  if (!isPlainObject(object)) return false;
  return true;
}

function getEscape(escape: Escape): (value: unknown) => string {
  if (escape === 'markdown') return escapeMarkdown;
  if (escape === 'slack') return escapeSlack;
  if (escape === 'json') return escapeJSON;
  if (escape === 'html') return mustacheEscapeHtml;
  return escapeNone;
}

function escapeNone(value: unknown): string {
  if (value == null) return '';
  return `${value}`;
}

// replace with JSON stringified version, removing leading and trailing double quote
function escapeJSON(value: unknown): string {
  if (value == null) return '';

  const quoted = JSON.stringify(`${value}`);
  // quoted will always be a string with double quotes, but we don't want the double quotes
  return quoted.substr(1, quoted.length - 2);
}

// see: https://api.slack.com/reference/surfaces/formatting
// but in practice, a bit more needs to be escaped, in drastic ways
function escapeSlack(value: unknown): string {
  if (value == null) return '';

  const valueString = `${value}`;
  // if the value contains * or _ and is not a url, escape the whole thing with back tics
  if (valueString.includes('_') || valueString.includes('*')) {
    try {
      new URL(valueString);
    } catch (e) {
      // replace unescapable back tics with single quote
      return '`' + valueString.replace(/`/g, `'`) + '`';
    }
  }

  // otherwise, do "standard" escaping
  return (
    valueString
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // this isn't really standard escaping, but escaping back tics is problematic
      .replace(/`/g, `'`)
  );
}

// see: https://www.markdownguide.org/basic-syntax/#characters-you-can-escape
function escapeMarkdown(value: unknown): string {
  if (value == null) return '';

  return `${value}`
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/`/g, '\\`')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!');
}
