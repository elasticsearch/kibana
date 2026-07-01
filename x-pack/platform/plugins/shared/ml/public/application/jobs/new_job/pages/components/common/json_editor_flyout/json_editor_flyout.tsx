/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { Fragment, useState, useContext, useEffect, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import {
  EuiFlyout,
  EuiFlyoutFooter,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiButtonEmpty,
  EuiTitle,
  EuiFlyoutBody,
  EuiSpacer,
  EuiCallOut,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { XJson } from '@kbn/es-ui-shared-plugin/public';
import type { CombinedJob } from '@kbn/ml-common-types/anomaly_detection_jobs/combined_job';
import type { Datafeed } from '@kbn/ml-common-types/anomaly_detection_jobs/datafeed';
import { useMlKibana } from '../../../../../../contexts/kibana';
import { ML_EDITOR_MODE, MLJobEditor } from '../../../../../jobs_list/components/ml_job_editor';
import { isValidJson } from '../../../../../../../../common/util/validation_utils';
import { JobCreatorContext } from '../../job_creator_context';
import { isAdvancedJobCreator } from '../../../../common/job_creator';
import { DatafeedPreview } from '../datafeed_preview_flyout';
import { useToastNotificationService } from '../../../../../../services/toast_notification_service';

const { collapseLiteralStrings } = XJson;

export enum EDITOR_MODE {
  HIDDEN,
  READONLY,
  EDITABLE,
}
const WARNING_CALLOUT_OFFSET = 100;
interface Props {
  isDisabled: boolean;
  jobEditorMode: EDITOR_MODE;
  datafeedEditorMode: EDITOR_MODE;
}

export const JsonEditorFlyout: FC<Props> = ({ isDisabled, jobEditorMode, datafeedEditorMode }) => {
  const {
    services: { cps },
  } = useMlKibana();
  const cpsManager = cps?.cpsManager;
  const { jobCreator, jobCreatorUpdate, jobCreatorUpdated } = useContext(JobCreatorContext);
  const { displayErrorToast } = useToastNotificationService();
  const [showJsonFlyout, setShowJsonFlyout] = useState(false);
  const [showChangedIndicesWarning, setShowChangedIndicesWarning] = useState(false);
  const [showProjectRoutingWarning, setShowProjectRoutingWarning] = useState(false);

  const [jobConfigString, setJobConfigString] = useState(jobCreator.formattedJobJson);
  const [datafeedConfigString, setDatafeedConfigString] = useState(
    jobCreator.formattedDatafeedJson
  );
  const [saveable, setSaveable] = useState(false);
  const [tempCombinedJob, setTempCombinedJob] = useState<CombinedJob | null>(null);
  const [jobSchema, setJobSchema] = useState<object>();
  const [datafeedSchema, setDatafeedSchema] = useState<object>();
  const [allowedProjects, setAllowedProjects] = useState<string[]>([]);

  useEffect(() => {
    setJobConfigString(jobCreator.formattedJobJson);
    setDatafeedConfigString(jobCreator.formattedDatafeedJson);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobCreatorUpdated]);

  useEffect(() => {
    if (showJsonFlyout === true) {
      // when the flyout opens, update the JSON
      setJobConfigString(jobCreator.formattedJobJson);
      setDatafeedConfigString(jobCreator.formattedDatafeedJson);
      setTempCombinedJob({
        ...JSON.parse(jobCreator.formattedJobJson),
        datafeed_config: JSON.parse(jobCreator.formattedDatafeedJson),
      });

      setShowChangedIndicesWarning(false);
      setShowProjectRoutingWarning(false);
      if (cpsManager) {
        cpsManager.fetchProjects().then((projects) => {
          if (projects) {
            setAllowedProjects(Object.keys(projects));
          }
        });
      }
    } else {
      setTempCombinedJob(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showJsonFlyout]);

  useEffect(function fetchSchemasOnMount() {
    // async import json schema
    import('@kbn/json-schemas/src/put___ml_anomaly_detectors__job_id__schema.json').then(
      (result) => {
        setJobSchema(result);
      }
    );

    import('@kbn/json-schemas/src/put___ml_datafeeds__datafeed_id__schema.json').then((result) => {
      setDatafeedSchema(result);
    });
  }, []);

  const editJsonMode =
    jobEditorMode === EDITOR_MODE.EDITABLE || datafeedEditorMode === EDITOR_MODE.EDITABLE;
  const readOnlyMode =
    jobEditorMode === EDITOR_MODE.READONLY && datafeedEditorMode === EDITOR_MODE.READONLY;

  function toggleJsonFlyout() {
    setSaveable(false);
    setShowJsonFlyout(!showJsonFlyout);
  }

  function onJobChange(json: string) {
    setJobConfigString(json);
    const valid = isValidJson(json);
    setTempCombinedJob(
      valid
        ? {
            ...JSON.parse(json),
            datafeed_config: JSON.parse(datafeedConfigString),
          }
        : null
    );
    setSaveable(valid);
  }

  function onDatafeedChange(json: string) {
    setDatafeedConfigString(json);
    const jsonValue = collapseLiteralStrings(json);
    let valid = isValidJson(jsonValue);
    if (valid) {
      // ensure that the user hasn't altered the indices list in the json.
      const datafeed: Datafeed = JSON.parse(jsonValue);
      const originalIndices = jobCreator.indices.sort();
      valid =
        originalIndices.length === datafeed.indices.length &&
        originalIndices.every((value, index) => value === datafeed.indices[index]);
      setShowChangedIndicesWarning(valid === false);

      const hasInvalidProjectRouting =
        !!datafeed.project_routing && !allowedProjects.includes(datafeed.project_routing);
      setShowProjectRoutingWarning(hasInvalidProjectRouting);
      if (hasInvalidProjectRouting) {
        valid = false;
      }

      setTempCombinedJob({
        ...JSON.parse(jobConfigString),
        datafeed_config: datafeed,
      });
    } else {
      setShowChangedIndicesWarning(false);
      setShowProjectRoutingWarning(false);
      setTempCombinedJob(null);
    }

    setSaveable(valid);
  }

  async function onSave() {
    const jobConfig = JSON.parse(jobConfigString);
    const datafeedConfig = JSON.parse(collapseLiteralStrings(datafeedConfigString));
    jobCreator.cloneFromExistingJob(jobConfig, datafeedConfig);
    if (isAdvancedJobCreator(jobCreator)) {
      try {
        await jobCreator.autoSetTimeRange();
      } catch (error) {
        const title = i18n.translate(
          'xpack.ml.newJob.wizard.jsonFlyout.autoSetJobCreatorTimeRange.error',
          {
            defaultMessage: `Error retrieving beginning and end times of index`,
          }
        );
        displayErrorToast(error, title);
      }
    }
    jobCreatorUpdate();
    setShowJsonFlyout(false);
  }

  const flyoutTitleId = useGeneratedHtmlId();

  return (
    <Fragment>
      <FlyoutButton
        onClick={toggleJsonFlyout}
        isDisabled={isDisabled}
        editJsonMode={editJsonMode}
      />

      {showJsonFlyout === true && isDisabled === false && (
        <EuiFlyout
          onClose={() => setShowJsonFlyout(false)}
          hideCloseButton
          size={'l'}
          aria-labelledby={flyoutTitleId}
        >
          <EuiFlyoutBody>
            <EuiFlexGroup>
              {jobEditorMode !== EDITOR_MODE.HIDDEN ? (
                <Contents
                  editJson={jobEditorMode === EDITOR_MODE.EDITABLE}
                  onChange={onJobChange}
                  title={i18n.translate('xpack.ml.newJob.wizard.jsonFlyout.job.title', {
                    defaultMessage: 'Job configuration JSON',
                  })}
                  value={jobConfigString}
                  heightOffset={
                    (showChangedIndicesWarning ? WARNING_CALLOUT_OFFSET : 0) +
                    (showProjectRoutingWarning ? WARNING_CALLOUT_OFFSET : 0)
                  }
                  schema={jobSchema}
                  flyoutTitleId={flyoutTitleId}
                />
              ) : null}
              {datafeedEditorMode !== EDITOR_MODE.HIDDEN ? (
                <>
                  <Contents
                    editJson={datafeedEditorMode === EDITOR_MODE.EDITABLE}
                    onChange={onDatafeedChange}
                    title={i18n.translate('xpack.ml.newJob.wizard.jsonFlyout.datafeed.title', {
                      defaultMessage: 'Datafeed configuration JSON',
                    })}
                    value={datafeedConfigString}
                    heightOffset={
                      (showChangedIndicesWarning ? WARNING_CALLOUT_OFFSET : 0) +
                      (showProjectRoutingWarning ? WARNING_CALLOUT_OFFSET : 0)
                    }
                    schema={datafeedSchema}
                    flyoutTitleId={flyoutTitleId}
                  />
                  {datafeedEditorMode === EDITOR_MODE.EDITABLE && (
                    <EuiFlexItem>
                      <DatafeedPreview
                        combinedJob={tempCombinedJob}
                        heightOffset={
                          (showChangedIndicesWarning ? WARNING_CALLOUT_OFFSET : 0) +
                          (showProjectRoutingWarning ? WARNING_CALLOUT_OFFSET : 0)
                        }
                      />
                    </EuiFlexItem>
                  )}
                </>
              ) : null}
            </EuiFlexGroup>
            {showChangedIndicesWarning && (
              <>
                <EuiSpacer />
                <EuiCallOut
                  announceOnMount
                  color="warning"
                  size="s"
                  title={i18n.translate(
                    'xpack.ml.newJob.wizard.jsonFlyout.indicesChange.calloutTitle',
                    {
                      defaultMessage: 'Indices have changed',
                    }
                  )}
                >
                  <FormattedMessage
                    id="xpack.ml.newJob.wizard.jsonFlyout.indicesChange.calloutText"
                    defaultMessage="You cannot alter the indices being used by the datafeed here. To select a different data view or saved Discover session, go to step 1 of the wizard and select the Change data view option."
                  />
                </EuiCallOut>
              </>
            )}
            {showProjectRoutingWarning && (
              <>
                <EuiSpacer />
                <EuiCallOut
                  announceOnMount
                  color="warning"
                  size="s"
                  title={i18n.translate(
                    'xpack.ml.newJob.wizard.jsonFlyout.projectRoutingChange.calloutTitle',
                    {
                      defaultMessage: 'Invalid project routing',
                    }
                  )}
                >
                  <FormattedMessage
                    id="xpack.ml.newJob.wizard.jsonFlyout.projectRoutingChange.calloutText"
                    defaultMessage="The project routing specified in the datafeed configuration is not a valid project. Please use a project routing value from one of the available projects."
                  />
                </EuiCallOut>
              </>
            )}
          </EuiFlyoutBody>
          <EuiFlyoutFooter>
            <EuiFlexGroup justifyContent="spaceBetween">
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  iconType="cross"
                  onClick={() => setShowJsonFlyout(false)}
                  flush="left"
                >
                  <FormattedMessage
                    id="xpack.ml.newJob.wizard.jsonFlyout.closeButton"
                    defaultMessage="Close"
                  />
                </EuiButtonEmpty>
              </EuiFlexItem>
              {readOnlyMode === false && (
                <EuiFlexItem grow={false}>
                  <EuiButton onClick={onSave} fill isDisabled={saveable === false}>
                    <FormattedMessage
                      id="xpack.ml.newJob.wizard.jsonFlyout.saveButton"
                      defaultMessage="Save"
                    />
                  </EuiButton>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiFlyoutFooter>
        </EuiFlyout>
      )}
    </Fragment>
  );
};

const FlyoutButton: FC<{ isDisabled: boolean; onClick(): void; editJsonMode: boolean }> = ({
  isDisabled,
  onClick,
  editJsonMode,
}) => {
  const previewJsonTitle = i18n.translate('xpack.ml.newJob.wizard.previewJsonButton', {
    defaultMessage: 'Preview JSON',
  });
  const editJsonTitle = i18n.translate('xpack.ml.newJob.wizard.editJsonButton', {
    defaultMessage: 'Edit JSON',
  });
  return (
    <EuiButtonEmpty
      onClick={onClick}
      isDisabled={isDisabled}
      data-test-subj="mlJobWizardButtonPreviewJobJson"
    >
      {editJsonMode ? editJsonTitle : previewJsonTitle}
    </EuiButtonEmpty>
  );
};

const Contents: FC<{
  title: string;
  value: string;
  editJson: boolean;
  onChange(s: string): void;
  heightOffset?: number;
  schema?: object;
  flyoutTitleId?: string;
}> = ({ title, flyoutTitleId, value, editJson, onChange, heightOffset = 0, schema }) => {
  // the editor requires a fixed height
  const editorHeight = useMemo(
    () => `${window.innerHeight - 230 - heightOffset}px`,
    [heightOffset]
  );
  return (
    <EuiFlexItem>
      <EuiTitle size="s">
        <h2 id={flyoutTitleId}>{title}</h2>
      </EuiTitle>
      <EuiSpacer size="s" />
      <MLJobEditor
        value={value}
        height={editorHeight}
        mode={ML_EDITOR_MODE.JSON}
        readOnly={editJson === false}
        onChange={onChange}
        schema={schema}
      />
    </EuiFlexItem>
  );
};
