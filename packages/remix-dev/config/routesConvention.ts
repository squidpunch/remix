import * as fs from "fs";
import * as path from "path";

import type { RouteManifest, DefineRouteFunction } from "./routes";
import { defineRoutes, createRouteId } from "./routes";

const routeModuleExts = [".js", ".jsx", ".ts", ".tsx"];

export function isRouteModuleFile(filename: string): boolean {
  return routeModuleExts.includes(path.extname(filename));
}

/**
 * Defines routes using the filesystem convention in `app/routes`. The rules are:
 *
 * - Route paths are derived from the file path. A `.` in the filename indicates
 *   a `/` in the URL (a "nested" URL, but no route nesting). A `$` in the
 *   filename indicates a dynamic URL segment.
 * - Subdirectories are used for nested routes.
 *
 * For example, a file named `app/routes/gists/$username.tsx` creates a route
 * with a path of `gists/:username`.
 */
export function defineConventionalRoutes(appDir: string): RouteManifest {
  let files: { [routeId: string]: string } = {};

  // First, find all route modules in app/routes
  visitFiles(path.join(appDir, "routes"), file => {
    let routeId = createRouteId(path.join("routes", file));

    if (isRouteModuleFile(file)) {
      files[routeId] = path.join("routes", file);
    } else {
      throw new Error(
        `Invalid route module file: ${path.join(appDir, "routes", file)}`
      );
    }
  });

  let routeIds = Object.keys(files).sort(byLongestFirst);

  // Then, recurse through all routes using the public defineRoutes() API
  function defineNestedRoutes(
    defineRoute: DefineRouteFunction,
    parentId?: string
  ): void {
    let childRouteIds = routeIds.filter(
      id => findParentRouteId(routeIds, id) === parentId
    );

    for (let routeId of childRouteIds) {
      let routePath =
        routeId === "routes/404"
          ? "*"
          : createRoutePath(routeId.slice((parentId || "routes").length + 1));

      defineRoute(routePath, files[routeId], () => {
        defineNestedRoutes(defineRoute, routeId);
      });
    }
  }

  return defineRoutes(defineNestedRoutes);
}

function createRoutePath(routeId: string): string {
  let path = routeId.replace(/\$/g, ":").replace(/\./g, "/");
  return /\b\/?index$/.test(path) ? path.replace(/\/?index$/, "") : path;
}

function findParentRouteId(
  routeIds: string[],
  childRouteId: string
): string | undefined {
  return routeIds.find(id => childRouteId.startsWith(`${id}/`));
}

function byLongestFirst(a: string, b: string): number {
  return b.length - a.length;
}

function visitFiles(
  dir: string,
  visitor: (file: string) => void,
  baseDir = dir
): void {
  for (let filename of fs.readdirSync(dir)) {
    let file = path.resolve(dir, filename);
    let stat = fs.lstatSync(file);

    if (stat.isDirectory()) {
      visitFiles(file, visitor, baseDir);
    } else if (stat.isFile()) {
      visitor(path.relative(baseDir, file));
    }
  }
}