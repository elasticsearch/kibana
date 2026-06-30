/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import PropTypes from 'prop-types';
import React, { Component } from 'react';

import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFieldText,
  EuiFormRow,
  EuiToolTip,
  keys,
} from '@elastic/eui';

import { i18n } from '@kbn/i18n';

import { validateGroupNames } from '../../../validate_job';

export class NewGroupInput extends Component {
  static propTypes = {
    addNewGroup: PropTypes.func.isRequired,
    allJobIds: PropTypes.array.isRequired,
  };

  constructor(props) {
    super(props);

    this.state = {
      tempNewGroupName: '',
      groupsValidationError: '',
    };
  }

  changeTempNewGroup = (e) => {
    const tempNewGroupName = e.target.value;
    let groupsValidationError = '';

    if (tempNewGroupName === '') {
      groupsValidationError = '';
    } else if (this.props.allJobIds.includes(tempNewGroupName)) {
      groupsValidationError = i18n.translate(
        'xpack.ml.jobsList.multiJobActions.groupSelector.groupsAndJobsCanNotUseSameIdErrorMessage',
        {
          defaultMessage:
            'A job with this ID already exists. Groups and jobs cannot use the same ID.',
        }
      );
    } else {
      groupsValidationError = validateGroupNames([tempNewGroupName]).message;
    }

    this.setState({
      tempNewGroupName,
      groupsValidationError,
    });
  };

  newGroupKeyPress = (e) => {
    if (
      e.key === keys.ENTER &&
      this.state.groupsValidationError === '' &&
      this.state.tempNewGroupName !== ''
    ) {
      this.addNewGroup();
    }
  };

  addNewGroup = () => {
    this.props.addNewGroup(this.state.tempNewGroupName);
    this.setState({ tempNewGroupName: '' });
  };

  render() {
    const { tempNewGroupName, groupsValidationError } = this.state;

    return (
      <div>
        <EuiFlexGroup gutterSize="s" alignItems="center">
          <EuiFlexItem>
            <EuiFormRow
              display="rowCompressed"
              isInvalid={groupsValidationError !== ''}
              error={groupsValidationError}
              className="new-group-input"
            >
              <EuiFieldText
                compressed
                placeholder={i18n.translate(
                  'xpack.ml.jobsList.multiJobActions.groupSelector.addNewGroupPlaceholder',
                  {
                    defaultMessage: 'Add new group',
                  }
                )}
                value={tempNewGroupName}
                onChange={this.changeTempNewGroup}
                onKeyDown={this.newGroupKeyPress}
                isInvalid={groupsValidationError !== ''}
                error={groupsValidationError}
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFormRow className="new-group-input">
              <EuiToolTip
                content={i18n.translate(
                  'xpack.ml.jobsList.multiJobActions.groupSelector.addButtonAriaLabel',
                  {
                    defaultMessage: 'Add',
                  }
                )}
                disableScreenReaderOutput
              >
                <EuiButtonIcon
                  onClick={this.addNewGroup}
                  iconType="plusCircle"
                  aria-label={i18n.translate(
                    'xpack.ml.jobsList.multiJobActions.groupSelector.addButtonAriaLabel',
                    {
                      defaultMessage: 'Add',
                    }
                  )}
                  disabled={tempNewGroupName === '' || groupsValidationError !== ''}
                />
              </EuiToolTip>
            </EuiFormRow>
          </EuiFlexItem>
        </EuiFlexGroup>
      </div>
    );
  }
}
