/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// RTL interaction helpers live in the app-menu package (the overflow popover is an app-menu
// concern); re-exported here so header tests have a single test-only entry point.
export { openAppMenuOverflow } from '@kbn/core-chrome-app-menu-components/test_helpers';
