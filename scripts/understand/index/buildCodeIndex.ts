import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { CodeIndex, CodeRelation, CodeSymbol, FileFacts } from "../model/codeIndex.ts";
import { inspectSource } from "./inspectSource.ts";
import type { SourceLanguage } from "./parseSource.ts";

const SKIP_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "coverage",
  "vendor",
  "out",
  "build",
  ".git",
  ".productforge",
]);
const EXTENSIONS: [string, SourceLanguage][] = [
  [".tsx", "tsx"],
  [".ts", "typescript"],
  [".jsx", "jsx"],
  [".mjs", "javascript"],
  [".cjs", "javascript"],
  [".js", "javascript"],
];
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const MAX_FILE_BYTES = 400_000;

export async function buildCodeIndex(root: string, previous?: CodeIndex): Promise<CodeIndex> {
  const files = await collectFiles(root);
  const previousByPath = new Map((previous?.files ?? []).map((file) => [file.path, file.contentHash]));
  const kept = new Set<string>();
  const accepted: { path: string; language: SourceLanguage }[] = [];
  const facts: FileFacts[] = [];
  for (const file of files) {
    const source = await readFile(join(root, file.path), "utf8");
    if (Buffer.byteLength(source) > MAX_FILE_BYTES) continue;
    accepted.push(file);
    const contentHash = createHash("sha256").update(source).digest("hex");
    if (previous && previous.root === root && previousByPath.get(file.path) === contentHash) {
      kept.add(file.path);
      continue;
    }
    facts.push(await inspectSource(file.path, source, file.language, contentHash));
  }
  const index = mergeFacts(root, accepted, facts, previous, kept);
  linkRelations(index);
  return index;
}

async function collectFiles(root: string) {
  const files: { path: string; language: SourceLanguage }[] = [];
  await walk(root, root, files);
  files.sort((left, right) => left.path.localeCompare(right.path));
  return files;
}

async function walk(dir: string, root: string, files: { path: string; language: SourceLanguage }[]) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") || SKIP_DIRECTORIES.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, root, files);
      continue;
    }
    const language = languageOf(entry.name);
    if (!language) continue;
    files.push({ path: relative(root, fullPath).split(sep).join("/"), language });
  }
}

function languageOf(fileName: string): SourceLanguage | undefined {
  if (fileName.endsWith(".d.ts")) return undefined;
  return EXTENSIONS.find(([extension]) => fileName.endsWith(extension))?.[1];
}

function mergeFacts(
  root: string,
  files: { path: string; language: SourceLanguage }[],
  parsed: FileFacts[],
  previous: CodeIndex | undefined,
  kept: Set<string>,
): CodeIndex {
  const fileRecords = files.map((file) => {
    const parsedFile = parsed.find((item) => item.file.path === file.path);
    if (parsedFile) return parsedFile.file;
    return previous?.files.find((item) => item.path === file.path) ?? {
      path: file.path,
      language: file.language,
      contentHash: "",
    };
  });
  const reuse = <T extends { file?: string; sourceFile?: string; path?: string }>(items: T[] | undefined) => {
    return (items ?? []).filter((item) => kept.has(item.file ?? item.sourceFile ?? item.path ?? ""));
  };
  return {
    schemaVersion: 1,
    generator: "tree-sitter",
    root,
    files: fileRecords,
    symbols: [...reuse(previous?.symbols), ...parsed.flatMap((item) => item.symbols)],
    relations: [...reuse(previous?.relations), ...parsed.flatMap((item) => item.relations)],
    stateAccess: [...reuse(previous?.stateAccess), ...parsed.flatMap((item) => item.stateAccess)],
    entrypoints: [...reuse(previous?.entrypoints), ...parsed.flatMap((item) => item.entrypoints)],
    tests: [...reuse(previous?.tests), ...parsed.flatMap((item) => item.tests)],
  };
}

// yagni: identifier calls link through same-file names and relative imports.
// Revisit when a language service can resolve member calls and dependency injection.
function linkRelations(index: CodeIndex) {
  const files = new Set(index.files.map((file) => file.path));
  const symbolsByFile = new Map<string, CodeSymbol[]>();
  for (const symbol of index.symbols) {
    const list = symbolsByFile.get(symbol.file) ?? [];
    list.push(symbol);
    symbolsByFile.set(symbol.file, list);
  }
  for (const relation of index.relations) {
    if (relation.type !== "imports" || !relation.targetName.startsWith(".")) continue;
    const targetFile = resolveSpecifier(relation.sourceFile, relation.targetName, files);
    if (!targetFile) continue;
    relation.targetFile = targetFile;
    relation.resolution = "syntactic";
  }
  const importsByFile = new Map<string, CodeRelation[]>();
  for (const relation of index.relations) {
    if (relation.type !== "imports") continue;
    const list = importsByFile.get(relation.sourceFile) ?? [];
    list.push(relation);
    importsByFile.set(relation.sourceFile, list);
  }
  for (const relation of index.relations) {
    if (relation.type !== "calls" || relation.callShape !== "identifier") continue;
    const local = uniqueByName(symbolsByFile.get(relation.sourceFile) ?? [], relation.targetName);
    if (local) {
      relation.targetSymbolId = local.id;
      relation.resolution = "syntactic";
      continue;
    }
    const imported = (importsByFile.get(relation.sourceFile) ?? []).find((item) => item.localName === relation.targetName);
    if (!imported?.targetFile) continue;
    const target = uniqueByName(
      (symbolsByFile.get(imported.targetFile) ?? []).filter((symbol) => symbol.exported),
      imported.importedName === "default" ? "default" : imported.importedName ?? relation.targetName,
    );
    if (!target) continue;
    relation.targetSymbolId = target.id;
    relation.targetFile = imported.targetFile;
    relation.resolution = "syntactic";
  }
}

function uniqueByName(symbols: CodeSymbol[], name: string) {
  const matches = symbols.filter((symbol) => symbol.name === name);
  return matches.length === 1 ? matches[0] : undefined;
}

function resolveSpecifier(fromFile: string, specifier: string, files: Set<string>) {
  const base = normalizePath(joinPosix(dirnamePosix(fromFile), specifier));
  const candidates = [
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => `${base}/index${extension}`),
  ];
  return candidates.find((candidate) => files.has(candidate));
}

function joinPosix(left: string, right: string) {
  if (!left) return right;
  return `${left}/${right}`;
}

function dirnamePosix(file: string) {
  const index = file.lastIndexOf("/");
  return index === -1 ? "" : file.slice(0, index);
}

function normalizePath(file: string) {
  const parts: string[] = [];
  for (const part of file.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}
