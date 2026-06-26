/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * React component for the header section of the edit filter list page, showing the
 * filter ID, description, number of items, and the jobs and detectors using the filter list.
 */

import PropTypes from 'prop-types';
import React from 'react';

import {
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSpacer,
  EuiText,
  EuiTextColor,
} from '@elastic/eui';

import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';

import { EditDescriptionPopover } from '../components/edit_description_popover';
import { FilterListUsagePopover } from '../components/filter_list_usage_popover';
import { MlAppHeader } from '../../../components/ml_app_header';

export const EditFilterListHeader = ({
  canCreateFilter,
  filterId,
  totalItemCount,
  description,
  updateDescription,
  newFilterId,
  isNewFilterIdInvalid,
  updateNewFilterId,
  usedBy,
}) => {
  const title =
    filterId !== undefined
      ? i18n.translate('xpack.ml.settings.filterLists.editFilterHeader.filterListTitle', {
          defaultMessage: 'Filter list {filterId}',
          values: { filterId },
        })
      : i18n.translate('xpack.ml.settings.filterLists.editFilterHeader.createFilterListTitle', {
          defaultMessage: 'Create new filter list',
        });

  let idField;
  let descriptionField;
  let usedByElement;

  if (filterId === undefined) {
    const msg = i18n.translate(
      'xpack.ml.settings.filterLists.editFilterHeader.allowedCharactersDescription',
      {
        defaultMessage:
          'Use lowercase alphanumerics (a-z and 0-9), hyphens or underscores;' +
          ' must start and end with an alphanumeric character',
      }
    );
    const helpText = isNewFilterIdInvalid === false ? msg : undefined;
    const error = isNewFilterIdInvalid === true ? [msg] : undefined;

    idField = (
      <EuiFormRow
        label={
          <FormattedMessage
            id="xpack.ml.settings.filterLists.editFilterHeader.filterListIdAriaLabel"
            defaultMessage="Filter list ID"
          />
        }
        helpText={helpText}
        error={error}
        isInvalid={isNewFilterIdInvalid}
      >
        <EuiFieldText
          name="new_filter_id"
          value={newFilterId}
          isInvalid={isNewFilterIdInvalid}
          onChange={(e) => updateNewFilterId(e.target.value)}
          data-test-subj={'mlNewFilterListIdInput'}
        />
      </EuiFormRow>
    );
  }

  if (description !== undefined && description.length > 0) {
    descriptionField = (
      <EuiText data-test-subj={'mlNewFilterListDescriptionText'}>
        <p>{description}</p>
      </EuiText>
    );
  } else {
    descriptionField = (
      <EuiText>
        <EuiTextColor color="subdued">
          <FormattedMessage
            id="xpack.ml.settings.filterLists.editFilterList.addDescriptionText"
            defaultMessage="Add a description"
          />
        </EuiTextColor>
      </EuiText>
    );
  }

  if (filterId !== undefined) {
    if (usedBy !== undefined && usedBy.jobs.length > 0) {
      usedByElement = (
        <React.Fragment>
          <div className="ml-filter-list-usage">
            <EuiText>
              <FormattedMessage
                id="xpack.ml.settings.filterLists.editFilterList.filterIsUsedInJobsDescription"
                defaultMessage="This filter list is used in"
              />
            </EuiText>
            <FilterListUsagePopover entityType="detector" entityValues={usedBy.detectors} />
            <EuiText>
              <FormattedMessage
                id="xpack.ml.settings.filterLists.editFilterList.acrossText"
                defaultMessage="across"
              />
            </EuiText>
            <FilterListUsagePopover entityType="job" entityValues={usedBy.jobs} />
          </div>
          <EuiSpacer size="s" />
        </React.Fragment>
      );
    } else {
      usedByElement = (
        <React.Fragment>
          <EuiText>
            <p>
              <FormattedMessage
                id="xpack.ml.settings.filterLists.editFilterList.filterIsNotUsedInJobsDescription"
                defaultMessage="This filter list is not used by any jobs."
              />
            </p>
          </EuiText>
          <EuiSpacer size="s" />
        </React.Fragment>
      );
    }
  }

  return (
    <React.Fragment>
      <MlAppHeader title={title} />

      <EuiFlexGroup justifyContent="spaceBetween" alignItems="baseline">
        <EuiFlexItem grow={false}>
          <EuiFlexGroup alignItems="baseline" gutterSize="m" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiTextColor color="subdued">
                <p>
                  <FormattedMessage
                    id="xpack.ml.settings.filterLists.editFilterList.totalItemsDescription"
                    defaultMessage="{totalItemCount, plural, one {# item} other {# items}} in total"
                    values={{
                      totalItemCount,
                    }}
                  />
                </p>
              </EuiTextColor>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />
      {idField}
      <EuiFlexGroup alignItems="baseline" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>{descriptionField}</EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EditDescriptionPopover
            canCreateFilter={canCreateFilter}
            description={description}
            updateDescription={updateDescription}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      {usedByElement}
    </React.Fragment>
  );
};

EditFilterListHeader.propTypes = {
  canCreateFilter: PropTypes.bool.isRequired,
  filterId: PropTypes.string,
  newFilterId: PropTypes.string,
  isNewFilterIdInvalid: PropTypes.bool,
  updateNewFilterId: PropTypes.func.isRequired,
  totalItemCount: PropTypes.number.isRequired,
  description: PropTypes.string,
  updateDescription: PropTypes.func.isRequired,
  usedBy: PropTypes.object,
};

EditFilterListHeader.displayName = 'EditFilterListHeader';
