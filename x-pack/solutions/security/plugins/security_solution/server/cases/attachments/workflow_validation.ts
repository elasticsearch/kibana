/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { isPlainObject } from 'lodash';
import type { WorkflowAttachmentValidationContext } from '@kbn/cases-plugin/server';

const getSelectedIds = (
  inputs: Record<string, unknown>,
  field: 'alertIds' | 'documents'
): string[] => {
  const event = isPlainObject(inputs.event) ? (inputs.event as Record<string, unknown>) : undefined;
  const pairs = event?.[field];
  if (!Array.isArray(pairs)) {
    return [];
  }

  return pairs.flatMap((pair) => {
    if (!isPlainObject(pair) || typeof pair._id !== 'string') {
      return [];
    }
    return [pair._id];
  });
};

const targetsMatch = (targets: readonly string[], selectedIds: readonly string[]): boolean => {
  const targetSet = new Set(targets);
  const selectedSet = new Set(selectedIds);
  return (
    targetSet.size === selectedSet.size &&
    [...targetSet].every((targetId) => selectedSet.has(targetId))
  );
};

export const validateAlertWorkflowTargets = ({
  targets,
  inputs,
}: WorkflowAttachmentValidationContext): void => {
  const selectedIds = getSelectedIds(inputs, 'alertIds');
  if (selectedIds.length === 0) {
    throw Boom.badRequest('Alert attachment workflow origins require selected alert inputs.');
  }
  if (
    !targetsMatch(
      targets.map(({ id }) => id),
      selectedIds
    )
  ) {
    throw Boom.badRequest('Alert workflow origin targets must match the selected alerts.');
  }
};

export const validateEventWorkflowTargets = ({
  targets,
  inputs,
}: WorkflowAttachmentValidationContext): void => {
  const selectedIds = getSelectedIds(inputs, 'documents');
  if (selectedIds.length === 0) {
    throw Boom.badRequest('Event attachment workflow origins require selected document inputs.');
  }
  if (
    !targetsMatch(
      targets.map(({ id }) => id),
      selectedIds
    )
  ) {
    throw Boom.badRequest('Event workflow origin targets must match the selected documents.');
  }
};
