/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import React, { Component } from 'react';

import {
  EuiPopover,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';

import type { IngestPipeline } from '@kbn/file-upload-common';
import type { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';
import { ES_FIELD_TYPES } from '@kbn/field-types';
import type { FileAnalysis } from '../../../../file_upload_manager';
import { getFieldsFromMappings } from '../../../../file_upload_manager';
import type { CombinedField } from './types';
import { GeoPointForm } from './geo_point';
import { CombinedFieldLabel } from './combined_field_label';
import {
  isLatLonCompatible,
  removeCombinedFieldsFromMappings,
  removeCombinedFieldsFromPipeline,
} from './utils';
import { SemanticTextForm } from './semantic_text';

interface Props {
  mappings: MappingTypeMapping;
  pipelines: IngestPipeline[];
  onMappingsChange(mappings: string): void;
  onPipelinesChange(pipeline: IngestPipeline[]): void;
  combinedFields: CombinedField[];
  onCombinedFieldsChange(combinedFields: CombinedField[]): void;
  isDisabled: boolean;
  filesStatus: FileAnalysis[];
}

interface State {
  isGeoPopoverOpen: boolean;
  isSemanticPopoverOpen: boolean;
}

export type AddCombinedField = (
  combinedField: CombinedField,
  addToMappings: (mappings: MappingTypeMapping) => MappingTypeMapping,
  addToPipelines: (pipelines: IngestPipeline[]) => IngestPipeline[]
) => void;

export class CombinedFieldsForm extends Component<Props, State> {
  state: State = {
    isGeoPopoverOpen: false,
    isSemanticPopoverOpen: false,
  };

  togglePopover = (popover: 'geo' | 'semantic') => {
    if (popover === 'geo') {
      this.setState((prevState) => ({
        isGeoPopoverOpen: !prevState.isGeoPopoverOpen,
        isSemanticPopoverOpen: false,
      }));
    } else {
      this.setState((prevState) => ({
        isSemanticPopoverOpen: !prevState.isSemanticPopoverOpen,
        isGeoPopoverOpen: false,
      }));
    }
  };

  closePopover = () => {
    this.setState({
      isGeoPopoverOpen: false,
      isSemanticPopoverOpen: false,
    });
  };

  addCombinedField = (
    combinedField: CombinedField,
    addToMappings: (mappings: MappingTypeMapping) => MappingTypeMapping,
    addToPipelines: (pipelines: IngestPipeline[]) => IngestPipeline[]
  ) => {
    const mappings = this.props.mappings;
    const pipelines = this.props.pipelines;

    const newPipelines = addToPipelines(pipelines);
    this.props.onPipelinesChange(newPipelines);

    const newMappings = addToMappings(mappings);
    this.props.onMappingsChange(JSON.stringify(newMappings, null, 2));

    this.props.onCombinedFieldsChange([...this.props.combinedFields, combinedField]);

    this.closePopover();
  };

  removeCombinedField = (index: number) => {
    const updatedCombinedFields = [...this.props.combinedFields];
    const removedCombinedFields = updatedCombinedFields.splice(index, 1);

    this.props.onPipelinesChange(
      this.props.pipelines.map((pipeline) =>
        removeCombinedFieldsFromPipeline(pipeline, removedCombinedFields)
      )
    );
    this.props.onMappingsChange(
      JSON.stringify(removeCombinedFieldsFromMappings(this.props.mappings, removedCombinedFields))
    );
    this.props.onCombinedFieldsChange(updatedCombinedFields);
  };

  hasNameCollision = (name: string) => {
    const fieldExists = getFieldsFromMappings(this.props.mappings).some(
      (field) => field.name === name
    );
    if (fieldExists) {
      // collision with column name
      return true;
    }

    if (
      this.props.combinedFields.some((combinedField) => combinedField.combinedFieldName === name)
    ) {
      // collision with combined field name
      return true;
    }

    return Object.hasOwn(this.props.mappings?.properties ?? {}, name);
  };

  isLatLonCompatible = () => {
    return isLatLonCompatible(
      this.props.filesStatus ? this.props.filesStatus[0].results! : undefined
    );
  };

  isSemanticTextCompatible = () => {
    return (
      getFieldsFromMappings(this.props.mappings, [ES_FIELD_TYPES.TEXT, ES_FIELD_TYPES.KEYWORD])
        .length > 0
    );
  };

  render() {
    return (
      <>
        <EuiTitle size="xxs">
          <h4>
            <FormattedMessage
              id="xpack.fileUpload.combinedFieldsForm.title"
              defaultMessage="Add Smarter search fields to the mappings"
            />
          </h4>
        </EuiTitle>

        <EuiSpacer size="s" />

        <EuiText size="s">
          <p>
            <FormattedMessage
              id="xpack.fileUpload.combinedFieldsForm.description"
              defaultMessage="Add a Geo Point field for map-based searches, or a Semantic Text field for meaning-based searches to find related content — not just exact matches."
            />
          </p>
        </EuiText>

        <EuiSpacer size="m" />

        <EuiFlexGroup>
          <EuiFlexItem grow={false}>
            <EuiPopover
              aria-label={i18n.translate(
                'xpack.fileUpload.combinedFieldsForm.semanticTextOptionsAriaLabel',
                {
                  defaultMessage: 'Semantic text options',
                }
              )}
              button={
                <EuiButton
                  onClick={this.togglePopover.bind(null, 'semantic')}
                  size="s"
                  color="text"
                  iconType="plusCircle"
                  isDisabled={this.isSemanticTextCompatible() === false}
                >
                  <FormattedMessage
                    id="xpack.fileUpload.semanticTextForm.combinedFieldLabel"
                    defaultMessage="Semantic text field"
                  />
                </EuiButton>
              }
              isOpen={this.state.isSemanticPopoverOpen}
              closePopover={this.closePopover}
            >
              <SemanticTextForm
                addCombinedField={this.addCombinedField}
                hasNameCollision={this.hasNameCollision}
                mappings={this.props.mappings}
              />
            </EuiPopover>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiPopover
              aria-label={i18n.translate(
                'xpack.fileUpload.combinedFieldsForm.geoPointOptionsAriaLabel',
                {
                  defaultMessage: 'Geo point options',
                }
              )}
              button={
                <EuiButton
                  onClick={this.togglePopover.bind(null, 'geo')}
                  size="s"
                  color="text"
                  iconType="plusCircle"
                  isDisabled={this.isLatLonCompatible() === false}
                >
                  <FormattedMessage
                    id="xpack.fileUpload.geoFieldLabel"
                    defaultMessage="Geo point field"
                  />
                </EuiButton>
              }
              isOpen={this.state.isGeoPopoverOpen}
              closePopover={this.closePopover}
            >
              <GeoPointForm
                addCombinedField={this.addCombinedField}
                hasNameCollision={this.hasNameCollision}
                results={this.props.filesStatus ? this.props.filesStatus[0].results! : undefined}
              />
            </EuiPopover>
          </EuiFlexItem>
        </EuiFlexGroup>

        {this.props.combinedFields.length ? (
          <>
            <EuiSpacer size="m" />

            <EuiTitle size="xxs">
              <h4>
                <FormattedMessage
                  id="xpack.fileUpload.combinedFieldsForm.title"
                  defaultMessage="Already added fields"
                />
              </h4>
            </EuiTitle>

            <EuiSpacer size="s" />

            {this.props.combinedFields.map((combinedField: CombinedField, idx: number) => (
              <EuiFlexGroup key={idx} gutterSize="s" css={{ maxWidth: '350px' }}>
                <EuiFlexItem>
                  <CombinedFieldLabel combinedField={combinedField} />
                </EuiFlexItem>

                <EuiFlexItem grow={false}>
                  <EuiToolTip
                    content={i18n.translate('xpack.dataVisualizer.removeCombinedFieldsLabel', {
                      defaultMessage: 'Remove combined field',
                    })}
                    disableScreenReaderOutput
                  >
                    <EuiButtonIcon
                      iconType="trash"
                      color="danger"
                      onClick={this.removeCombinedField.bind(null, idx)}
                      aria-label={i18n.translate('xpack.dataVisualizer.removeCombinedFieldsLabel', {
                        defaultMessage: 'Remove combined field',
                      })}
                    />
                  </EuiToolTip>
                </EuiFlexItem>
              </EuiFlexGroup>
            ))}
          </>
        ) : null}
      </>
    );
  }
}
