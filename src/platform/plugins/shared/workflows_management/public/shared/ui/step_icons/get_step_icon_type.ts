/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IconType } from '@elastic/eui';
import type { EuiIconType } from '@elastic/eui/src/components/icon/icon';
import { HardcodedIcons } from './hardcoded_icons';

export const getTriggerTypeIconType = (triggerType: string): EuiIconType => {
  switch (triggerType) {
    case 'trigger_manual':
      return 'play';
    case 'trigger_alert':
      return 'warning';
    case 'trigger_document':
    case 'trigger_event':
      return 'document';
    case 'trigger_scheduled':
      return 'clock';
    default:
      return 'info';
  }
};

// Switch has good readability as it is
// eslint-disable-next-line complexity
export const getStepIconType = (nodeType: string): IconType => {
  let iconType: IconType = 'info';

  switch (nodeType) {
    // built-in node types
    case 'http':
      iconType = 'globe';
      break;
    case 'console':
      iconType = 'commandLine';
      break;
    case 'data.set':
      iconType = 'database';
      break;
    case 'workflow.execute':
      iconType = HardcodedIcons['workflow.execute'];
      break;
    case 'workflow.executeAsync':
      iconType = HardcodedIcons['workflow.executeAsync'];
      break;
    case 'workflow.output':
      iconType = HardcodedIcons['workflow.output'];
      break;
    case 'workflow.fail':
      iconType = HardcodedIcons['workflow.fail'];
      break;
    // `workflow` (bare base type) is handled in StepIcon's BASE_TYPE_AGGREGATE_ICONS.

    // trigger nodes
    case 'manual':
      iconType = HardcodedIcons.manual;
      break;
    case 'alert':
      iconType = HardcodedIcons.alert;
      break;
    case 'scheduled':
      iconType = HardcodedIcons.scheduled;
      break;

    // flow control nodes
    case 'wait':
      iconType = 'clock';
      break;
    case 'waitForInput':
      iconType = 'user';
      break;
    case 'enter-if':
    case 'exit-if':
    case 'enter-condition-branch':
    case 'exit-condition-branch':
    case 'if':
      iconType = 'branch';
      break;
    case 'if-branch':
      iconType = 'tokenBoolean';
      break;
    case 'enter-foreach':
    case 'foreach':
    case 'enter-while':
    case 'while':
      iconType = 'refresh';
      break;
    case 'foreach-iteration':
    case 'while-iteration':
      iconType = 'tokenNumber';
      break;
    case 'loop.break':
    case 'loop.continue':
    case 'loop-break':
    case 'loop-continue':
      iconType = 'controls';
      break;
    case 'switch':
    case 'enter-switch':
    case 'exit-switch':
    case 'enter-case-branch':
    case 'exit-case-branch':
    case 'enter-default-branch':
    case 'exit-default-branch':
      iconType = 'productStreamsWired';
      break;

    // connectors which use EUI icons
    case 'email':
      iconType = 'mail';
      break;
    case 'slack':
    case 'slack_api':
      iconType = 'logoSlack';
      break;
    case 'inference':
      iconType = 'sparkles';
      break;

    // other connectors
    // will be handled by in getStackConnectorIcon

    default:
      if (nodeType.startsWith('elasticsearch')) {
        iconType = 'logoElasticsearch';
      } else if (nodeType.startsWith('kibana')) {
        iconType = 'logoKibana';
      } else {
        iconType = 'plugs';
      }
      break;
  }
  return iconType;
};
