/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { FieldType, type ConfigValue } from '../../types/types';

export const validIntInput = (value: ConfigValue): boolean => {
  // reject non integers (including x.0 floats), but don't validate if empty
  return (value !== null || value !== '') &&
    (isNaN(Number(value)) ||
      !Number.isSafeInteger(Number(value)) ||
      ensureStringType(value).indexOf('.') >= 0)
    ? false
    : true;
};

export const ensureCorrectTyping = (type: FieldType, value: ConfigValue): ConfigValue => {
  switch (type) {
    case FieldType.INTEGER:
      return validIntInput(value) ? ensureIntType(value) : value;
    case FieldType.BOOLEAN:
      return ensureBooleanType(value);
    case FieldType.LIST:
    case FieldType.MAP:
      return value;
    default:
      return ensureStringType(value);
  }
};

export const ensureStringType = (value: ConfigValue): string => {
  return value !== null ? String(value) : '';
};

export const ensureIntType = (value: ConfigValue): number | null => {
  // int is null-safe to prevent empty values from becoming zeroes
  if (value === null || value === '') {
    return null;
  }

  return parseInt(String(value), 10);
};

export const ensureBooleanType = (value: ConfigValue): boolean => {
  return Boolean(value);
};
