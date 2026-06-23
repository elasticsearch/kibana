/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, unmountComponentAtNode } from 'react-dom';
import type { RouteComponentProps } from 'react-router-dom';
import { Redirect } from 'react-router-dom';
import { Router, Routes, Route } from '@kbn/shared-ux-router';
import { i18n } from '@kbn/i18n';
import type { CoreStart, AppMountParameters } from '@kbn/core/public';
import { ExitFullScreenButtonKibanaProvider } from '@kbn/shared-ux-button-exit-full-screen';
import {
  getCoreChrome,
  getMapsCapabilities,
  getEmbeddableService,
  getDocLinks,
  getCore,
} from './kibana_services';
import { ListPage, MapPage } from './routes';
import { APP_ID } from '../common/constants';
import { registerLayerWizards } from './classes/layers/wizards/load_layer_wizards';
import type { MapEmbeddableState } from '../common';

function setAppChrome() {
  if (!getMapsCapabilities().save) {
    getCoreChrome().setBadge({
      text: i18n.translate('xpack.maps.badge.readOnly.text', {
        defaultMessage: 'Read only',
      }),
      tooltip: i18n.translate('xpack.maps.badge.readOnly.tooltip', {
        defaultMessage: 'Unable to save maps',
      }),
      iconType: 'readOnly',
    });
  }

  const mapUrl = getDocLinks().links.maps.guide;

  getCoreChrome().setHelpExtension({
    appName: 'Maps',
    links: [
      {
        linkType: 'documentation',
        href: `${mapUrl}`,
      },
    ],
  });
}

export async function renderApp(
  { element, history, onAppLeave, setHeaderActionMenu, theme$ }: AppMountParameters,
  {
    coreStart,
    AppUsageTracker,
  }: {
    coreStart: CoreStart;
    AppUsageTracker: React.FC<{ children: React.ReactNode }>;
  }
) {
  const stateTransfer = getEmbeddableService().getStateTransfer();

  registerLayerWizards();
  setAppChrome();

  function renderMapApp(routeProps: RouteComponentProps<{ savedMapId?: string }>) {
    const { embeddableId, originatingApp, valueInput, originatingPath, breadcrumbs } =
      stateTransfer.getIncomingEditorState(APP_ID) || {};

    let mapEmbeddableState: MapEmbeddableState | undefined;
    if (routeProps.match.params.savedMapId) {
      mapEmbeddableState = {
        savedObjectId: routeProps.match.params.savedMapId,
      };
    } else if (valueInput) {
      mapEmbeddableState = valueInput as MapEmbeddableState;
    }

    return (
      <ExitFullScreenButtonKibanaProvider coreStart={getCore()}>
        <MapPage
          mapEmbeddableState={mapEmbeddableState}
          embeddableId={embeddableId}
          onAppLeave={onAppLeave}
          setHeaderActionMenu={setHeaderActionMenu}
          stateTransfer={stateTransfer}
          originatingApp={originatingApp}
          originatingPath={originatingPath}
          breadcrumbs={breadcrumbs}
          history={history}
          key={routeProps.match.params.savedMapId ? routeProps.match.params.savedMapId : 'new'}
        />
      </ExitFullScreenButtonKibanaProvider>
    );
  }

  render(
    coreStart.rendering.addContext(
      <AppUsageTracker>
        <Router history={history}>
          <Routes>
            <Route path={`/map/:savedMapId`} render={renderMapApp} />
            <Route exact path={`/map`} render={renderMapApp} />
            // Redirect other routes to list, or if hash-containing, their non-hash equivalents
            <Route
              path={``}
              render={({ location: { pathname, hash } }) => {
                if (hash) {
                  // Remove leading hash
                  const newPath = hash.substr(1);
                  return <Redirect to={newPath} />;
                } else if (pathname === '/' || pathname === '') {
                  return <ListPage history={history} stateTransfer={stateTransfer} />;
                } else {
                  return <Redirect to="/" />;
                }
              }}
            />
          </Routes>
        </Router>
      </AppUsageTracker>
    ),
    element
  );

  return () => {
    unmountComponentAtNode(element);
  };
}
