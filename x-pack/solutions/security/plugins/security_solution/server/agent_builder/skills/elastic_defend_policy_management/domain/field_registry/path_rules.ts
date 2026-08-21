/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ANTIVIRUS_REGISTRATION_ENABLED_PATH } from '../../../../../../common/endpoint/utils/update_antivirus_registration_enabled';

const POPUP_MESSAGE_PATH = /(?:^|\.)popup\.[^.]+\.message$/;

export const isExcludedPath = (path: string): boolean =>
  path === 'meta' || path.startsWith('meta.') || POPUP_MESSAGE_PATH.test(path);

export const isDerivedPath = (path: string): boolean =>
  path === ANTIVIRUS_REGISTRATION_ENABLED_PATH;
