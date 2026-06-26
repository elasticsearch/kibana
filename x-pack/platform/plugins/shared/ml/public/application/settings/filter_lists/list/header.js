/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * React component for the header section of the filter lists page.
 */

import PropTypes from 'prop-types';
import React from 'react';
import { FormattedMessage } from '@kbn/i18n-react';

import {
  EuiSpacer,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiText,
  EuiTextColor,
  EuiButtonEmpty,
} from '@elastic/eui';

import { i18n } from '@kbn/i18n';
import { withKibana } from '@kbn/kibana-react-plugin/public';
import { MlAppHeader } from '../../../components/ml_app_header';

function FilterListsHeaderUI({ totalCount, refreshFilterLists, kibana }) {
  const docsUrl = kibana.services.docLinks.links.ml.customRules;
  return (
    <React.Fragment>
      <MlAppHeader
        title={i18n.translate('xpack.ml.settings.filterLists.listHeader.filterListsTitle', {
          defaultMessage: 'Filter Lists',
        })}
      />

      <EuiFlexGroup justifyContent="spaceBetween" alignItems="baseline">
        <EuiFlexItem grow={false}>
          <EuiFlexGroup alignItems="baseline" gutterSize="m" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiTextColor color="subdued">
                <p>
                  <FormattedMessage
                    id="xpack.ml.settings.filterLists.listHeader.filterListsDescription"
                    defaultMessage="{totalCount} in total"
                    values={{
                      totalCount,
                    }}
                  />
                </p>
              </EuiTextColor>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup alignItems="baseline" gutterSize="m" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                size="s"
                iconType="refresh"
                onClick={() => refreshFilterLists()}
                data-test-subj="mlFilterListRefreshButton"
              >
                <FormattedMessage
                  id="xpack.ml.settings.filterLists.listHeader.refreshButtonLabel"
                  defaultMessage="Refresh"
                />
              </EuiButtonEmpty>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiText>
        <p>
          <EuiTextColor color="subdued">
            <FormattedMessage
              id="xpack.ml.settings.filterLists.listHeader.filterListsContainsNotAllowedValuesDescription"
              defaultMessage="Filter lists contain values that you can use to include or exclude events from the machine learning analysis.
You can use the same filter list in multiple jobs.{br}{learnMoreLink}"
              values={{
                br: <br />,
                learnMoreLink: (
                  <EuiLink href={docsUrl} target="_blank">
                    <FormattedMessage
                      id="xpack.ml.settings.filterLists.listHeader.filterListsContainsNotAllowedValuesDescription.learnMoreLinkText"
                      defaultMessage="Learn more"
                    />
                  </EuiLink>
                ),
              }}
            />
          </EuiTextColor>
        </p>
      </EuiText>
      <EuiSpacer size="m" />
    </React.Fragment>
  );
}
FilterListsHeaderUI.propTypes = {
  totalCount: PropTypes.number.isRequired,
  refreshFilterLists: PropTypes.func.isRequired,
};

export const FilterListsHeader = withKibana(FilterListsHeaderUI);
