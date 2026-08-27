#!/usr/bin/env node
/**
 * Export every video that has a transcript to its markdown mirror.
 *
 * The pipeline writes these files as videos finish; this backfills the ones
 * that completed before it did, and rewrites the lot after a change to the
 * rendering. Safe to re-run — each video maps to one deterministic filename.
 *
 *   node scripts/export-md.mjs [--dry-run] [--dir <path>]
 */

import { registerHooks } from "node:module";
import { existsSync, statSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");

// Node runs the TypeScript sources directly (type stripping), but it does not
// read tsconfig: teach it the "@/" alias and extensionless imports the app uses.
const CANDIDATE_SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveSourcePath(specifier, parentURL) {
  let base;
  if (specifier.startsWith("@/")) {
    base = path.join(projectRoot, "src", specifier.slice(2));
  } else if (specifier.startsWith(".") && parentURL?.startsWith("file:")) {
    base = path.resolve(path.dirname(fileURLToPath(parentURL)), specifier);
  } else {
    return null;
  }

  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = base + suffix;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = resolveSourcePath(specifier, context.parentURL);
    if (resolved) {
      // No explicit format: Node infers it from the extension, which is what
      // routes .ts files through type stripping.
      return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

// config resolves the DB relative to cwd; anchor it to the project so the
// script works from anywhere.
process.env.TUBEREADER_DB_PATH ||= path.join(projectRoot, "data", "tubereader.db");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const dirIndex = args.indexOf("--dir");
if (dirIndex !== -1) {
  const dir = args[dirIndex + 1];
  if (!dir) {
    console.error("--dir needs a path");
    process.exit(1);
  }
  // config reads this at import time, so it must be set before the imports below.
  process.env.TUBEREADER_MD_DIR = path.resolve(dir);
}

const { db, schema } = await import("@/lib/db");
const { writeVideoMarkdown, markdownFilename } = await import(
  "@/lib/pipeline/export-md"
);
const { config } = await import("@/lib/config");

const videos = db.select().from(schema.videos).all();
const exportable = videos.filter((v) => v.transcript || v.formatted_transcript);

console.log(
  `${videos.length} videos, ${exportable.length} with a transcript → ${config.markdownDir}`
);

let written = 0;
let failed = 0;

for (const video of exportable) {
  if (dryRun) {
    console.log(`  would write ${markdownFilename(video)}`);
    written++;
    continue;
  }
  try {
    const target = writeVideoMarkdown(video);
    if (target) {
      written++;
      console.log(`  ${path.basename(target)}`);
    }
  } catch (err) {
    failed++;
    console.error(
      `  FAILED ${video.youtube_id}:`,
      err instanceof Error ? err.message : err
    );
  }
}

console.log(
  `${dryRun ? "would write" : "wrote"} ${written} file(s)` +
    (failed ? `, ${failed} failed` : "")
);
