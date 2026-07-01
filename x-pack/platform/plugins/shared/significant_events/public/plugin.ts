/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, CoreStart, Plugin, PluginInitializerContext } from '@kbn/core/public';

export interface SignificantEventsPublicPluginSetup {}
export interface SignificantEventsPublicPluginStart {}

export class SignificantEventsPublicPlugin
  implements Plugin<SignificantEventsPublicPluginSetup, SignificantEventsPublicPluginStart>
{
  constructor(_ctx: PluginInitializerContext) {}

  setup(_core: CoreSetup): SignificantEventsPublicPluginSetup {
    return {};
  }

  start(_core: CoreStart): SignificantEventsPublicPluginStart {
    return {};
  }
}
