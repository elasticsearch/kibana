---
navigation_title: "Package design"
description: "When and how to break up packages in the Kibana monorepo."
---

# Package design

## Breaking up packages

We are currently working to fully leverage change-based tasks across the repository and this functionality works best when the dependency tree is made of small packages focused around a single responsibility. Having said that, we do not think that contributors should break up their packages into single functions from day one; having 10k packages that contain a single function would also be a problem. Instead, breaking up packages over time will be a common practice used to address bottlenecks in the dependency tree and will be a valuable tool if build performance is being compromised.

### When should a package be broken-up into smaller packages?
The goal when designing your package should be to mainly ensure that it has a single responsibility, and that anyone depending on your package would reasonably need everything exposed by it. This is important for bundle sizes (the entire package will be loaded every time it is imported) and for change-based tasks (any time this package changes all dependent tasks will need to be run).
Packages should be broken into smaller packages if they have multiple responsibilities or serve as a collection of related things which usually won't be necessary at the same time.

### What is a package's "responsibility"? How do I know that my package has a single responsibility?
The "responsibilities" of a package are defined by the features, utilities, and components exposed by your package. If a developer tries to use your package, is it likely that they will use every part of it or just some of it? If most people would only need part of your package, then we would argue that your package has multiple responsibilities. At this point it is probably time to break up your package.

### How do we manage the transition from one package to many smaller packages?
When making a change like this, import statements that previously pointed to the now broken-up package need to be updated to point to the smaller packages, so we have written an ESLint rule called `@kbn/imports/exports_moved_packages` which allows contributors to define the exports previously available from one package as now being available from another package and leverage auto-fixing to migration all existing and new uses of this export to the proper package.
