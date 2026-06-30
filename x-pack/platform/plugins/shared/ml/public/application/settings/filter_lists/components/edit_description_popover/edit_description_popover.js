/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * React popover for editing the description of a filter list.
 */

import PropTypes from 'prop-types';
import React, { Component } from 'react';

import {
  EuiButtonIcon,
  EuiPopover,
  EuiForm,
  EuiFormRow,
  EuiFieldText,
  EuiToolTip,
} from '@elastic/eui';

import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';

export class EditDescriptionPopover extends Component {
  static displayName = 'EditDescriptionPopover';
  static propTypes = {
    description: PropTypes.string,
    updateDescription: PropTypes.func.isRequired,
    canCreateFilter: PropTypes.bool.isRequired,
  };

  constructor(props) {
    super(props);

    this.state = {
      isPopoverOpen: false,
      value: props.description,
    };
  }

  onChange = (e) => {
    this.setState({
      value: e.target.value,
    });
  };

  onButtonClick = () => {
    if (this.state.isPopoverOpen === false) {
      this.setState({
        isPopoverOpen: !this.state.isPopoverOpen,
        value: this.props.description,
      });
    } else {
      this.closePopover();
    }
  };

  closePopover = () => {
    if (this.state.isPopoverOpen === true) {
      this.setState({
        isPopoverOpen: false,
      });
      this.props.updateDescription(this.state.value);
    }
  };

  render() {
    const { isPopoverOpen, value } = this.state;

    const editDescriptionLabel = i18n.translate(
      'xpack.ml.settings.filterLists.editDescriptionPopover.editDescriptionAriaLabel',
      { defaultMessage: 'Edit description' }
    );
    const button = (
      <EuiToolTip content={editDescriptionLabel} disableScreenReaderOutput>
        <EuiButtonIcon
          size="s"
          color="primary"
          onClick={this.onButtonClick}
          iconType="pencil"
          aria-label={editDescriptionLabel}
          isDisabled={this.props.canCreateFilter === false}
          data-test-subj="mlFilterListEditDescriptionButton"
        />
      </EuiToolTip>
    );

    return (
      <div>
        <EuiPopover
          id="filter_list_description_popover"
          ownFocus
          button={button}
          isOpen={isPopoverOpen}
          closePopover={this.closePopover}
          initialFocus="#filter_list_edit_description_row"
          aria-label={i18n.translate(
            'xpack.ml.settings.filterLists.editDescriptionPopover.popoverAriaLabel',
            {
              defaultMessage: 'Edit filter list description',
            }
          )}
        >
          <div style={{ width: '300px' }}>
            <EuiForm>
              <EuiFormRow
                id="filter_list_edit_description_row"
                label={
                  <FormattedMessage
                    id="xpack.ml.settings.filterLists.editDescriptionPopover.filterListDescriptionAriaLabel"
                    defaultMessage="Filter list description"
                  />
                }
              >
                <EuiFieldText
                  name="filter_list_description"
                  value={value}
                  onChange={this.onChange}
                  data-test-subj={'mlFilterListDescriptionInput'}
                />
              </EuiFormRow>
            </EuiForm>
          </div>
        </EuiPopover>
      </div>
    );
  }
}
