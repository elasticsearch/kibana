/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Fragment, useState } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import {
  EuiDescribedFormGroup,
  EuiTitle,
  EuiFormRow,
  EuiFieldText,
  EuiSelect,
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButtonEmpty,
  EuiLink,
  EuiSpacer,
  EuiText,
  EuiCallOut,
  EuiCode,
} from '@elastic/eui';

import { reactRouterNavigate } from '@kbn/kibana-react-plugin/public';
import type { Repository } from '../../../../../common/types';
import type { Frequency } from '../../../../shared_imports';
import { CronEditor, SectionError } from '../../../../shared_imports';
import { useCore, useServices } from '../../../app_context';
import { DEFAULT_POLICY_SCHEDULE, DEFAULT_POLICY_FREQUENCY } from '../../../constants';
import { useLoadRepositories } from '../../../services/http';
import { linkToAddRepository } from '../../../services/navigation';
import { InlineLoading } from '../..';
import type { StepProps } from '.';
import { DisableToolTip, MANAGED_POLICY_TOOLTIP_MESSAGE } from '../../disable_tooltip';

export const PolicyStepLogistics: React.FunctionComponent<StepProps> = ({
  policy,
  updatePolicy,
  isEditing,
  currentUrl,
  errors,
}) => {
  // Load repositories for repository dropdown field
  const {
    error: errorLoadingRepositories,
    isLoading: isLoadingRepositories,
    data: { repositories } = {
      repositories: [],
    },
    resendRequest: reloadRepositories,
  } = useLoadRepositories();

  const { i18n, history } = useServices();
  const { docLinks } = useCore();

  const [showRepositoryNotFoundWarning, setShowRepositoryNotFoundWarning] =
    useState<boolean>(false);

  // State for touched inputs
  const [touched, setTouched] = useState({
    name: false,
    snapshotName: false,
    repository: false,
    schedule: false,
  });

  // State for cron editor
  const [simpleCron, setSimpleCron] = useState<{
    expression: string;
    frequency: Frequency;
  }>({
    expression: DEFAULT_POLICY_SCHEDULE,
    frequency: DEFAULT_POLICY_FREQUENCY,
  });
  const [isAdvancedCronVisible, setIsAdvancedCronVisible] = useState<boolean>(
    Boolean(policy.schedule && policy.schedule !== DEFAULT_POLICY_SCHEDULE)
  );
  const [fieldToPreferredValueMap, setFieldToPreferredValueMap] = useState<any>({});

  const renderNameField = () => (
    <EuiDescribedFormGroup
      title={
        <EuiTitle size="s">
          <h3>
            <FormattedMessage
              id="xpack.snapshotRestore.policyForm.stepLogistics.nameDescriptionTitle"
              defaultMessage="Policy name"
            />
          </h3>
        </EuiTitle>
      }
      description={
        <FormattedMessage
          id="xpack.snapshotRestore.policyForm.stepLogistics.nameDescription"
          defaultMessage="A unique identifier for this policy."
        />
      }
      fullWidth
    >
      <EuiFormRow
        label={
          <FormattedMessage
            id="xpack.snapshotRestore.policyForm.stepLogistics.nameLabel"
            defaultMessage="Name"
          />
        }
        isInvalid={touched.name && Boolean(errors.name)}
        error={errors.name}
        fullWidth
      >
        <EuiFieldText
          isInvalid={touched.name && Boolean(errors.name)}
          defaultValue={policy.name}
          fullWidth
          onBlur={() => setTouched({ ...touched, name: true })}
          onChange={(e) => {
            updatePolicy({
              name: e.target.value,
            });
          }}
          placeholder={i18n.translate(
            'xpack.snapshotRestore.policyForm.stepLogistics.namePlaceholder',
            {
              defaultMessage: 'daily-snapshots',
              description:
                'Example SLM policy name. Similar to index names, do not use spaces in translation.',
            }
          )}
          data-test-subj="nameInput"
          disabled={isEditing}
        />
      </EuiFormRow>
    </EuiDescribedFormGroup>
  );

  const renderRepositoryField = () => (
    <EuiDescribedFormGroup
      title={
        <EuiTitle size="s">
          <h3>
            <FormattedMessage
              id="xpack.snapshotRestore.policyForm.stepLogistics.repositoryDescriptionTitle"
              defaultMessage="Repository"
            />
          </h3>
        </EuiTitle>
      }
      description={
        <FormattedMessage
          id="xpack.snapshotRestore.policyForm.stepLogistics.repositoryDescription"
          defaultMessage="The repository where you want to store the snapshots."
        />
      }
      fullWidth
    >
      <EuiFormRow
        label={
          <FormattedMessage
            id="xpack.snapshotRestore.policyForm.stepLogistics.policyRepositoryLabel"
            defaultMessage="Repository"
          />
        }
        isInvalid={touched.repository && Boolean(errors.repository)}
        error={errors.repository}
        fullWidth
      >
        {renderRepositorySelect()}
      </EuiFormRow>
    </EuiDescribedFormGroup>
  );

  const renderRepositorySelect = () => {
    if (isLoadingRepositories) {
      return (
        <InlineLoading>
          <FormattedMessage
            id="xpack.snapshotRestore.policyForm.loadingRepositoriesDescription"
            defaultMessage="Loading repositories…"
          />
        </InlineLoading>
      );
    }

    if (errorLoadingRepositories) {
      return (
        <SectionError
          title={
            <FormattedMessage
              id="xpack.snapshotRestore.policyForm.loadingRepositoriesErrorMessage"
              defaultMessage="Error loading repositories"
            />
          }
          error={errorLoadingRepositories}
          actions={
            <EuiButton
              onClick={() => reloadRepositories()}
              color="danger"
              iconType="refresh"
              data-test-subj="reloadRepositoriesButton"
            >
              <FormattedMessage
                id="xpack.snapshotRestore.policyForm.reloadRepositoriesButtonLabel"
                defaultMessage="Reload repositories"
              />
            </EuiButton>
          }
        />
      );
    }

    if (repositories.length === 0) {
      return (
        <SectionError
          title={
            <FormattedMessage
              id="xpack.snapshotRestore.policyForm.noRepositoriesErrorTitle"
              defaultMessage="You don't have any repositories"
            />
          }
          error={{
            error: i18n.translate('xpack.snapshotRestore.policyForm.noRepositoriesErrorMessage', {
              defaultMessage: 'You must register a repository to store your snapshots.',
            }),
          }}
          actions={
            <EuiButton
              {...reactRouterNavigate(history, linkToAddRepository(currentUrl))}
              color="danger"
              iconType="plusCircle"
              data-test-subj="addRepositoryButton"
            >
              <FormattedMessage
                id="xpack.snapshotRestore.policyForm.addRepositoryButtonLabel"
                defaultMessage="Register a repository"
              />
            </EuiButton>
          }
        />
      );
    } else {
      if (!policy.repository) {
        updatePolicy({
          repository: repositories[0].name,
        });
      }
    }

    const doesRepositoryExist =
      !!policy.repository &&
      repositories.some((r: { name: string }) => r.name === policy.repository);

    if (!doesRepositoryExist && !errors.repository) {
      updatePolicy(policy, { repositoryDoesNotExist: true });
    }

    if (showRepositoryNotFoundWarning !== !doesRepositoryExist) {
      setShowRepositoryNotFoundWarning(!doesRepositoryExist);
    }

    return (
      <DisableToolTip
        isManaged={policy?.isManagedPolicy}
        tooltipMessage={MANAGED_POLICY_TOOLTIP_MESSAGE}
      >
        <EuiSelect
          options={repositories.map(({ name }: Repository) => ({
            value: name,
            text: name,
          }))}
          hasNoInitialSelection={!doesRepositoryExist}
          value={!doesRepositoryExist ? '' : policy.repository}
          onBlur={() => setTouched({ ...touched, repository: true })}
          onChange={(e) => {
            updatePolicy({
              repository: e.target.value,
            });
          }}
          fullWidth
          data-test-subj="repositorySelect"
          disabled={policy?.isManagedPolicy && isEditing}
          aria-label={i18n.translate(
            'xpack.snapshotRestore.policyForm.stepLogistics.repositorySelectAriaLabel',
            { defaultMessage: 'Repository' }
          )}
        />
      </DisableToolTip>
    );
  };

  const renderSnapshotNameField = () => (
    <EuiDescribedFormGroup
      title={
        <EuiTitle size="s">
          <h3>
            <FormattedMessage
              id="xpack.snapshotRestore.policyForm.stepLogistics.snapshotNameDescriptionTitle"
              defaultMessage="Snapshot name"
            />
          </h3>
        </EuiTitle>
      }
      description={
        <FormattedMessage
          id="xpack.snapshotRestore.policyForm.stepLogistics.snapshotNameDescription"
          defaultMessage="The name for the snapshots. A unique identifier is automatically added to each name."
        />
      }
      fullWidth
    >
      <EuiFormRow
        label={
          <FormattedMessage
            id="xpack.snapshotRestore.policyForm.stepLogistics.policySnapshotNameLabel"
            defaultMessage="Snapshot name"
          />
        }
        isInvalid={touched.snapshotName && Boolean(errors.snapshotName)}
        error={errors.snapshotName}
        helpText={
          <FormattedMessage
            id="xpack.snapshotRestore.policyForm.stepLogistics.policySnapshotNameHelpText"
            defaultMessage="Supports date math expressions. {docLink}"
            values={{
              docLink: (
                <EuiLink href={docLinks.links.date.dateMathIndexNames} target="_blank">
                  <FormattedMessage
                    id="xpack.snapshotRestore.policyForm.stepLogistics.policySnapshotNameHelpTextDocLink"
                    defaultMessage="Learn more."
                  />
                </EuiLink>
              ),
            }}
          />
        }
        fullWidth
      >
        <DisableToolTip
          isManaged={policy?.isManagedPolicy}
          tooltipMessage={MANAGED_POLICY_TOOLTIP_MESSAGE}
        >
          <EuiFieldText
            defaultValue={policy.snapshotName}
            fullWidth
            onChange={(e) => {
              updatePolicy({
                snapshotName: e.target.value,
              });
            }}
            onBlur={() => setTouched({ ...touched, snapshotName: true })}
            placeholder={i18n.translate(
              'xpack.snapshotRestore.policyForm.stepLogistics.policySnapshotNamePlaceholder',
              {
                defaultMessage: `'<daily-snap-{now/d}>'`,
                description:
                  'Example date math snapshot name. Keeping the same syntax is important: <SOME-TRANSLATION-{now/d}>',
              }
            )}
            data-test-subj="snapshotNameInput"
            disabled={policy?.isManagedPolicy && isEditing}
          />
        </DisableToolTip>
      </EuiFormRow>
    </EuiDescribedFormGroup>
  );

  const renderScheduleField = () => (
    <EuiDescribedFormGroup
      title={
        <EuiTitle size="s">
          <h3>
            <FormattedMessage
              id="xpack.snapshotRestore.policyForm.stepLogistics.scheduleDescriptionTitle"
              defaultMessage="Schedule"
            />
          </h3>
        </EuiTitle>
      }
      description={
        <FormattedMessage
          id="xpack.snapshotRestore.policyForm.stepLogistics.scheduleDescription"
          defaultMessage="The frequency at which to take the snapshots."
        />
      }
      fullWidth
    >
      {isAdvancedCronVisible ? (
        <Fragment>
          <EuiFormRow
            label={
              <FormattedMessage
                id="xpack.snapshotRestore.policyForm.stepLogistics.policyScheduleLabel"
                defaultMessage="Schedule"
              />
            }
            isInvalid={touched.schedule && Boolean(errors.schedule)}
            error={errors.schedule}
            helpText={
              <FormattedMessage
                id="xpack.snapshotRestore.policyForm.stepLogistics.policyScheduleHelpText"
                defaultMessage="Use cron expression. {docLink}"
                values={{
                  docLink: (
                    <EuiLink href={docLinks.links.apis.cronExpressions} target="_blank">
                      <FormattedMessage
                        id="xpack.snapshotRestore.policyForm.stepLogistics.policyScheduleHelpTextDocLink"
                        defaultMessage="Learn more."
                      />
                    </EuiLink>
                  ),
                }}
              />
            }
            fullWidth
          >
            <EuiFieldText
              isInvalid={touched.schedule && Boolean(errors.schedule)}
              defaultValue={policy.schedule}
              fullWidth
              onChange={(e) => {
                updatePolicy({
                  schedule: e.target.value,
                });
              }}
              onBlur={() => setTouched({ ...touched, schedule: true })}
              placeholder={DEFAULT_POLICY_SCHEDULE}
              data-test-subj="advancedCronInput"
            />
          </EuiFormRow>

          <EuiSpacer size="m" />

          <EuiText size="s">
            <EuiLink
              onClick={() => {
                setIsAdvancedCronVisible(false);
                updatePolicy({
                  schedule: simpleCron.expression,
                });
              }}
              data-test-subj="showBasicCronLink"
            >
              <FormattedMessage
                id="xpack.snapshotRestore.policyForm.stepLogistics.policyScheduleButtonBasicLabel"
                defaultMessage="Create basic interval"
              />
            </EuiLink>
          </EuiText>
        </Fragment>
      ) : (
        <Fragment>
          <CronEditor
            frequencyBlockList={['MINUTE']} // ES disallows a frequency faster than 15m
            fieldToPreferredValueMap={fieldToPreferredValueMap}
            cronExpression={simpleCron.expression}
            frequency={simpleCron.frequency}
            onChange={({
              cronExpression: expression,
              frequency,
              fieldToPreferredValueMap: newFieldToPreferredValueMap,
            }) => {
              setSimpleCron({
                expression,
                frequency,
              });
              setFieldToPreferredValueMap(newFieldToPreferredValueMap);
              updatePolicy({
                schedule: expression,
              });
            }}
          />

          <EuiSpacer size="s" />

          <EuiText size="s">
            <EuiLink
              onClick={() => {
                setIsAdvancedCronVisible(true);
              }}
              data-test-subj="showAdvancedCronLink"
            >
              <FormattedMessage
                id="xpack.snapshotRestore.policyForm.stepLogistics.policyScheduleButtonAdvancedLabel"
                defaultMessage="Create cron expression"
              />
            </EuiLink>
          </EuiText>
        </Fragment>
      )}
    </EuiDescribedFormGroup>
  );

  return (
    <Fragment>
      {/* Step title and doc link */}
      <EuiFlexGroup justifyContent="spaceBetween">
        <EuiFlexItem grow={false}>
          <EuiTitle>
            <h2>
              <FormattedMessage
                id="xpack.snapshotRestore.policyForm.stepLogisticsTitle"
                defaultMessage="Logistics"
              />
            </h2>
          </EuiTitle>
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            size="s"
            flush="right"
            href={docLinks.links.apis.putSnapshotLifecyclePolicy}
            target="_blank"
            iconType="question"
          >
            <FormattedMessage
              id="xpack.snapshotRestore.policyForm.stepLogistics.docsButtonLabel"
              defaultMessage="Logistics docs"
            />
          </EuiButtonEmpty>
        </EuiFlexItem>
      </EuiFlexGroup>

      {showRepositoryNotFoundWarning && (
        <>
          <EuiSpacer size="m" />
          <EuiCallOut
            announceOnMount
            data-test-subj="repositoryNotFoundWarning"
            title={
              <FormattedMessage
                id="xpack.snapshotRestore.policyForm.stepLogistics.selectRepository.policyRepositoryNotFoundTitle"
                defaultMessage="Repository not found"
              />
            }
            role="alert"
            color="danger"
            iconType="warning"
          >
            <FormattedMessage
              id="xpack.snapshotRestore.policyForm.stepLogistics.selectRepository.policyRepositoryNotFoundDescription"
              defaultMessage="Repository {repo} does not exist. Please select an existing repository."
              values={{ repo: <EuiCode>{policy.repository}</EuiCode> }}
            />
          </EuiCallOut>
        </>
      )}

      <EuiSpacer size="l" />
      {renderNameField()}
      {renderSnapshotNameField()}
      {renderRepositoryField()}
      {renderScheduleField()}
    </Fragment>
  );
};
