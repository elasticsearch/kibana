/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  AppDeepLinkId,
  ChromeNavLinks,
  ChromeBreadcrumb,
  ChromeSetProjectBreadcrumbsParams,
  ChromeNavLink,
  CloudURLs,
  NavigationCustomization,
  NavigationTreeDefinition,
  CloudLinks,
  SolutionId,
} from '@kbn/core-chrome-browser';
import {
  BehaviorSubject,
  Observable,
  combineLatest,
  map,
  takeUntil,
  ReplaySubject,
  skip,
  distinctUntilChanged,
  skipWhile,
  filter,
  of,
  switchMap,
  shareReplay,
  catchError,
} from 'rxjs';
import type { Location, History } from 'history';
import deepEqual from 'react-fast-compare';
import type { Logger } from '@kbn/logging';

import { findActiveNodes, stripQueryParams } from './utils';
import { buildBreadcrumbs } from './breadcrumbs';
import { getCloudLinks } from './cloud_links';
import { applyCustomization, type ParsedNavigation } from './apply_customization';

interface StartDeps {
  history: History;
  prependBasePath: (path: string) => string;
  navLinks: ChromeNavLinks;
  getUiSettingsHomeRoute: () => string | undefined;
  logger: Logger;
  chromeBreadcrumbs$: Observable<ChromeBreadcrumb[]>;
}

export class ProjectNavigationService {
  private readonly stop$ = new ReplaySubject<void>(1);
  private readonly customization$ = new BehaviorSubject<NavigationCustomization | undefined>(
    undefined
  );
  private readonly customizeNavigationHandler$ = new BehaviorSubject<(() => void) | null>(null);

  constructor(private isServerless: boolean) {}

  public start(startDeps: StartDeps) {
    const {
      chromeBreadcrumbs$,
      history,
      navLinks,
      logger,
      prependBasePath,
      getUiSettingsHomeRoute,
    } = startDeps;

    const currentNavSource$ = new BehaviorSubject<{
      id: SolutionId;
      navTreeDefinition$: Observable<NavigationTreeDefinition>;
    } | null>(null);
    const kibanaName$ = new BehaviorSubject<string | undefined>(undefined);
    const cloudLinks$ = new BehaviorSubject<CloudLinks>({});
    const projectBreadcrumbs$ = new BehaviorSubject<{
      breadcrumbs: ChromeBreadcrumb[];
      params: ChromeSetProjectBreadcrumbsParams;
    }>({ breadcrumbs: [], params: { absolute: false } });

    const location$ = new Observable<Location>((subscriber) => {
      subscriber.next(history.location);
      return history.listen((loc) => subscriber.next(loc));
    }).pipe(takeUntil(this.stop$), shareReplay(1));

    const deepLinksMap$ = navLinks.getNavLinks$().pipe(
      map((links) =>
        links.reduce((acc, navLink) => {
          acc[navLink.id] = navLink;
          return acc;
        }, {} as Record<string, ChromeNavLink>)
      )
    );

    // Core derived pipeline: nav source -> parsed tree (with deep link resolution)
    const parsedNavigation$: Observable<ParsedNavigation | null> = currentNavSource$.pipe(
      switchMap((source) => {
        if (!source) return of(null);
        return combineLatest([
          source.navTreeDefinition$,
          deepLinksMap$,
          cloudLinks$,
          this.customization$,
        ]).pipe(
          map(([def, deepLinks, links, customization]) =>
            applyCustomization(source.id, def, deepLinks, links, customization)
          ),
          catchError((err) => {
            logger.error(err);
            return of(null);
          })
        );
      }),
      takeUntil(this.stop$),
      shareReplay(1)
    );

    const navigation$ = combineLatest([parsedNavigation$, location$]).pipe(
      filter((args): args is [ParsedNavigation, Location] => args[0] !== null),
      map(([parsed, location]) => {
        const pathname = stripQueryParams(`${prependBasePath(location.pathname)}${location.hash}`);
        return {
          solutionId: parsed.id,
          navigationTree: parsed.treeUI,
          activeNodes: findActiveNodes(pathname, parsed.flattened, location, prependBasePath),
          overflowItemIds: parsed.overflowItemIds,
          defaultItemIds: parsed.defaultItemIds,
          renderableNodes: parsed.renderableNodes,
        };
      }),
      distinctUntilChanged(deepEqual),
      shareReplay(1)
    );

    const activeSolutionNavId$ = parsedNavigation$.pipe(
      map((p) => p?.id ?? null),
      distinctUntilChanged(),
      shareReplay(1)
    );

    // Reset custom breadcrumbs when the active navigation path changes
    navigation$
      .pipe(
        takeUntil(this.stop$),
        map((nav) => nav.activeNodes),
        skipWhile((nodes) => nodes.length === 0),
        distinctUntilChanged((prev, next) =>
          deepEqual(
            prev?.[0]?.map((n) => n.id),
            next?.[0]?.map((n) => n.id)
          )
        ),
        skip(1)
      )
      .subscribe(() => {
        projectBreadcrumbs$.next({ breadcrumbs: [], params: { absolute: false } });
      });

    return {
      getProjectHome$: () => {
        return parsedNavigation$.pipe(
          map((parsed) => {
            const defaultRoute = getUiSettingsHomeRoute();
            const navRoute = parsed?.tree.find((n) => n.renderAs === 'home')?.href;
            return defaultRoute ?? navRoute;
          }),
          filter((home): home is string => home !== undefined),
          distinctUntilChanged()
        );
      },
      setCloudUrls: (cloudUrls: CloudURLs) => {
        cloudLinks$.next(getCloudLinks(cloudUrls));
      },
      setKibanaName: (kibanaName: string) => {
        kibanaName$.next(kibanaName);
      },
      getKibanaName$: () => {
        return kibanaName$.asObservable();
      },
      initNavigation: <LinkId extends AppDeepLinkId = AppDeepLinkId>(
        id: SolutionId,
        navTreeDefinition$: Observable<NavigationTreeDefinition<LinkId>>
      ) => {
        if (currentNavSource$.getValue()?.id === id) return;
        // Customization has a single writer: the navigation plugin, which seeds
        // `customization$` from user-storage via setNavigationCustomization().
        currentNavSource$.next({
          id,
          navTreeDefinition$: navTreeDefinition$ as Observable<NavigationTreeDefinition>,
        });
      },
      getNavigation$: () => navigation$,
      setProjectBreadcrumbs: (
        breadcrumbs: ChromeBreadcrumb | ChromeBreadcrumb[],
        params?: Partial<ChromeSetProjectBreadcrumbsParams>
      ) => {
        projectBreadcrumbs$.next({
          breadcrumbs: Array.isArray(breadcrumbs) ? breadcrumbs : [breadcrumbs],
          params: { absolute: false, ...params },
        });
      },
      getProjectBreadcrumbs$: (): Observable<ChromeBreadcrumb[]> => {
        return combineLatest([
          projectBreadcrumbs$,
          navigation$,
          chromeBreadcrumbs$,
          kibanaName$,
          cloudLinks$,
        ]).pipe(
          map(([projectBreadcrumbs, nav, chromeBreadcrumbs, kibanaName, links]) => {
            return buildBreadcrumbs({
              kibanaName,
              projectBreadcrumbs,
              activeNodes: nav.activeNodes,
              chromeBreadcrumbs,
              cloudLinks: links,
              isServerless: this.isServerless,
            });
          })
        );
      },
      getActiveSolutionNavId$: () => activeSolutionNavId$,
      getActiveSolutionNavId: () => currentNavSource$.getValue()?.id ?? null,
      setNavigationCustomization: (customization: NavigationCustomization | undefined) =>
        this.customization$.next(customization),
      getCustomizeNavigationHandler$: () => this.customizeNavigationHandler$.asObservable(),
      registerCustomizeNavigationHandler: (handler: () => void) => {
        this.customizeNavigationHandler$.next(handler);
      },
    };
  }

  public stop() {
    this.stop$.next();
    this.stop$.complete();
  }
}
