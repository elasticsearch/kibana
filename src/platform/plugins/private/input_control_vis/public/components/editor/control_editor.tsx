/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ChangeEvent } from 'react';
import React, { PureComponent } from 'react';
import type { WrappedComponentProps } from '@kbn/i18n-react';
import { injectI18n, FormattedMessage } from '@kbn/i18n-react';
import { css } from '@emotion/react';

import type { UseEuiTheme } from '@elastic/eui';
import {
  EuiAccordion,
  EuiButtonIcon,
  EuiFieldText,
  EuiForm,
  EuiFormRow,
  EuiPanel,
  EuiSpacer,
  EuiToolTip,
} from '@elastic/eui';

import type { DataView } from '@kbn/data-views-plugin/public';
import { RangeControlEditor } from './range_control_editor';
import { ListControlEditor } from './list_control_editor';
import type { ControlParams, ControlParamsOptions } from '../../editor_utils';
import { getTitle, CONTROL_TYPES } from '../../editor_utils';
import type { InputControlVisDependencies } from '../../plugin';

interface ControlEditorUiProps {
  controlIndex: number;
  controlParams: ControlParams;
  handleLabelChange: (controlIndex: number, value: string) => void;
  moveControl: (controlIndex: number, direction: number) => void;
  handleRemoveControl: (controlIndex: number) => void;
  handleIndexPatternChange: (controlIndex: number, indexPatternId: string) => void;
  handleFieldNameChange: (controlIndex: number, fieldName: string) => void;
  getIndexPattern: (indexPatternId: string) => Promise<DataView>;
  handleOptionsChange: <T extends keyof ControlParamsOptions>(
    controlIndex: number,
    optionName: T,
    value: ControlParamsOptions[T]
  ) => void;
  parentCandidates: Array<{
    value: string;
    text: string;
  }>;
  handleParentChange: (controlIndex: number, parent: string) => void;
  deps: InputControlVisDependencies;
}

class ControlEditorUi extends PureComponent<ControlEditorUiProps & WrappedComponentProps> {
  changeLabel = (event: ChangeEvent<HTMLInputElement>) => {
    this.props.handleLabelChange(this.props.controlIndex, event.target.value);
  };

  removeControl = () => {
    this.props.handleRemoveControl(this.props.controlIndex);
  };

  moveUpControl = () => {
    this.props.moveControl(this.props.controlIndex, -1);
  };

  moveDownControl = () => {
    this.props.moveControl(this.props.controlIndex, 1);
  };

  changeIndexPattern = (indexPatternId: string) => {
    this.props.handleIndexPatternChange(this.props.controlIndex, indexPatternId);
  };

  changeFieldName = (fieldName: string) => {
    this.props.handleFieldNameChange(this.props.controlIndex, fieldName);
  };

  renderEditor() {
    let controlEditor = null;
    switch (this.props.controlParams.type) {
      case CONTROL_TYPES.LIST:
        controlEditor = (
          <ListControlEditor
            controlIndex={this.props.controlIndex}
            controlParams={this.props.controlParams}
            handleIndexPatternChange={this.changeIndexPattern}
            handleFieldNameChange={this.changeFieldName}
            getIndexPattern={this.props.getIndexPattern}
            handleOptionsChange={this.props.handleOptionsChange}
            parentCandidates={this.props.parentCandidates}
            handleParentChange={this.props.handleParentChange}
            deps={this.props.deps}
          />
        );
        break;
      case CONTROL_TYPES.RANGE:
        controlEditor = (
          <RangeControlEditor
            controlIndex={this.props.controlIndex}
            controlParams={this.props.controlParams}
            handleIndexPatternChange={this.changeIndexPattern}
            handleFieldNameChange={this.changeFieldName}
            getIndexPattern={this.props.getIndexPattern}
            handleOptionsChange={this.props.handleOptionsChange}
            deps={this.props.deps}
          />
        );
        break;
      default:
        throw new Error(`Unhandled control editor type ${this.props.controlParams.type}`);
    }

    const labelId = `controlLabel${this.props.controlIndex}`;
    return (
      <EuiForm>
        <EuiFormRow
          id={labelId}
          label={
            <FormattedMessage
              id="inputControl.editor.controlEditor.controlLabel"
              defaultMessage="Control Label"
            />
          }
        >
          <EuiFieldText value={this.props.controlParams.label} onChange={this.changeLabel} />
        </EuiFormRow>

        {controlEditor}
      </EuiForm>
    );
  }

  renderEditorButtons() {
    return (
      <div>
        <EuiToolTip
          content={this.props.intl.formatMessage({
            id: 'inputControl.editor.controlEditor.moveControlUpAriaLabel',
            defaultMessage: 'Move control up',
          })}
          disableScreenReaderOutput
        >
          <EuiButtonIcon
            aria-label={this.props.intl.formatMessage({
              id: 'inputControl.editor.controlEditor.moveControlUpAriaLabel',
              defaultMessage: 'Move control up',
            })}
            color="primary"
            onClick={this.moveUpControl}
            iconType="sortUp"
            data-test-subj={`inputControlEditorMoveUpControl${this.props.controlIndex}`}
          />
        </EuiToolTip>
        <EuiToolTip
          content={this.props.intl.formatMessage({
            id: 'inputControl.editor.controlEditor.moveControlDownAriaLabel',
            defaultMessage: 'Move control down',
          })}
          disableScreenReaderOutput
        >
          <EuiButtonIcon
            aria-label={this.props.intl.formatMessage({
              id: 'inputControl.editor.controlEditor.moveControlDownAriaLabel',
              defaultMessage: 'Move control down',
            })}
            color="primary"
            onClick={this.moveDownControl}
            iconType="sortDown"
            data-test-subj={`inputControlEditorMoveDownControl${this.props.controlIndex}`}
          />
        </EuiToolTip>
        <EuiToolTip
          content={this.props.intl.formatMessage({
            id: 'inputControl.editor.controlEditor.removeControlAriaLabel',
            defaultMessage: 'Remove control',
          })}
          disableScreenReaderOutput
        >
          <EuiButtonIcon
            aria-label={this.props.intl.formatMessage({
              id: 'inputControl.editor.controlEditor.removeControlAriaLabel',
              defaultMessage: 'Remove control',
            })}
            color="danger"
            onClick={this.removeControl}
            iconType="cross"
            data-test-subj={`inputControlEditorRemoveControl${this.props.controlIndex}`}
          />
        </EuiToolTip>
      </div>
    );
  }

  render() {
    return (
      <EuiPanel
        grow={false}
        css={({ euiTheme }: UseEuiTheme) =>
          css({
            zIndex: 1,
            marginBottom: euiTheme.size.base,
          })
        }
      >
        <EuiAccordion
          id="controlEditorAccordion"
          buttonContent={getTitle(this.props.controlParams, this.props.controlIndex)}
          extraAction={this.renderEditorButtons()}
          initialIsOpen={true}
        >
          <EuiSpacer size="s" />
          {this.renderEditor()}
        </EuiAccordion>
      </EuiPanel>
    );
  }
}

export const ControlEditor = injectI18n(ControlEditorUi);
