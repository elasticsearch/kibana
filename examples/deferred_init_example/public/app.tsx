/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { EuiIcon, EuiPageTemplate, EuiSpacer, EuiText, EuiTitle } from '@elastic/eui';
import { KbnInfoCallout, KbnSuccessCallout } from '@kbn/ui-callout';
import { FormattedMessage } from '@kbn/i18n-react';
import { KibanaRenderContextProvider } from '@kbn/react-kibana-context-render';
import type { AppMountParameters, CoreStart } from '@kbn/core/public';
import { DATA_ROUTE, INSTANCE_STATE_ROUTE } from '../common/constants';

interface DocData {
  message: string;
  greeting: string;
  initializedAt: string;
  initializedBy: string;
}

interface InstanceState {
  instanceUuid: string;
  initializedAt: string;
  completedPhases: string[];
}

interface DemoAppProps {
  http: CoreStart['http'];
}

// Because the plugin's manifest sets `enableLazyInitialize`, core has already gated this app
// behind its own loading screen (`core.deferredInit`) until deferred init succeeded — by the
// time this component mounts, both routes below are guaranteed to serve normally on the first
// hit, so neither fetch needs a retry loop.
const DemoApp: React.FC<DemoAppProps> = ({ http }) => {
  const [doc, setDoc] = useState<DocData | null>(null);
  const [instanceState, setInstanceState] = useState<InstanceState | null>(null);

  useEffect(() => {
    http.get<DocData>(DATA_ROUTE).then(setDoc);
    // Served straight out of the server plugin's memory, warmed by `lazyInitialize` on whichever
    // instance answers this request. Deferred init runs once per instance, so there is always one
    // to read.
    http.get<InstanceState>(INSTANCE_STATE_ROUTE).then(setInstanceState);
  }, [http]);

  return (
    <EuiPageTemplate>
      <EuiPageTemplate.Header>
        <EuiText>
          <h1>
            <FormattedMessage
              id="deferredInitExample.app.pageTitle"
              defaultMessage="Deferred Init Example"
            />
          </h1>
        </EuiText>
      </EuiPageTemplate.Header>
      <EuiPageTemplate.Section>
        <EuiTitle size="s">
          <h2>
            <FormattedMessage
              id="deferredInitExample.app.stepsTitle"
              defaultMessage="What lazy initialization did"
            />
          </h2>
        </EuiTitle>
        <EuiSpacer size="s" />
        {/* Hardcoded summary of the deferred-init phases that ran server-side. */}
        <EuiText size="s">
          <p>
            <EuiIcon type="check" color="success" aria-hidden={true} />{' '}
            <FormattedMessage
              id="deferredInitExample.app.step.migrations"
              defaultMessage="Ran saved object migrations"
            />
          </p>
          <p>
            <EuiIcon type="check" color="success" aria-hidden={true} />{' '}
            <FormattedMessage
              id="deferredInitExample.app.step.defaultState"
              defaultMessage="Initialized default state"
            />
          </p>
          <p>
            <EuiIcon type="check" color="success" aria-hidden={true} />{' '}
            <FormattedMessage
              id="deferredInitExample.app.step.dependency"
              defaultMessage="Loaded deferredInitExampleDependency's start contract via loadPluginContract"
            />
          </p>
          <p>
            <EuiIcon type="check" color="success" aria-hidden={true} />{' '}
            <FormattedMessage
              id="deferredInitExample.app.step.index"
              defaultMessage="Created the Elasticsearch index and mappings"
            />
          </p>
          <p>
            <EuiIcon type="check" color="success" aria-hidden={true} />{' '}
            <FormattedMessage
              id="deferredInitExample.app.step.document"
              defaultMessage="Wrote the default state document"
            />
          </p>
        </EuiText>
        <EuiSpacer />
        {doc !== null && (
          <KbnSuccessCallout
            announceOnMount
            title={
              <FormattedMessage
                id="deferredInitExample.app.successTitle"
                defaultMessage="Initialization complete"
              />
            }
            text={
              <>
                <p>
                  <strong>
                    <FormattedMessage
                      id="deferredInitExample.app.docMessageLabel"
                      defaultMessage="Message:"
                    />
                  </strong>{' '}
                  {doc.message}
                </p>
                <p>
                  <strong>
                    <FormattedMessage
                      id="deferredInitExample.app.docGreetingLabel"
                      defaultMessage="Greeting from deferredInitExampleDependency:"
                    />
                  </strong>{' '}
                  {doc.greeting}
                </p>
                <p>
                  <strong>
                    <FormattedMessage
                      id="deferredInitExample.app.docInitializedAtLabel"
                      defaultMessage="Initialized at:"
                    />
                  </strong>{' '}
                  {doc.initializedAt}
                </p>
                <p>
                  <strong>
                    <FormattedMessage
                      id="deferredInitExample.app.docInitializedByLabel"
                      defaultMessage="Last written by Kibana instance:"
                    />
                  </strong>{' '}
                  {doc.initializedBy}
                </p>
              </>
            }
          />
        )}
        {instanceState !== null && (
          <>
            <EuiSpacer />
            <KbnInfoCallout
              announceOnMount={false}
              title={
                <FormattedMessage
                  id="deferredInitExample.app.instanceStateTitle"
                  defaultMessage="Warmed in this instance's memory"
                />
              }
              text={
                <p>
                  <FormattedMessage
                    id="deferredInitExample.app.instanceStateDescription"
                    defaultMessage="Deferred initialization runs once on every Kibana instance, so it can populate
                      in-process state. This is read straight from the server plugin's memory on instance
                      {instanceUuid}, with no lock and nothing persisted: {phases}."
                    values={{
                      instanceUuid: <code>{instanceState.instanceUuid}</code>,
                      phases: <code>{instanceState.completedPhases.join(', ')}</code>,
                    }}
                  />
                </p>
              }
            />
          </>
        )}
      </EuiPageTemplate.Section>
    </EuiPageTemplate>
  );
};

export const renderApp = (coreStart: CoreStart, params: AppMountParameters): (() => void) => {
  ReactDOM.render(
    <KibanaRenderContextProvider {...coreStart}>
      <DemoApp http={coreStart.http} />
    </KibanaRenderContextProvider>,
    params.element
  );
  return () => ReactDOM.unmountComponentAtNode(params.element);
};
