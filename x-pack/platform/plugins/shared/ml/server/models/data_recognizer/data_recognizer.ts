/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import fs from 'fs';
import Boom from '@hapi/boom';
import numeral from '@elastic/numeral';
import type {
  KibanaRequest,
  IScopedClusterClient,
  SavedObjectsClientContract,
} from '@kbn/core/server';
import moment from 'moment';
import { merge, intersection } from 'lodash';
import type { DataViewsService } from '@kbn/data-views-plugin/common';
import { isPopulatedObject } from '@kbn/ml-is-populated-object';
import { isDefined } from '@kbn/ml-is-defined';
import type { AnalysisLimits } from '@kbn/ml-common-types/anomaly_detection_jobs/job';
import type { RecognizeModuleResultDataView } from '@kbn/ml-common-types/modules';
import { ML_MODULE_SAVED_OBJECT_TYPE } from '@kbn/ml-common-types/saved_objects';
import type {
  KibanaObjects,
  KibanaObjectConfig,
  ModuleDatafeed,
  ModuleJob,
  Module,
  FileBasedModule,
  Logo,
  JobOverride,
  DatafeedOverride,
  GeneralJobsOverride,
  DatafeedResponse,
  JobResponse,
  KibanaObjectResponse,
  DataRecognizerConfigResponse,
  GeneralDatafeedsOverride,
  JobSpecificOverride,
  RecognizeResult,
} from '@kbn/ml-common-types/modules';
import { isGeneralJobOverride } from '@kbn/ml-common-types/modules';
import type { JobExistResult, JobStat } from '@kbn/ml-common-types/data_recognizer';
import type { Datafeed } from '@kbn/ml-common-types/anomaly_detection_jobs/datafeed';
import type { CompatibleModule } from '../../../common/constants/app';
import type { MlClient } from '../../lib/ml_client';
import {
  getLatestDataOrBucketTimestamp,
  prefixDatafeedId,
  splitIndexPatternNames,
} from '../../../common/util/job_utils';
import { mlLog } from '../../lib/log';
import { calculateModelMemoryLimitProvider } from '../calculate_model_memory_limit';
import { fieldsServiceProvider } from '../fields_service';
import { jobServiceProvider } from '../job_service';
import { resultsServiceProvider } from '../results_service';
import type { MLSavedObjectService } from '../../saved_objects';
import type { ServerlessInfo } from '../../types';

const ML_DIR = 'ml';
const KIBANA_DIR = 'kibana';
const INDEX_PATTERN_ID = 'INDEX_PATTERN_ID';
const INDEX_PATTERN_NAME = 'INDEX_PATTERN_NAME';
export const SAVED_OBJECT_TYPES = {
  DASHBOARD: 'dashboard',
  SEARCH: 'search',
  VISUALIZATION: 'visualization',
};

function isModule(arg: unknown): arg is Module {
  return isPopulatedObject(arg) && Array.isArray(arg.jobs) && arg.jobs[0]?.config !== undefined;
}

function isFileBasedModule(arg: unknown): arg is FileBasedModule {
  return isPopulatedObject(arg) && Array.isArray(arg.jobs) && arg.jobs[0]?.file !== undefined;
}

export interface Config {
  dirName?: string;
  module: FileBasedModule | Module;
  isSavedObject: boolean;
}

interface ObjectExistResult {
  id: string;
  type: string;
  exists?: boolean;
}

interface ObjectExistResponse {
  id: string;
  type: string;
  exists: boolean;
  savedObject?: { id: string; type: string; attributes: KibanaObjectConfig };
}

interface SaveResults {
  jobs: JobResponse[];
  datafeeds: DatafeedResponse[];
  savedObjects: KibanaObjectResponse[];
}

export class DataRecognizer {
  private _client: IScopedClusterClient;
  private _mlClient: MlClient;
  private _savedObjectsClient: SavedObjectsClientContract;
  private _mlSavedObjectService: MLSavedObjectService;
  private _dataViewsService: DataViewsService;
  private _request: KibanaRequest;

  private _modulesDir = `${__dirname}/modules`;
  private _indexPatternName: string = '';
  private _indexPatternId: string | undefined = undefined;

  private _jobsService: ReturnType<typeof jobServiceProvider>;
  private _resultsService: ReturnType<typeof resultsServiceProvider>;
  private _calculateModelMemoryLimit: ReturnType<typeof calculateModelMemoryLimitProvider>;
  private _compatibleModuleType: CompatibleModule | null;

  /**
   * A temporary cache of configs loaded from disk and from save object service.
   * The configs from disk will not change while kibana is running.
   * The configs from saved objects could potentially change while an instance of
   * DataRecognizer exists, if a fleet package containing modules is installed.
   * However the chance of this happening is very low and so the benefit of using
   * this cache outweighs the risk of the cache being out of date during the short
   * existence of a DataRecognizer instance.
   */
  private _configCache: Config[] | null = null;

  /**
   * List of the module jobs that require model memory estimation
   */
  private _jobsForModelMemoryEstimation: Array<{ job: ModuleJob; query: any }> = [];

  constructor(
    mlClusterClient: IScopedClusterClient,
    mlClient: MlClient,
    savedObjectsClient: SavedObjectsClientContract,
    dataViewsService: DataViewsService,
    mlSavedObjectService: MLSavedObjectService,
    request: KibanaRequest,
    compatibleModuleType: CompatibleModule | null,
    serverless: ServerlessInfo
  ) {
    this._client = mlClusterClient;
    this._mlClient = mlClient;
    this._savedObjectsClient = savedObjectsClient;
    this._dataViewsService = dataViewsService;
    this._mlSavedObjectService = mlSavedObjectService;
    this._request = request;
    this._jobsService = jobServiceProvider(mlClusterClient, mlClient, serverless);
    this._resultsService = resultsServiceProvider(mlClient);
    this._calculateModelMemoryLimit = calculateModelMemoryLimitProvider(mlClusterClient, mlClient);
    this._compatibleModuleType = compatibleModuleType;
  }

  // list all directories under the given directory
  private async _listDirs(dirName: string): Promise<string[]> {
    const dirs: string[] = [];
    return new Promise((resolve, reject) => {
      fs.readdir(dirName, (err, fileNames) => {
        if (err) {
          reject(err);
        }
        fileNames.forEach((fileName) => {
          const path = `${dirName}/${fileName}`;
          if (fs.lstatSync(path).isDirectory()) {
            dirs.push(fileName);
          }
        });
        resolve(dirs);
      });
    });
  }

  private async _readFile(fileName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      fs.readFile(fileName, 'utf-8', (err, content) => {
        if (err) {
          reject(err);
        } else {
          resolve(content);
        }
      });
    });
  }

  private async _loadConfigs(moduleTagFilters?: string[]): Promise<Config[]> {
    if (this._configCache !== null) {
      return this._configCache;
    }

    const localConfigs: Config[] = [];
    const dirs = await this._listDirs(this._modulesDir);
    await Promise.all(
      dirs.map(async (dir) => {
        let file: string | undefined;
        try {
          file = await this._readFile(`${this._modulesDir}/${dir}/manifest.json`);
        } catch (error) {
          mlLog.warn(`Data recognizer skipping folder ${dir} as manifest.json cannot be read`);
        }

        if (file !== undefined) {
          try {
            localConfigs.push({
              dirName: dir,
              module: JSON.parse(file),
              isSavedObject: false,
            });
          } catch (error) {
            mlLog.warn(`Data recognizer error parsing ${dir}/manifest.json. ${error}`);
          }
        }
      })
    );

    const savedObjectConfigs = (await this._loadSavedObjectModules()).map((module) => ({
      module,
      isSavedObject: true,
    }));

    this._configCache = filterConfigs(
      [...localConfigs, ...savedObjectConfigs],
      this._compatibleModuleType,
      moduleTagFilters ?? []
    );

    return this._configCache;
  }

  private async _loadSavedObjectModules() {
    const jobs = await this._savedObjectsClient.find<Module>({
      type: ML_MODULE_SAVED_OBJECT_TYPE,
      perPage: 10000,
    });

    return jobs.saved_objects.map((o) => o.attributes);
  }

  // get the manifest.json file for a specified id, e.g. "nginx"
  private async _findConfig(id: string, moduleTagFilters?: string[]) {
    const configs = await this._loadConfigs(moduleTagFilters);
    return configs.find((i) => i.module.id === id);
  }

  // called externally by an endpoint
  public async findIndexMatches(
    moduleId: string,
    size: number = 15
  ): Promise<RecognizeModuleResultDataView[]> {
    const config = await this._findConfig(moduleId);
    if (config?.module.query === undefined) {
      return [];
    }

    try {
      const idsWithTitle = await this._dataViewsService.getIdsWithTitle();
      // create temp objects with a function for running the query
      const tempObjs = idsWithTitle.map(({ id, title, name }) => {
        return {
          id,
          title,
          name,
          func: async () =>
            this._client.asCurrentUser.search(
              {
                index: title, // title is index pattern we can search by e.g. "filebeat-*"
                size: 0,
                body: {
                  query: config?.module.query,
                },
              },
              { maxRetries: 0 }
            ),
        };
      });

      // run all the queries in parallel
      const response = await Promise.all(
        tempObjs.map(async ({ id, name, title, func }) => {
          try {
            const resp = await func();
            const totalHits =
              typeof resp.hits.total === 'number' ? resp.hits.total : resp.hits?.total?.value ?? 0;
            return { id, name, title, totalHits };
          } catch (error) {
            mlLog.warn(
              `Data recognizer error running search for query defined in module ${config.module.id}. ${error}`
            );
            return { id, name, title, totalHits: 0 };
          }
        })
      );

      return response
        .reduce<RecognizeModuleResultDataView[]>((acc, { id, title, name, totalHits }) => {
          if (totalHits > 0) {
            acc.push({ id, title, name });
          }
          return acc;
        }, [])
        .slice(0, size);
    } catch (error) {
      mlLog.warn(
        `Data recognizer error fetching and matching data views for query in ${config.module.id}. ${error}`
      );
    }

    return [];
  }

  // called externally by an endpoint
  public async findMatches(
    indexPattern: string,
    moduleTagFilters?: string[]
  ): Promise<RecognizeResult[]> {
    const manifestFiles = await this._loadConfigs(moduleTagFilters);
    const results: RecognizeResult[] = [];

    await Promise.all(
      manifestFiles.map(async (i) => {
        const moduleConfig = i.module;
        let match = false;
        try {
          match = await this._searchForFields(moduleConfig, indexPattern);
        } catch (error) {
          mlLog.warn(
            `Data recognizer error running query defined for module ${moduleConfig.id}. ${error}`
          );
        }

        if (match === true) {
          results.push({
            id: moduleConfig.id,
            title: moduleConfig.title,
            query: moduleConfig.query,
            description: moduleConfig.description,
            logo: await this._loadLogoFile(moduleConfig, i.dirName),
          });
        }
      })
    );

    results.sort((res1, res2) => res1.id.localeCompare(res2.id));

    return results;
  }

  private async _loadLogoFile(
    moduleConfig: FileBasedModule | Module,
    dirName: string | null | undefined
  ) {
    let logo: Logo = null;

    if (moduleConfig.logo) {
      logo = moduleConfig.logo;
    } else if (moduleConfig.logoFile) {
      try {
        const logoFileString = await this._readFile(
          `${this._modulesDir}/${dirName}/${moduleConfig.logoFile}`
        );
        logo = JSON.parse(logoFileString);
      } catch (error) {
        mlLog.warn(
          `Data recognizer error loading logo file ${moduleConfig.logoFile} for module ${moduleConfig.id}. ${error}`
        );
      }
    }

    return logo;
  }

  private async _searchForFields(moduleConfig: FileBasedModule | Module, indexPattern: string) {
    if (moduleConfig.query === undefined) {
      return false;
    }

    const index = indexPattern;
    const size = 0;
    const searchBody = {
      query: moduleConfig.query,
    };

    const body = await this._client.asCurrentUser.search(
      {
        index,
        size,
        body: searchBody,
      },
      { maxRetries: 0 }
    );

    // @ts-expect-error incorrect search response type
    return body.hits.total.value > 0;
  }

  public async listModules(moduleTagFilters?: string[]): Promise<Module[]> {
    const manifestFiles = await this._loadConfigs(moduleTagFilters);
    manifestFiles.sort((a, b) => a.module.id.localeCompare(b.module.id)); // sort as json files are read from disk and could be in any order.

    const configs: Array<Module | FileBasedModule> = [];
    for (const config of manifestFiles) {
      if (config.isSavedObject) {
        configs.push(config.module);
      } else {
        configs.push(await this.getModule(config.module.id, moduleTagFilters));
      }
    }
    // casting return as Module[] so not to break external plugins who rely on this function
    // once FileBasedModules are removed this function will only deal with Modules
    return configs as Module[];
  }

  // called externally by an endpoint
  // supplying an optional prefix will add the prefix
  // to the job and datafeed configs
  public async getModule(id: string, moduleTagFilters?: string[], prefix = ''): Promise<Module> {
    let module: FileBasedModule | Module | null = null;
    let dirName: string | null = null;

    const config = await this._findConfig(id, moduleTagFilters);
    if (config !== undefined) {
      module = config.module;
      dirName = config.dirName ?? null;
    } else {
      throw Boom.notFound(`Module with the id "${id}" not found`);
    }

    const jobs: ModuleJob[] = [];
    const datafeeds: ModuleDatafeed[] = [];
    const kibana: KibanaObjects = Object.create(null);
    // load all of the job configs
    if (isModule(module)) {
      const tempJobs: ModuleJob[] = module.jobs.map((j) => ({
        id: `${prefix}${j.id}`,
        config: j.config,
      }));
      jobs.push(...tempJobs);
      const tempDatafeeds: ModuleDatafeed[] = module.datafeeds.map((d) => {
        const jobId = `${prefix}${d.job_id}`;
        return {
          id: prefixDatafeedId(d.id, prefix),
          job_id: jobId,
          config: {
            ...d.config,
            job_id: jobId,
          },
        };
      });
      datafeeds.push(...tempDatafeeds);
    } else if (isFileBasedModule(module)) {
      const tempJobs = module.jobs.map(async (job) => {
        try {
          const jobConfig = await this._readFile(
            `${this._modulesDir}/${dirName}/${ML_DIR}/${job.file}`
          );
          // use the file name for the id
          return {
            id: `${prefix}${job.id}`,
            config: JSON.parse(jobConfig),
          };
        } catch (error) {
          mlLog.warn(
            `Data recognizer error loading config for job ${job.id} for module ${id}. ${error}`
          );
        }
      });
      jobs.push(...(await Promise.all(tempJobs)).filter(isDefined));

      // load all of the datafeed configs
      const tempDatafeed = module.datafeeds.map(async (datafeed) => {
        try {
          const datafeedConfigString = await this._readFile(
            `${this._modulesDir}/${dirName}/${ML_DIR}/${datafeed.file}`
          );
          const datafeedConfig = JSON.parse(datafeedConfigString) as Datafeed;
          // use the job id from the module
          datafeedConfig.job_id = `${prefix}${datafeed.job_id}`;

          return {
            id: prefixDatafeedId(datafeed.id, prefix),
            job_id: datafeedConfig.job_id,
            config: datafeedConfig,
          };
        } catch (error) {
          mlLog.warn(
            `Data recognizer error loading config for datafeed ${datafeed.id} for module ${id}. ${error}`
          );
        }
      });

      datafeeds.push(...(await Promise.all(tempDatafeed)).filter(isDefined));
    }

    module.logo = await this._loadLogoFile(module, dirName);

    // load all of the kibana saved objects
    if (module.kibana !== undefined) {
      const kKeys = Object.keys(module.kibana) as Array<keyof FileBasedModule['kibana']>;
      await Promise.all(
        kKeys.map(async (key) => {
          kibana[key] = [];
          if (isFileBasedModule(module)) {
            await Promise.all(
              module.kibana[key].map(async (obj) => {
                try {
                  const kConfigString = await this._readFile(
                    `${this._modulesDir}/${dirName}/${KIBANA_DIR}/${key}/${obj.file}`
                  );
                  // use the file name for the id
                  const kId = obj.file.replace('.json', '');
                  const kConfig = JSON.parse(kConfigString);
                  kibana[key]!.push({
                    id: kId,
                    title: kConfig.title,
                    config: kConfig,
                  });
                } catch (error) {
                  mlLog.warn(
                    `Data recognizer error loading config for ${key} ${obj.id} for module ${id}. ${error}`
                  );
                }
              })
            );
          }
        })
      );
    }

    return {
      ...module,
      jobs,
      datafeeds,
      kibana,
    };
  }

  // called externally by an endpoint
  // takes a module config id, an optional jobPrefix and the request object
  // creates all of the jobs, datafeeds and savedObjects  listed in the module config.
  // if any of the savedObjects already exist, they will not be overwritten.
  public async setup(
    moduleId: string,
    jobPrefix?: string,
    groups?: string[],
    indexPatternName?: string,
    query?: any,
    useDedicatedIndex?: boolean,
    startDatafeed?: boolean,
    start?: number,
    end?: number,
    jobOverrides?: JobOverride | JobOverride[],
    datafeedOverrides?: DatafeedOverride | DatafeedOverride[],
    estimateModelMemory?: boolean,
    applyToAllSpaces: boolean = false,
    projectRouting?: string
  ) {
    // load the config from disk
    const moduleConfig = await this.getModule(moduleId, undefined, jobPrefix);

    if (indexPatternName === undefined && moduleConfig.defaultIndexPattern === undefined) {
      throw Boom.badRequest(
        `No index pattern configured in "${moduleId}" configuration file and no index pattern passed to the endpoint`
      );
    }

    this._indexPatternName =
      indexPatternName === undefined ? moduleConfig.defaultIndexPattern : indexPatternName;
    this._indexPatternId = await this._getIndexPatternId(this._indexPatternName);

    // the module's jobs contain custom URLs which require an index pattern id
    // but there is no corresponding data view, throw an error
    if (this._indexPatternId === undefined && this._doJobUrlsContainIndexPatternId(moduleConfig)) {
      throw Boom.badRequest(
        `Module's jobs contain custom URLs which require a Kibana data view (${this._indexPatternName}) which cannot be found.`
      );
    }

    // the module's saved objects require an index pattern id
    // but there is no corresponding data view, throw an error
    if (
      this._indexPatternId === undefined &&
      this._doSavedObjectsContainIndexPatternId(moduleConfig)
    ) {
      throw Boom.badRequest(
        `Module's saved objects contain custom URLs which require a Kibana data view (${this._indexPatternName}) which cannot be found.`
      );
    }

    // create an empty results object
    const results = this._createResultsTemplate(moduleConfig);
    const saveResults: SaveResults = {
      jobs: [] as JobResponse[],
      datafeeds: [] as DatafeedResponse[],
      savedObjects: [] as KibanaObjectResponse[],
    };

    this._jobsForModelMemoryEstimation = moduleConfig.jobs.map((job) => ({
      job,
      query: moduleConfig.datafeeds.find((d) => d.config.job_id === job.id)?.config.query ?? null,
    }));

    this.applyJobConfigOverrides(moduleConfig, jobOverrides, jobPrefix);
    this.applyDatafeedConfigOverrides(moduleConfig, datafeedOverrides, jobPrefix);
    this._updateDatafeedIndices(moduleConfig);
    this._updateJobUrlIndexPatterns(moduleConfig);
    await this._updateModelMemoryLimits(moduleConfig, estimateModelMemory, start, end);

    // create the jobs
    if (moduleConfig.jobs && moduleConfig.jobs.length) {
      if (Array.isArray(groups)) {
        // update groups list for each job
        moduleConfig.jobs.forEach((job) => (job.config.groups = groups));
      }

      // Set the results_index_name property for each job if useDedicatedIndex is true
      if (useDedicatedIndex === true) {
        moduleConfig.jobs.forEach((job) => (job.config.results_index_name = job.id));
      }
      saveResults.jobs = await this._saveJobs(moduleConfig.jobs, applyToAllSpaces);
    }

    // create the datafeeds
    if (moduleConfig.datafeeds && moduleConfig.datafeeds.length) {
      if (typeof query === 'object' && query !== null) {
        moduleConfig.datafeeds.forEach((df) => {
          df.config.query = query;
        });
      }

      if (projectRouting !== undefined) {
        moduleConfig.datafeeds.forEach((df) => {
          df.config.project_routing = projectRouting;
        });
      }

      saveResults.datafeeds = await this._saveDatafeeds(moduleConfig.datafeeds);

      if (startDatafeed) {
        const savedDatafeeds = moduleConfig.datafeeds.filter((df) => {
          const datafeedResult = saveResults.datafeeds.find((d) => d.id === df.id);
          return datafeedResult !== undefined && datafeedResult.success === true;
        });

        const startResults = await this._startDatafeeds(savedDatafeeds, start, end);
        saveResults.datafeeds.forEach((df) => {
          const startedDatafeed = startResults[df.id];
          if (startedDatafeed !== undefined) {
            df.started = startedDatafeed.started;
            df.awaitingMlNodeAllocation = startedDatafeed.awaitingMlNodeAllocation;
            if (startedDatafeed.error !== undefined) {
              df.error = startedDatafeed.error;
            }
          }
        });
      }
    }

    // create the savedObjects
    if (moduleConfig.kibana) {
      // update the saved objects with the index pattern id
      this._updateSavedObjectIndexPatterns(moduleConfig);

      const savedObjects = await this._createSavedObjectsToSave(moduleConfig);
      // update the exists flag in the results
      this._updateKibanaResults(results.kibana, savedObjects);
      // create the savedObjects
      try {
        saveResults.savedObjects = await this._saveKibanaObjects(savedObjects);
      } catch (error) {
        // only one error is returned for the bulk create saved object request
        // so populate every saved object with the same error.
        this._populateKibanaResultErrors(results.kibana, error.output?.payload);
      }
    }
    // merge all the save results
    await this._updateResults(results, saveResults);
    return results;
  }

  public async dataRecognizerJobsExist(moduleId: string): Promise<JobExistResult> {
    const results = Object.create(null) as JobExistResult;

    // Load the module with the specified ID and check if the jobs
    // in the module have been created.
    const module = await this.getModule(moduleId);
    if (module && module.jobs) {
      // Add a wildcard at the front of each of the job IDs in the module,
      // as a prefix may have been supplied when creating the jobs in the module.
      const jobIds = module.jobs.map((job) => `*${job.id}`);
      const jobInfo = await this._jobsService.jobsExist(jobIds);

      // Check if the value for any of the jobs is false.
      const doJobsExist = Object.values(jobInfo).every((j) => j.exists === true);
      results.jobsExist = doJobsExist;

      if (doJobsExist === true) {
        // Get the IDs of the jobs created from the module, and their earliest / latest timestamps.
        const body = await this._mlClient.getJobStats({
          job_id: jobIds.join(),
        });
        const jobStatsJobs: JobStat[] = [];
        if (body.jobs && body.jobs.length > 0) {
          const foundJobIds = body.jobs.map((job) => job.job_id);
          const latestBucketTimestampsByJob =
            await this._resultsService.getLatestBucketTimestampByJob(foundJobIds);

          body.jobs.forEach((job) => {
            const jobStat = {
              id: job.job_id,
            } as JobStat;

            if (job.data_counts) {
              jobStat.earliestTimestampMs = job.data_counts.earliest_record_timestamp!;
              jobStat.latestTimestampMs = job.data_counts.latest_record_timestamp!;
              jobStat.latestResultsTimestampMs = getLatestDataOrBucketTimestamp(
                jobStat.latestTimestampMs,
                latestBucketTimestampsByJob[job.job_id] as number
              );
            }
            jobStatsJobs.push(jobStat);
          });
        }
        results.jobs = jobStatsJobs;
      }
    }

    return results;
  }

  // returns a id based on a data view name
  private async _getIndexPatternId(name: string): Promise<string | undefined> {
    try {
      const dataViews = await this._dataViewsService.findLazy(name);
      return dataViews.find((d) => d.getIndexPattern() === name)?.id;
    } catch (error) {
      mlLog.warn(`Error loading data views, ${error}`);
      return;
    }
  }

  // create a list of objects which are used to save the savedObjects.
  // each has an exists flag and those which do not already exist
  // contain a savedObject object which is sent to the server to save
  private async _createSavedObjectsToSave(moduleConfig: Module) {
    // first check if the saved objects already exist.
    const savedObjectExistResults = await this._checkIfSavedObjectsExist(moduleConfig.kibana);
    // loop through the kibanaSaveResults and update
    Object.keys(moduleConfig.kibana).forEach((type) => {
      // type e.g. dashboard, search ,visualization
      moduleConfig.kibana[type]!.forEach((configItem) => {
        const existsResult = savedObjectExistResults.find((o) => o.id === configItem.id);
        if (existsResult !== undefined) {
          configItem.exists = existsResult.exists;
          if (existsResult.exists === false) {
            // if this object doesn't already exist, create the savedObject
            // which will be used to create it
            existsResult.savedObject = {
              type,
              id: configItem.id,
              attributes: configItem.config,
            };
          }
        }
      });
    });
    return savedObjectExistResults;
  }

  // update the exists flags in the kibana results
  private _updateKibanaResults(
    kibanaSaveResults: DataRecognizerConfigResponse['kibana'],
    objectExistResults: ObjectExistResult[]
  ) {
    (Object.keys(kibanaSaveResults) as Array<keyof DataRecognizerConfigResponse['kibana']>).forEach(
      (type) => {
        kibanaSaveResults[type].forEach((resultItem) => {
          const i = objectExistResults.find((o) => o.id === resultItem.id && o.type === type);
          resultItem.exists = i !== undefined && i.exists;
        });
      }
    );
  }

  // add an error object to every kibana saved object,
  // if it doesn't already exist.
  private _populateKibanaResultErrors(
    kibanaSaveResults: DataRecognizerConfigResponse['kibana'],
    error: any
  ) {
    const errorObj =
      error === undefined ? { message: 'Unknown error when creating saved object' } : error;
    (Object.keys(kibanaSaveResults) as Array<keyof DataRecognizerConfigResponse['kibana']>).forEach(
      (type) => {
        kibanaSaveResults[type].forEach((resultItem) => {
          if (resultItem.exists === false) {
            resultItem.error = errorObj;
          }
        });
      }
    );
  }

  // loop through each type (dashboard, search, visualization)
  // load existing savedObjects for each type and compare to find out if
  // items with the same id already exist.
  // returns a flat list of objects with exists flags set
  private async _checkIfSavedObjectsExist(
    kibanaObjects: KibanaObjects
  ): Promise<ObjectExistResponse[]> {
    const types = Object.keys(kibanaObjects);
    const results: ObjectExistResponse[][] = await Promise.all(
      types.map(async (type) => {
        const existingObjects = await this._loadExistingSavedObjects(type);
        return kibanaObjects[type]!.map((obj) => {
          const existingObject = existingObjects.saved_objects.find(
            (o) => o.attributes && o.attributes.title === obj.title
          );
          return {
            id: obj.id,
            type,
            exists: existingObject !== undefined,
          };
        });
      })
    );
    // merge all results
    return ([] as ObjectExistResponse[]).concat(...results);
  }

  // find all existing savedObjects for a given type
  private _loadExistingSavedObjects(type: string) {
    // TODO: define saved object type
    return this._savedObjectsClient.find<any>({ type, perPage: 1000 });
  }

  // save the savedObjects if they do not exist already
  private async _saveKibanaObjects(objectExistResults: ObjectExistResponse[]) {
    let results = { saved_objects: [] as any[] };
    const filteredSavedObjects = objectExistResults
      .filter((o) => o.exists === false)
      .map((o) => o.savedObject!);
    if (filteredSavedObjects.length) {
      results = await this._savedObjectsClient.bulkCreate(
        // Add an empty typeMigrationVersion attribute to each saved object to ensure
        // it is automatically migrated to the 7.0+ format with a references attribute.
        filteredSavedObjects.map((doc) => ({
          ...doc,
          typeMigrationVersion: '',
        }))
      );
    }
    return results.saved_objects;
  }

  // save the jobs.
  // if any fail (e.g. it already exists), catch the error and mark the result
  // as success: false
  private async _saveJobs(
    jobs: ModuleJob[],
    applyToAllSpaces: boolean = false
  ): Promise<JobResponse[]> {
    const resp = await Promise.all(
      jobs.map(async (job) => {
        const jobId = job.id;
        try {
          job.id = jobId;
          await this._saveJob(job);
          return { id: jobId, success: true };
        } catch ({ body }) {
          return { id: jobId, success: false, error: body };
        }
      })
    );
    if (applyToAllSpaces === true) {
      const canCreateGlobalJobs = await this._mlSavedObjectService.canCreateGlobalMlSavedObjects(
        this._request,
        'anomaly-detector'
      );
      if (canCreateGlobalJobs === true) {
        await this._mlSavedObjectService.updateJobsSpaces(
          'anomaly-detector',
          jobs.map((j) => j.id),
          ['*'], // spacesToAdd
          [] // spacesToRemove
        );
      }
    }
    return resp;
  }

  private async _saveJob(job: ModuleJob) {
    return this._mlClient.putJob({ job_id: job.id, ...job.config });
  }

  // save the datafeeds.
  // if any fail (e.g. it already exists), catch the error and mark the result
  // as success: false
  private async _saveDatafeeds(datafeeds: ModuleDatafeed[]) {
    return await Promise.all(
      datafeeds.map(async (datafeed) => {
        try {
          await this._saveDatafeed(datafeed);
          return {
            id: datafeed.id,
            success: true,
            started: false,
            awaitingMlNodeAllocation: false,
          };
        } catch ({ body }) {
          return {
            id: datafeed.id,
            success: false,
            started: false,
            awaitingMlNodeAllocation: false,
            error: body,
          };
        }
      })
    );
  }

  private async _saveDatafeed(datafeed: ModuleDatafeed) {
    return this._mlClient.putDatafeed({
      datafeed_id: datafeed.id,
      ...datafeed.config,
    });
  }

  private async _startDatafeeds(
    datafeeds: ModuleDatafeed[],
    start?: number,
    end?: number
  ): Promise<{ [key: string]: DatafeedResponse }> {
    const results = Object.create(null) as { [key: string]: DatafeedResponse };
    for (const datafeed of datafeeds) {
      results[datafeed.id] = await this._startDatafeed(datafeed, start, end);
    }
    return results;
  }

  private async _startDatafeed(
    datafeed: ModuleDatafeed,
    start: number | undefined,
    end: number | undefined
  ): Promise<DatafeedResponse> {
    const result = { started: false } as DatafeedResponse;
    let opened = false;
    try {
      const body = await this._mlClient.openJob({
        job_id: datafeed.config.job_id,
      });
      opened = body.opened;
    } catch (error) {
      // if the job is already open, a 409 will be returned.
      if (error.statusCode === 409) {
        opened = true;
      } else {
        opened = false;
        result.started = false;
        result.error = error.body;
      }
    }
    if (opened) {
      try {
        const duration: { start: string; end?: string } = { start: '0' };
        if (start !== undefined) {
          duration.start = String(start);
        }
        if (end !== undefined) {
          duration.end = String(end);
        }

        const { started, node } = await this._mlClient.startDatafeed({
          datafeed_id: datafeed.id,
          ...duration,
        });

        result.started = started;
        result.awaitingMlNodeAllocation = node?.length === 0;
      } catch ({ body }) {
        result.started = false;
        result.error = body;
      }
    }
    return result;
  }

  // merge all of the save results into one result object
  // which is returned from the endpoint
  private async _updateResults(results: DataRecognizerConfigResponse, saveResults: SaveResults) {
    // update job results
    results.jobs.forEach((j) => {
      saveResults.jobs.forEach((j2) => {
        if (j.id === j2.id) {
          j.success = j2.success;
          if (j2.error !== undefined) {
            j.error = j2.error;
          }
        }
      });
    });

    // update datafeed results
    results.datafeeds.forEach((d) => {
      saveResults.datafeeds.forEach((d2) => {
        if (d.id === d2.id) {
          d.success = d2.success;
          d.started = d2.started;
          d.awaitingMlNodeAllocation = d2.awaitingMlNodeAllocation;
          if (d2.error !== undefined) {
            d.error = d2.error;
          }
        }
      });
    });

    // update savedObjects results
    (Object.keys(results.kibana) as Array<keyof DataRecognizerConfigResponse['kibana']>).forEach(
      (category) => {
        results.kibana[category].forEach((item) => {
          const result = saveResults.savedObjects.find((o) => o.id === item.id);
          if (result !== undefined) {
            item.exists = result.exists;

            if (result.error === undefined) {
              item.success = true;
            } else {
              item.success = false;
              item.error = result.error;
            }
          }
        });
      }
    );
  }

  // creates an empty results object,
  // listing each job/datafeed/savedObject with a save success boolean
  private _createResultsTemplate(moduleConfig: Module): DataRecognizerConfigResponse {
    const results: DataRecognizerConfigResponse = Object.create(
      null
    ) as DataRecognizerConfigResponse;
    const reducedConfig = {
      jobs: moduleConfig.jobs,
      datafeeds: moduleConfig.datafeeds,
      kibana: moduleConfig.kibana,
    };

    function createResultsItems(
      configItems: any[],
      resultItems: any,
      index: string | number
    ): void {
      resultItems[index] = [];
      configItems.forEach((j) => {
        resultItems[index].push({
          id: j.id,
          success: false,
        });
      });
    }

    (Object.keys(reducedConfig) as Array<keyof typeof reducedConfig>).forEach((i) => {
      if (Array.isArray(reducedConfig[i])) {
        createResultsItems(reducedConfig[i] as any[], results, i);
      } else {
        results[i] = Object.create(null);
        Object.keys(reducedConfig[i]).forEach((k) => {
          createResultsItems((reducedConfig[i] as Module['kibana'])[k] as any[], results[i], k);
        });
      }
    });

    return results;
  }

  // if an override index pattern has been specified,
  // update all of the datafeeds.
  private _updateDatafeedIndices(moduleConfig: Module) {
    // if the supplied index pattern contains a comma, split into multiple indices and
    // add each one to the datafeed
    const indexPatternNames = splitIndexPatternNames(this._indexPatternName);

    moduleConfig.datafeeds.forEach((df) => {
      const newIndices: string[] = [];
      // the datafeed can contain indexes and indices
      const currentIndices =
        df.config.indexes !== undefined ? df.config.indexes : df.config.indices;

      currentIndices.forEach((index) => {
        if (index === INDEX_PATTERN_NAME) {
          // the datafeed index is INDEX_PATTERN_NAME, so replace it with index pattern(s)
          // supplied by the user or the default one from the manifest
          newIndices.push(...indexPatternNames);
        } else {
          // otherwise keep using the index from the datafeed json
          newIndices.push(index);
        }
      });

      // just in case indexes was used, delete it in favour of indices
      delete df.config.indexes;
      df.config.indices = newIndices;
    });
  }

  // loop through the custom urls in each job and replace the INDEX_PATTERN_ID
  // marker for the id of the specified index pattern
  private _updateJobUrlIndexPatterns(moduleConfig: Module) {
    if (Array.isArray(moduleConfig.jobs)) {
      moduleConfig.jobs.forEach((job) => {
        // if the job has custom_urls
        if (job.config.custom_settings && job.config.custom_settings.custom_urls) {
          // loop through each url, replacing the INDEX_PATTERN_ID marker
          job.config.custom_settings.custom_urls.forEach((cUrl: any) => {
            const url = cUrl.url_value;
            if (url.match(INDEX_PATTERN_ID)) {
              const newUrl = url.replace(
                new RegExp(INDEX_PATTERN_ID, 'g'),
                this._indexPatternId as string
              );
              // update the job's url
              cUrl.url_value = newUrl;
            }
          });
        }
      });
    }
  }

  // check the custom urls in the module's jobs to see if they contain INDEX_PATTERN_ID
  // which needs replacement
  private _doJobUrlsContainIndexPatternId(moduleConfig: Module) {
    if (Array.isArray(moduleConfig.jobs)) {
      for (const job of moduleConfig.jobs) {
        // if the job has custom_urls
        if (job.config.custom_settings && job.config.custom_settings.custom_urls) {
          for (const cUrl of job.config.custom_settings.custom_urls) {
            if (cUrl.url_value.match(INDEX_PATTERN_ID)) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  // loop through each kibana saved object and replace any INDEX_PATTERN_ID and
  // INDEX_PATTERN_NAME markers for the id or name of the specified index pattern
  private _updateSavedObjectIndexPatterns(moduleConfig: Module) {
    if (moduleConfig.kibana) {
      Object.keys(moduleConfig.kibana).forEach((category) => {
        moduleConfig.kibana[category]!.forEach((item) => {
          let jsonString = item.config.kibanaSavedObjectMeta!.searchSourceJSON;
          if (jsonString.match(INDEX_PATTERN_ID)) {
            jsonString = jsonString.replace(
              new RegExp(INDEX_PATTERN_ID, 'g'),
              this._indexPatternId as string
            );
            item.config.kibanaSavedObjectMeta!.searchSourceJSON = jsonString;
          }

          if (category === SAVED_OBJECT_TYPES.VISUALIZATION) {
            // Look for any INDEX_PATTERN_NAME tokens in visualization visState,
            // as e.g. Vega visualizations reference the Elasticsearch index pattern directly.
            let visStateString = String(item.config.visState);
            if (visStateString !== undefined && visStateString.match(INDEX_PATTERN_NAME)) {
              visStateString = visStateString.replace(
                new RegExp(INDEX_PATTERN_NAME, 'g'),
                this._indexPatternName
              );
              item.config.visState = visStateString;
            }
          }
        });
      });
    }
  }

  /**
   * Provides a time range of the last 3 months of data
   */
  private async _getFallbackTimeRange(
    timeField: string,
    query?: any
  ): Promise<{ start: number; end: number }> {
    const fieldsService = fieldsServiceProvider(this._client);

    const timeFieldRange = await fieldsService.getTimeFieldRange(
      this._indexPatternName,
      timeField,
      query
    );

    return {
      start: timeFieldRange.end - moment.duration(3, 'months').asMilliseconds(),
      end: timeFieldRange.end,
    };
  }

  /**
   * Ensure the model memory limit for each job is not greater than
   * the max model memory setting for the cluster
   */
  private async _updateModelMemoryLimits(
    moduleConfig: Module,
    estimateMML?: boolean,
    start?: number,
    end?: number
  ) {
    if (!Array.isArray(moduleConfig.jobs)) {
      return;
    }

    if (estimateMML !== false && this._jobsForModelMemoryEstimation.length > 0) {
      try {
        // Checks if all jobs in the module have the same time field configured
        const firstJobTimeField =
          this._jobsForModelMemoryEstimation[0].job.config.data_description.time_field!;
        const isSameTimeFields = this._jobsForModelMemoryEstimation.every(
          ({ job }) => job.config.data_description.time_field === firstJobTimeField
        );

        if (isSameTimeFields && (start === undefined || end === undefined)) {
          // In case of time range is not provided and the time field is the same
          // set the fallback range for all jobs
          // as there may not be a common query, we use a match_all
          const { start: fallbackStart, end: fallbackEnd } = await this._getFallbackTimeRange(
            firstJobTimeField,
            { match_all: {} }
          );
          start = fallbackStart;
          end = fallbackEnd;
        }

        for (const { job, query } of this._jobsForModelMemoryEstimation) {
          let earliestMs = start;
          let latestMs = end;
          if (earliestMs === undefined || latestMs === undefined) {
            const timeFieldRange = await this._getFallbackTimeRange(
              job.config.data_description.time_field!,
              query
            );
            earliestMs = timeFieldRange.start;
            latestMs = timeFieldRange.end;
          }

          const { modelMemoryLimit } = await this._calculateModelMemoryLimit(
            job.config.analysis_config,
            this._indexPatternName,
            query,
            job.config.data_description.time_field!,
            earliestMs,
            latestMs
          );

          const existingLimit = job.config.analysis_limits?.model_memory_limit;
          let shouldUseEstimate = false;

          if (!existingLimit || estimateMML === true) {
            // Use estimate if no existing limit or estimateMML is explicitly true
            shouldUseEstimate = true;
          } else if (estimateMML === undefined && existingLimit) {
            // Compare existing limit with estimate and use the larger one
            // @ts-expect-error numeral missing value
            const existingMMLBytes: number = numeral(existingLimit.toUpperCase()).value();
            // @ts-expect-error numeral missing value
            const estimateMMLBytes: number = numeral(modelMemoryLimit.toUpperCase()).value();
            shouldUseEstimate = estimateMMLBytes > existingMMLBytes;
          }

          if (shouldUseEstimate) {
            if (!job.config.analysis_limits) {
              job.config.analysis_limits = Object.create(null) as AnalysisLimits;
            }
            job.config.analysis_limits.model_memory_limit = modelMemoryLimit;
          }
        }
      } catch (error) {
        mlLog.warn(
          `Data recognizer could not estimate model memory limit ${JSON.stringify(error.body)}`
        );
      }
    }

    const { limits } = await this._mlClient.info();
    const maxMml = limits.max_model_memory_limit;

    if (!maxMml) {
      return;
    }

    // @ts-expect-error numeral missing value
    const maxBytes: number = numeral(maxMml.toUpperCase()).value();

    for (const job of moduleConfig.jobs) {
      const mml = job.config?.analysis_limits?.model_memory_limit;
      if (mml !== undefined) {
        // @ts-expect-error numeral missing value
        const mmlBytes: number = numeral(mml.toUpperCase()).value();
        if (mmlBytes > maxBytes) {
          // if the job's mml is over the max,
          // so set the jobs mml to be the max

          if (!job.config.analysis_limits) {
            job.config.analysis_limits = Object.create(null) as AnalysisLimits;
          }

          job.config.analysis_limits.model_memory_limit = maxMml;
        }
      }
    }
  }

  // check the kibana saved searches JSON in the module to see if they contain INDEX_PATTERN_ID
  // which needs replacement
  private _doSavedObjectsContainIndexPatternId(moduleConfig: Module) {
    if (moduleConfig.kibana) {
      for (const category of Object.keys(moduleConfig.kibana)) {
        for (const item of moduleConfig.kibana[category]!) {
          const jsonString = item.config.kibanaSavedObjectMeta!.searchSourceJSON;
          if (jsonString.match(INDEX_PATTERN_ID)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  public applyJobConfigOverrides(
    moduleConfig: Module,
    jobOverrides?: JobOverride | JobOverride[],
    jobPrefix = ''
  ) {
    if (jobOverrides === undefined || jobOverrides === null) {
      return;
    }

    if (typeof jobOverrides !== 'object') {
      throw Boom.badRequest(
        `Incompatible jobOverrides type (${typeof jobOverrides}). It needs to be an object or array of objects.`
      );
    }

    // jobOverrides could be a single object or an array of objects.
    // if single, convert to an array
    const overrides = Array.isArray(jobOverrides) ? jobOverrides : [jobOverrides];
    const { jobs } = moduleConfig;

    // separate all the overrides.
    // the overrides which don't contain a job id will be applied to all jobs in the module
    const generalOverrides: GeneralJobsOverride[] = [];
    const jobSpecificOverrides: JobSpecificOverride[] = [];

    overrides.forEach((override) => {
      if (isGeneralJobOverride(override)) {
        generalOverrides.push(override);
      } else {
        jobSpecificOverrides.push(override);
      }
    });

    if (generalOverrides.some((override) => !!override.analysis_limits?.model_memory_limit)) {
      this._jobsForModelMemoryEstimation = [];
    } else {
      this._jobsForModelMemoryEstimation = moduleConfig.jobs
        .filter((job) => {
          const override = jobSpecificOverrides.find((o) => `${jobPrefix}${o.job_id}` === job.id);
          return override?.analysis_limits?.model_memory_limit === undefined;
        })
        .map((job) => ({
          job,
          query:
            moduleConfig.datafeeds.find((d) => d.config.job_id === job.id)?.config.query || null,
        }));
    }

    function processArrayValues(source: any, update: any) {
      if (typeof source !== 'object' || typeof update !== 'object') {
        return;
      }

      Object.keys(source).forEach((key) => {
        const sourceValue = source[key];
        const updateValue = update[key];

        if (
          typeof sourceValue !== 'object' ||
          sourceValue === null ||
          typeof updateValue !== 'object' ||
          updateValue === null
        ) {
          return;
        }

        if (Array.isArray(sourceValue) && Array.isArray(updateValue)) {
          source[key] = updateValue;
        } else {
          processArrayValues(sourceValue, updateValue);
        }
      });
    }

    generalOverrides.forEach((generalOverride) => {
      jobs.forEach((job) => {
        merge(job.config, generalOverride);
        processArrayValues(job.config, generalOverride);
      });
    });

    jobSpecificOverrides.forEach((jobSpecificOverride) => {
      // for each override, find the relevant job.
      // note, the job id already has the prefix prepended to it
      const job = jobs.find((j) => j.id === `${jobPrefix}${jobSpecificOverride.job_id}`);
      if (job !== undefined) {
        // delete the job_id in the override as this shouldn't be overridden
        // @ts-expect-error missing job_id
        delete jobSpecificOverride.job_id;
        merge(job.config, jobSpecificOverride);
        processArrayValues(job.config, jobSpecificOverride);
      }
    });
  }

  public applyDatafeedConfigOverrides(
    moduleConfig: Module,
    datafeedOverrides?: DatafeedOverride | DatafeedOverride[],
    jobPrefix = ''
  ) {
    if (datafeedOverrides !== undefined && datafeedOverrides !== null) {
      if (typeof datafeedOverrides !== 'object') {
        throw Boom.badRequest(
          `Incompatible datafeedOverrides type (${typeof datafeedOverrides}). It needs to be an object or array of objects.`
        );
      }

      // jobOverrides could be a single object or an array of objects.
      // if single, convert to an array
      const overrides = Array.isArray(datafeedOverrides) ? datafeedOverrides : [datafeedOverrides];
      const { datafeeds } = moduleConfig;

      // for some items in the datafeed, we should not merge.
      // we should instead use the whole override object
      function overwriteObjects(source: ModuleDatafeed['config'], update: DatafeedOverride) {
        Object.entries(update).forEach(([key, val]) => {
          if (typeof val === 'object') {
            switch (key) {
              case 'query':
              case 'aggregations':
              case 'aggs':
              case 'script_fields':
                source[key] = val as any;
                break;
              default:
                break;
            }
          }
        });
      }

      // separate all the overrides.
      // the overrides which don't contain a datafeed id or a job id will be applied to all jobs in the module
      const generalOverrides: GeneralDatafeedsOverride[] = [];
      const datafeedSpecificOverrides: DatafeedOverride[] = [];
      overrides.forEach((o) => {
        if (o.datafeed_id === undefined && o.job_id === undefined) {
          generalOverrides.push(o);
        } else {
          datafeedSpecificOverrides.push(o);
        }
      });

      generalOverrides.forEach((o) => {
        datafeeds.forEach(({ config }) => {
          merge(config, o);
          overwriteObjects(config, o);
        });
      });

      // collect all the overrides which contain either a job id or a datafeed id
      datafeedSpecificOverrides.forEach((o) => {
        // either a job id or datafeed id has been specified, so create a new id
        // containing either one plus the prefix
        const tempId: string = String(o.datafeed_id !== undefined ? o.datafeed_id : o.job_id);
        const dId = prefixDatafeedId(tempId, jobPrefix);

        const datafeed = datafeeds.find((d) => d.id === dId);
        if (datafeed !== undefined) {
          delete o.job_id;
          delete o.datafeed_id;
          merge(datafeed.config, o);
          overwriteObjects(datafeed.config, o);
        }
      });
    }
  }
}

export function dataRecognizerFactory(
  client: IScopedClusterClient,
  mlClient: MlClient,
  savedObjectsClient: SavedObjectsClientContract,
  dataViewsService: DataViewsService,
  mlSavedObjectService: MLSavedObjectService,
  request: KibanaRequest,
  compatibleModuleType: CompatibleModule | null,
  serverless: ServerlessInfo
) {
  return new DataRecognizer(
    client,
    mlClient,
    savedObjectsClient,
    dataViewsService,
    mlSavedObjectService,
    request,
    compatibleModuleType,
    serverless
  );
}

/**
 * Filters an array of modules based on the provided tag filters
 *
 * @param configs - The array of module config objects to filter.
 * @param compatibleModuleType - The CompatibleModule type to filter by, or null to include all modules. The compatibleModuleType is provided by the kibana yml config.
 * @param moduleTagFilters - An array of module tags to filter by. Only modules that have at least one matching tag will be included. The moduleTagFilters are provided as a query parameter to the endpoint.
 * @returns An array of module Config objects that match the provided criteria.
 */
export function filterConfigs(
  configs: Config[],
  compatibleModuleType: CompatibleModule | null,
  moduleTagFilters: string[]
) {
  let filteredConfigs: Config[] = [];
  if (compatibleModuleType === null && moduleTagFilters.length === 0) {
    filteredConfigs = configs;
  } else {
    const filteredForCompatibleModule =
      compatibleModuleType === null
        ? configs
        : configs.filter(({ module }) => {
            if (module.tags === undefined || module.tags.length === 0) {
              // if the module has no tags, it is compatible with all serverless projects
              return true;
            }
            return module.tags.includes(compatibleModuleType!);
          });
    const filteredForModuleTags =
      moduleTagFilters.length === 0
        ? filteredForCompatibleModule
        : filteredForCompatibleModule.filter(({ module }) => {
            if (module.tags === undefined || module.tags.length === 0) {
              // a tag filter has been specified when calling the endpoint therefore
              // if the module has no tags, it should be filtered out from the results
              return false;
            }
            return intersection(module.tags, moduleTagFilters).length > 0;
          });
    filteredConfigs = filteredForModuleTags;
  }
  return filteredConfigs;
}
