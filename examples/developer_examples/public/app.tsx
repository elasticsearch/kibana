/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState } from 'react';
import ReactDOM from 'react-dom';

import {
  EuiText,
  EuiPageTemplate,
  EuiCard,
  EuiPageHeader,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFieldSearch,
  EuiListGroup,
  EuiHighlight,
  EuiLink,
  EuiButtonIcon,
  EuiToolTip,
} from '@elastic/eui';
import type { AppMountParameters } from '@kbn/core/public';
import type { RenderingService } from '@kbn/core-rendering-browser';
import type { ExampleDefinition } from './types';

interface Props {
  rendering: RenderingService;
  examples: ExampleDefinition[];
  navigateToApp: (appId: string) => void;
  getUrlForApp: (appId: string) => string;
}

function DeveloperExamples({ examples, navigateToApp, getUrlForApp, rendering }: Props) {
  const [search, setSearch] = useState<string>('');

  const lcSearch = search.toLowerCase();
  const filteredExamples = !lcSearch
    ? examples
    : examples.filter((def) => {
        if (def.description.toLowerCase().indexOf(lcSearch) >= 0) return true;
        if (def.title.toLowerCase().indexOf(lcSearch) >= 0) return true;
        return false;
      });

  return rendering.addContext(
    <EuiPageTemplate offset={0}>
      <EuiPageTemplate.Header>
        <EuiFlexGroup justifyContent={'spaceBetween'}>
          <EuiFlexItem>
            <EuiPageHeader pageTitle={'Developer examples'} />
            <EuiText>
              The following examples showcase services and APIs that are available to developers.
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFieldSearch
              fullWidth
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              isClearable={true}
              aria-label="Search developer examples"
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPageTemplate.Header>
      <EuiPageTemplate.Section>
        <EuiFlexGroup wrap>
          {filteredExamples.map((def) => (
            <EuiFlexItem style={{ minWidth: 300, maxWidth: 500 }} key={def.appId}>
              <EuiCard
                description={
                  <EuiHighlight search={search} highlightAll={true}>
                    {def.description}
                  </EuiHighlight>
                }
                title={
                  <React.Fragment>
                    <EuiLink
                      onClick={() => {
                        navigateToApp(def.appId);
                      }}
                    >
                      <EuiHighlight search={search} highlightAll={true}>
                        {def.title}
                      </EuiHighlight>
                    </EuiLink>
                    <EuiToolTip content="Open in new tab" disableScreenReaderOutput>
                      <EuiButtonIcon
                        iconType="popout"
                        aria-label="Open in new tab"
                        onClick={() =>
                          window.open(getUrlForApp(def.appId), '_blank', 'noopener, noreferrer')
                        }
                      />
                    </EuiToolTip>
                  </React.Fragment>
                }
                image={def.image}
                footer={def.links ? <EuiListGroup listItems={def.links} /> : undefined}
              />
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      </EuiPageTemplate.Section>
    </EuiPageTemplate>
  );
}

export const renderApp = (props: Props, element: AppMountParameters['element']) => {
  ReactDOM.render(<DeveloperExamples {...props} />, element);

  return () => ReactDOM.unmountComponentAtNode(element);
};
