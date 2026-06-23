/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Valid time units for Elastic Agent duration fields: milliseconds, seconds, minutes, hours
const DURATION_REGEX = /^\d+(ms|s|m|h)$/;

export const isValidDuration = (value: string): boolean => DURATION_REGEX.test(value);
