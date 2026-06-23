/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { hasNamespaceName, isInProtectedNamespace } from '../base/namespaces';
import { isInternalTool } from './constants';

export const toolIdRegexp =
  /^(?:[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?))*$/;
export const toolIdMaxLength = 64;

const reservedKeywords = ['new'];

/**
 * Check if the given ID is a reserved ID
 * Atm this only checks for `new` because that's a value we're using for url paths on the UI.
 */
export const isReservedToolId = (id: string) => {
  return reservedKeywords.includes(id);
};

/**
 * Validate that a tool id has the right format,
 * returning an error message if it fails the validation,
 * and undefined otherwise.
 *
 * @param toolId: the toolId to validate
 * @param builtIn: set to true if we're validating a built-in (internal) tool id.
 */
export const validateToolId = ({
  toolId,
  builtIn,
}: {
  toolId: string;
  builtIn: boolean;
}): string | undefined => {
  if (!toolIdRegexp.test(toolId)) {
    return `Tool ids must start and end with a letter or number, and can only contain lowercase letters, numbers, dots, hyphens and underscores`;
  }
  if (toolId.length > toolIdMaxLength) {
    return `Tool ids are limited to ${toolIdMaxLength} characters.`;
  }
  if (hasNamespaceName(toolId)) {
    return `Tool id cannot have the same name as a reserved namespace.`;
  }
  if (!builtIn) {
    if (isInProtectedNamespace(toolId)) {
      return `Tool id is using a protected namespace.`;
    }
    if (isInternalTool(toolId)) {
      return `Tool id '${toolId}' is reserved for internal use.`;
    }
  }
};
