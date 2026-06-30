/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { Route, Switch } from 'react-router-dom';
import type { SecuritySubPluginRoutes } from '../app/types';
import { SecurityPageName } from '../app/types';
import {
  RULES_V2_PATH,
  RULES_V2_CREATE_PATH,
  RULES_V2_VIEW_PATH,
  RULES_V2_EDIT_PATH,
} from '../../common/constants';
import { PluginTemplateWrapper } from '../common/components/plugin_template_wrapper';
import { SecurityRoutePageWrapper } from '../common/components/security_route_page_wrapper';
import { RulesV2ListPage } from './pages/rules_v2_list_page';
import { RulesV2CreatePage } from './pages/rules_v2_create_page';
import { RulesV2ViewPage } from './pages/rules_v2_view_page';

const RulesV2Routes = () => (
  <PluginTemplateWrapper>
    <SecurityRoutePageWrapper pageName={SecurityPageName.rulesV2}>
      <Switch>
        <Route path={RULES_V2_CREATE_PATH} exact>
          <RulesV2CreatePage />
        </Route>
        <Route path={RULES_V2_VIEW_PATH} exact>
          <RulesV2ViewPage />
        </Route>
        <Route path={RULES_V2_EDIT_PATH} exact>
          <RulesV2CreatePage />
        </Route>
        <Route path={RULES_V2_PATH}>
          <RulesV2ListPage />
        </Route>
      </Switch>
    </SecurityRoutePageWrapper>
  </PluginTemplateWrapper>
);

export const routes: SecuritySubPluginRoutes = [
  {
    path: RULES_V2_PATH,
    component: RulesV2Routes,
  },
];
