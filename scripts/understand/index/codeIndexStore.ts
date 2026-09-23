import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CodeIndex } from "../model/codeIndex.ts";
import { writeJsonDocument } from "../model/jsonStore.ts";

const FILES = {
  manifest: "manifest.json",
  symbols: "symbols.json",
  relations: "relations.json",
  stateAccess: "stateAccess.json",
  entrypoints: "entrypoints.json",
  tests: "tests.json",
} as const;

export async function readCodeIndex(directory: string): Promise<CodeIndex | undefined> {
  const manifest = await readOptionalJson(join(directory, FILES.manifest));
  if (!manifest) return undefined;
  const [symbols, relations, stateAccess, entrypoints, tests] = await Promise.all(
    [FILES.symbols, FILES.relations, FILES.stateAccess, FILES.entrypoints, FILES.tests].map((file) =>
      readJson(join(directory, file)),
    ),
  );
  return {
    ...(manifest as Omit<CodeIndex, "symbols" | "relations" | "stateAccess" | "entrypoints" | "tests">),
    symbols,
    relations,
    stateAccess,
    entrypoints,
    tests,
  } as CodeIndex;
}

export async function writeCodeIndex(directory: string, index: CodeIndex) {
  const manifest = {
    schemaVersion: index.schemaVersion,
    generator: index.generator,
    root: index.root,
    files: index.files,
  };
  await writeJsonDocument(join(directory, FILES.manifest), manifest);
  await writeJsonDocument(join(directory, FILES.symbols), index.symbols);
  await writeJsonDocument(join(directory, FILES.relations), index.relations);
  await writeJsonDocument(join(directory, FILES.stateAccess), index.stateAccess);
  await writeJsonDocument(join(directory, FILES.entrypoints), index.entrypoints);
  await writeJsonDocument(join(directory, FILES.tests), index.tests);
  return directory;
}

async function readOptionalJson(file: string) {
  try {
    return await readJson(file);
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

async function readJson(file: string) {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

function isMissing(error: unknown) {
  return Boolean(error) && typeof error === "object" && (error as { code?: string }).code === "ENOENT";
}
