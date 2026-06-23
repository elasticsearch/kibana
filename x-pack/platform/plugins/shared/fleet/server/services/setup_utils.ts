/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// the promise which tracks the setup
let status: Promise<any> | undefined;
let isPending = false;
// default resolve to guard against "undefined is not a function" errors
let onResolve = (value?: unknown) => {};
let onReject = (reason: any) => {};

export async function awaitIfPending<T>(asyncFunction: () => Promise<T>): Promise<T> {
  // pending successful or failed attempt
  if (isPending) {
    // don't run concurrent installs
    // return a promise which will eventually resolve/reject
    return status;
  } else {
    // create the initial promise
    status = new Promise((res, rej) => {
      isPending = true;
      onResolve = res;
      onReject = rej;
    });
  }
  try {
    const result = await asyncFunction().catch(onReject);
    onResolve(result);
  } catch (error) {
    // if something fails
    onReject(error);
  }
  isPending = false;
  // Capture the settled promise to return, then clear the module-level reference so its
  // resolved value (which may contain large ResponseError objects) can be garbage-collected.
  // Concurrent callers that entered while isPending=true already hold their own reference
  // to this same promise, so clearing it here does not affect them.
  const settled = status;
  status = undefined;
  return settled;
}
