/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import * as Rx from 'rxjs';
import Pw from '@parcel/watcher';
import { REPO_ROOT } from '@kbn/repo-info';
import { RepoSourceClassifier } from '@kbn/repo-source-classifier';
import { ImportResolver } from '@kbn/import-resolver';
import { makeMatcher } from '@kbn/picomatcher';

import { Log } from './log';

const packageMatcher = makeMatcher([
  '**/*',
  '!**/.*',
  '!x-pack/platform/plugins/shared/screenshotting/chromium/**',
  '!x-pack/platform/plugins/private/canvas/shareable_runtime/**',
]);

/**
 * Any code that is outside of a package must match this in order to trigger a restart
 */
const nonPackageMatcher = makeMatcher(['config/**/*.yml', 'plugins/**/server/**/*']);
const staticFileMatcher = makeMatcher(['plugins/**/kibana.json']);

export interface Options {
  enabled: boolean;
  log: Log;
  repoRoot: string;
}

export class Watcher {
  public readonly enabled: boolean;

  private readonly log: Log;
  private readonly repoRoot: string;
  private readonly classifier: RepoSourceClassifier;
  private readonly restart$ = new Rx.Subject<void>();
  private readonly resolver: ImportResolver;

  constructor(options: Options) {
    this.enabled = !!options.enabled;
    this.log = options.log;
    this.repoRoot = options.repoRoot;
    this.resolver = ImportResolver.create(REPO_ROOT);
    this.classifier = new RepoSourceClassifier(this.resolver);
  }

  run$ = new Rx.Observable((subscriber) => {
    if (!this.enabled) {
      this.restart$.complete();
      subscriber.complete();
      return;
    }

    const fire = (repoRel: string) => {
      this.log.warn(`restarting server`, `due to changes in ${repoRel}`);
      this.restart$.next();
    };

    Pw.subscribe(
      this.repoRoot,
      (error, events) => {
        if (error) {
          // NOTE: This error happens as a result of handling kFSEventStreamEventFlagMustScanSubDirs
          // which is delivered by macOS if there are too many events and some of them have been dropped, either
          // by the kernel or the user-space client. The application must assume that all files could have been
          // modified, and ignore the cache in this case.
          //
          // This happens mainly when switching branches, running a package manager, or otherwise changing a lot of
          // files at once. This results of a new handling introduced in parcel v2.5.1
          //
          // For now we are ignoring it and following the previous behaviour in place, if it does cause problems we can
          // force restart the server
          //
          // Parcel PR: https://github.com/parcel-bundler/watcher/pull/196
          if (
            error.message &&
            error.message.includes('Events were dropped by the FSEvents client')
          ) {
            return false;
          }

          // Other runtime errors should still fail
          subscriber.error(error);
          return;
        }

        for (const event of events) {
          const pkg = this.resolver.getPackageManifestForPath(event.path);

          // ignore changes in any devOnly package, these can't power the server so we can ignore them
          if (pkg?.devOnly) {
            return pkg.id === '@kbn/swc-register';
          }

          const result = this.classifier.classify(event.path);
          if (result.type === 'common package' || result.type === 'server package') {
            return packageMatcher(result.repoRel) && fire(result.repoRel);
          }

          if (result.type === 'non-package') {
            return nonPackageMatcher(result.repoRel) && fire(result.repoRel);
          }

          if (result.type === 'static') {
            return staticFileMatcher(result.repoRel) && fire(result.repoRel);
          }
        }
      },
      {
        // some basic high-level ignore statements. Additional filtering is done above
        // before paths are passed to `fire()`, using the RepoSourceClassifier mostly
        ignore: [
          '**/{node_modules,target,public,coverage,__*__,build,.chromium,.es,.yarn-local-mirror,.pnpm-store,.git,.github,.buildkite,.vscode,.idea}/**',
          '**/{bazel-bin,bazel-kibana,bazel-out,bazel-testlogs}/**',
          '**/{.cache,.temp,.tmp,temp,tmp}/**',
          '**/*.{test,spec,story,stories}.*',
          '**/*.{http,md,sh,txt,log,pid,swp,swo}',
          '**/*~',
          '**/.DS_Store',
          '/data/**',
        ],
      }
    ).then(
      (sub) => {
        this.log.good('watching server files for changes');
        subscriber.add(() => {
          sub.unsubscribe();
        });
      },
      (error) => {
        subscriber.error(error);
      }
    );

    // complete state subjects when run$ completes
    subscriber.add(() => {
      this.restart$.complete();
    });
  });

  serverShouldRestart$() {
    return this.restart$.asObservable();
  }
}
