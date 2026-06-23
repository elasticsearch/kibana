/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useStartServices } from '../../../hooks/use_core';
import { epmRouteService } from '../../../services';
import type {
  PackageSpecIcon,
  PackageSpecScreenshot,
  RegistryImage,
} from '../../../../common/types';

const removeRelativePath = (relativePath: string): string =>
  new URL(relativePath, 'http://example.com').pathname;

export function useLinks() {
  const { http } = useStartServices();
  return {
    toSharedAssets: (path: string) => http.basePath.prepend(`/plugins/kibanaReact/assets/${path}`),
    toPackageImage: (
      img: PackageSpecIcon | PackageSpecScreenshot | RegistryImage,
      pkgName: string,
      pkgVersion: string
    ): string | undefined => {
      if (!img) return undefined;
      const sourcePath = img.src
        ? `/package/${pkgName}/${pkgVersion}${img.src}`
        : 'path' in img && img.path;
      if (sourcePath) {
        const filePath = epmRouteService.getFilePath(sourcePath);
        return http.basePath.prepend(filePath);
      }
    },
    toRelativeImage: ({
      path,
      packageName,
      version,
    }: {
      path: string;
      packageName: string;
      version: string;
    }) => {
      const imagePath = removeRelativePath(path);

      const filePath = `${epmRouteService.getInfoPath(packageName, version)}${imagePath}`;
      return http.basePath.prepend(filePath);
    },
  };
}
