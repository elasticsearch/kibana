/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const securityAttacksAlignmentServerArgs = [
  `--xpack.securitySolution.enableExperimental=${JSON.stringify([
    'enableAlertsAndAttacksAlignment',
    // Registers the `security.attack` cases attachment type and shows the attack
    // add-to-case actions, which the attack case-attachment specs exercise.
    'attackAttachmentsEnabled',
  ])}`,
  // Enable staff-owned cloud behavior so attack discovery data-generator routes are available in build-based Scout runs.
  '--xpack.cloud.is_elastic_staff_owned=true',
];
