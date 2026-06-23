/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type * as H from 'history';
import { memo, useEffect, useState } from 'react';
import { withRouter } from 'react-router-dom';
import type { RouteComponentProps } from 'react-router-dom';
import deepEqual from 'fast-deep-equal';

import { omit } from 'lodash';
import type { SecurityPageName } from '../../../../common/constants';
import type { FlowTarget } from '../../../../common/search_strategy';
import { useRouteSpy } from './use_route_spy';
import type { RouteSpyState } from './types';

type SpyRouteProps = RouteComponentProps<{
  detailName: string | undefined;
  tabName?: string;
  search: string;
  flowTarget: FlowTarget | undefined;
}> & {
  location: H.Location;
  state?: Record<string, string | boolean | undefined>;
  pageName?: SecurityPageName;
  detailName?: string;
};

export const SpyRouteComponent = memo<SpyRouteProps>(
  ({
    location: { pathname, search },
    history,
    match: {
      params: { detailName: routeDetailName, tabName, flowTarget },
    },
    pageName,
    state,
    detailName: explicitDetailName,
  }) => {
    const detailName = explicitDetailName ?? routeDetailName;
    const [isInitializing, setIsInitializing] = useState(true);
    const [route, dispatch] = useRouteSpy();

    useEffect(() => {
      if (isInitializing && search !== '') {
        dispatch({
          type: 'updateSearch',
          search,
        });
        setIsInitializing(false);
      } else if (search !== '' && search !== route.search) {
        dispatch({
          type: 'updateSearch',
          search,
        });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    useEffect(() => {
      if (!pageName || (route.pathName === pathname && deepEqual(state, route.state))) {
        return;
      }

      const newRouteState = {
        detailName,
        flowTarget,
        history,
        pageName,
        pathName: pathname,
        search,
        state,
        tabName,
      } as RouteSpyState;

      if (isInitializing && detailName == null) {
        dispatch({
          type: 'updateRouteWithOutSearch',
          route: omit(newRouteState, 'search'),
        });
        setIsInitializing(false);

        return;
      }

      dispatch({
        type: 'updateRoute',
        route: newRouteState,
      });

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname, search, pageName, detailName, tabName, flowTarget, state]);
    return null;
  }
);

SpyRouteComponent.displayName = 'SpyRouteComponent';

export const SpyRoute = withRouter(SpyRouteComponent);
