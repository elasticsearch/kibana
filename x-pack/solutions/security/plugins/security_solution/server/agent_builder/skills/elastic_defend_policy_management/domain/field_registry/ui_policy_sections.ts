/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UIPolicyConfig } from '../../../../../../common/endpoint/types';

export const UI_POLICY_SECTIONS = {
  windows: {
    events: true,
    malware: true,
    ransomware: true,
    popup: true,
    antivirus_registration: true,
    advanced: true,
    memory_protection: true,
    behavior_protection: true,
    attack_surface_reduction: true,
    device_control: true,
  },
  mac: {
    malware: true,
    ransomware: true,
    events: true,
    popup: true,
    advanced: true,
    behavior_protection: true,
    memory_protection: true,
    device_control: true,
  },
  linux: {
    malware: true,
    events: true,
    popup: true,
    advanced: true,
    behavior_protection: true,
    memory_protection: true,
  },
} as const satisfies { [OS in keyof UIPolicyConfig]: { [S in keyof UIPolicyConfig[OS]]: true } };
