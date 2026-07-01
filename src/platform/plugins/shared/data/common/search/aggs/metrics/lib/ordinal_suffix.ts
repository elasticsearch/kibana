/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// adopted from http://stackoverflow.com/questions/3109978/php-display-number-with-ordinal-suffix
export function ordinalSuffix(num: string | number): string {
  return num + '' + suffix(num);
}

function suffix(num: string | number): string {
  const int = Math.floor(parseFloat(String(num)));

  const hunth = int % 100;
  if (hunth >= 11 && hunth <= 13) return 'th';

  const tenth = int % 10;
  if (tenth === 1) return 'st';
  if (tenth === 2) return 'nd';
  if (tenth === 3) return 'rd';
  return 'th';
}
