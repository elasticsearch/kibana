/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactElement } from 'react';
import type { Observable } from 'rxjs';
import { combineLatest, ReplaySubject, Subject } from 'rxjs';
import { map, startWith, tap } from 'rxjs';
import { CATEGORY_EXAMPLES_VALIDATION_STATUS } from '@kbn/ml-category-validator';
import {
  basicJobValidation,
  basicDatafeedValidation,
  basicJobAndDatafeedValidation,
} from '../../../../../../common/util/job_utils';
import { getNewJobLimits } from '../../../../services/ml_server_info';
import type { JobCreator, JobCreatorType } from '../job_creator';
import { isCategorizationJobCreator } from '../job_creator';
import { populateValidationMessages } from './util';
import type { CardinalityValidatorResult, JobExistsResult, GroupsExistResult } from './validators';
import { cardinalityValidator, jobIdValidator, groupIdsValidator } from './validators';

import { JOB_TYPE } from '../../../../../../common/constants/new_job';

// delay start of validation to allow the user to make changes
// e.g. if they are typing in a new value, try not to validate
// after every keystroke
export const VALIDATION_DELAY_MS = 500;

type AsyncValidatorsResult = Partial<
  CardinalityValidatorResult & JobExistsResult & GroupsExistResult
>;

/**
 * Union of possible validation results.
 */
export type JobValidationResult = BasicValidations & AsyncValidatorsResult;

export interface ValidationSummary {
  basic: boolean;
  advanced: boolean;
}

export interface Validation {
  valid: boolean;
  message?: string | ReactElement;
}

export interface BasicValidations {
  jobId: Validation;
  groupIds: Validation;
  modelMemoryLimit: Validation;
  bucketSpan: Validation;
  duplicateDetectors: Validation;
  query: Validation;
  queryDelay: Validation;
  frequency: Validation;
  scrollSize: Validation;
  categorizerMissingPerPartition: Validation;
  categorizerVaryingPerPartitionField: Validation;
  summaryCountField: Validation;
  projectRouting: Validation;
}

export interface AdvancedValidations {
  categorizationFieldValid: Validation;
}

export class JobValidator {
  private _jobCreator: JobCreatorType;
  private _validationSummary: ValidationSummary;
  private _lastJobConfig: string;
  private _lastDatafeedConfig: string;
  private _validateTimeout: ReturnType<typeof setTimeout> | null = null;
  private _asyncValidators$: Array<Observable<AsyncValidatorsResult>> = [];
  private _asyncValidatorsResult$: Observable<AsyncValidatorsResult>;
  private _basicValidations: BasicValidations = {
    jobId: { valid: true },
    groupIds: { valid: true },
    modelMemoryLimit: { valid: true },
    bucketSpan: { valid: true },
    duplicateDetectors: { valid: true },
    query: { valid: true },
    queryDelay: { valid: true },
    frequency: { valid: true },
    scrollSize: { valid: true },
    categorizerMissingPerPartition: { valid: true },
    categorizerVaryingPerPartitionField: { valid: true },
    summaryCountField: { valid: true },
    projectRouting: { valid: true },
  };
  private _advancedValidations: AdvancedValidations = {
    categorizationFieldValid: { valid: true },
  };
  private _validating: boolean = false;
  private _basicValidationResult$ = new ReplaySubject<JobValidationResult>(2);

  private _jobCreatorSubject$ = new Subject<JobCreator>();

  /**
   * Observable that combines basic and async validation results.
   */
  public validationResult$: Observable<JobValidationResult>;

  constructor(jobCreator: JobCreatorType) {
    this._jobCreator = jobCreator;
    this._lastJobConfig = this._jobCreator.formattedJobJson;
    this._lastDatafeedConfig = this._jobCreator.formattedDatafeedJson;
    this._validationSummary = {
      basic: false,
      advanced: false,
    };

    this._asyncValidators$ = [
      cardinalityValidator(this._jobCreatorSubject$),
      jobIdValidator(this._jobCreatorSubject$),
      groupIdsValidator(this._jobCreatorSubject$),
    ];

    this._asyncValidatorsResult$ = combineLatest(this._asyncValidators$).pipe(
      map((res) => {
        return res.reduce((acc, curr) => {
          return {
            ...acc,
            ...(curr ? curr : {}),
          };
        }, {});
      }),
      startWith({})
    );

    this.validationResult$ = combineLatest([
      this._basicValidationResult$,
      this._asyncValidatorsResult$,
    ]).pipe(
      map(([basicValidationResult, asyncValidatorsResult]) => {
        return {
          ...basicValidationResult,
          ...asyncValidatorsResult,
        };
      }),
      tap((latestValidationResult) => {
        this.latestValidationResult = latestValidationResult;
      })
    );
  }

  latestValidationResult: JobValidationResult = this._basicValidations;

  public validate(callback: () => void, forceValidate: boolean = false) {
    this._validating = true;
    const formattedJobConfig = this._jobCreator.formattedJobJson;
    const formattedDatafeedConfig = this._jobCreator.formattedDatafeedJson;

    this._runAdvancedValidation();
    // only validate if the config has changed
    if (
      forceValidate ||
      formattedJobConfig !== this._lastJobConfig ||
      formattedDatafeedConfig !== this._lastDatafeedConfig
    ) {
      if (this._validateTimeout !== null) {
        // clear any previous on going validation timeouts
        clearTimeout(this._validateTimeout);
      }
      this._lastJobConfig = formattedJobConfig;
      this._lastDatafeedConfig = formattedDatafeedConfig;
      this._validateTimeout = setTimeout(() => {
        this._runBasicValidation();

        this._jobCreatorSubject$.next(this._jobCreator);

        this._validating = false;
        this._validateTimeout = null;
        callback();
      }, VALIDATION_DELAY_MS);
    } else {
      // _validating is still true if there is a previous validation timeout on going.
      this._validating = this._validateTimeout !== null;
    }
    callback();
  }

  private _resetBasicValidations() {
    this._validationSummary.basic = true;
    Object.values(this._basicValidations).forEach((v) => {
      v.valid = true;
      delete v.message;
    });
  }

  private _runBasicValidation() {
    this._resetBasicValidations();

    const jobConfig = this._jobCreator.jobConfig;
    const datafeedConfig = this._jobCreator.datafeedConfig;
    const limits = getNewJobLimits();

    // run standard basic validation
    const basicJobResults = basicJobValidation(jobConfig, undefined, limits);
    populateValidationMessages(basicJobResults, this._basicValidations, jobConfig, datafeedConfig);

    const basicDatafeedResults = basicDatafeedValidation(datafeedConfig);
    populateValidationMessages(
      basicDatafeedResults,
      this._basicValidations,
      jobConfig,
      datafeedConfig
    );

    const basicJobAndDatafeedResults = basicJobAndDatafeedValidation(jobConfig, datafeedConfig);
    populateValidationMessages(
      basicJobAndDatafeedResults,
      this._basicValidations,
      jobConfig,
      datafeedConfig
    );

    this._validationSummary.basic = this._isOverallBasicValid();
    // Update validation results subject
    this._basicValidationResult$.next(this._basicValidations);
  }

  private _runAdvancedValidation() {
    if (isCategorizationJobCreator(this._jobCreator)) {
      this._advancedValidations.categorizationFieldValid.valid =
        this._jobCreator.overallValidStatus !== CATEGORY_EXAMPLES_VALIDATION_STATUS.INVALID;
    }
  }

  private _isOverallBasicValid() {
    return Object.values(this._basicValidations).some((v) => v.valid === false) === false;
  }

  public get validationSummary(): ValidationSummary {
    return this._validationSummary;
  }

  public get bucketSpan(): Validation {
    return this._basicValidations.bucketSpan;
  }
  public get summaryCountField(): Validation {
    return this._basicValidations.summaryCountField;
  }

  public get duplicateDetectors(): Validation {
    return this._basicValidations.duplicateDetectors;
  }

  public get jobId(): Validation {
    return this._basicValidations.jobId;
  }

  public get groupIds(): Validation {
    return this._basicValidations.groupIds;
  }

  public get modelMemoryLimit(): Validation {
    return this._basicValidations.modelMemoryLimit;
  }

  public get query(): Validation {
    return this._basicValidations.query;
  }

  public get queryDelay(): Validation {
    return this._basicValidations.queryDelay;
  }

  public get frequency(): Validation {
    return this._basicValidations.frequency;
  }

  public get scrollSize(): Validation {
    return this._basicValidations.scrollSize;
  }

  public get projectRouting(): Validation {
    return this._basicValidations.projectRouting;
  }

  public set advancedValid(valid: boolean) {
    this._validationSummary.advanced = valid;
  }

  public get validating(): boolean {
    return this._validating;
  }

  public get categorizationField() {
    return this._advancedValidations.categorizationFieldValid.valid;
  }

  public set categorizationField(valid: boolean) {
    this._advancedValidations.categorizationFieldValid.valid = valid;
  }

  public get categorizerMissingPerPartition() {
    return this._basicValidations.categorizerMissingPerPartition;
  }

  public get categorizerVaryingPerPartitionField() {
    return this._basicValidations.categorizerVaryingPerPartitionField;
  }

  /**
   * Indicates if the Pick Fields step has a valid input
   */
  public get isPickFieldsStepValid(): boolean {
    return (
      this._jobCreator.detectors.length > 0 &&
      (this._jobCreator.type !== JOB_TYPE.ADVANCED ||
        (this._jobCreator.type === JOB_TYPE.ADVANCED && this.modelMemoryLimit.valid)) &&
      this.bucketSpan.valid &&
      this.duplicateDetectors.valid &&
      this.categorizerMissingPerPartition.valid &&
      this.categorizerVaryingPerPartitionField.valid &&
      this.summaryCountField.valid &&
      !this.validating &&
      (this._jobCreator.type !== JOB_TYPE.CATEGORIZATION ||
        (this._jobCreator.type === JOB_TYPE.CATEGORIZATION && this.categorizationField))
    );
  }

  public get isModelMemoryEstimationPayloadValid(): boolean {
    return (
      this._jobCreator.detectors.length > 0 &&
      this.bucketSpan.valid &&
      this.duplicateDetectors.valid &&
      (this._jobCreator.type !== JOB_TYPE.CATEGORIZATION ||
        (this._jobCreator.type === JOB_TYPE.CATEGORIZATION && this.categorizationField))
    );
  }
}
