#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { calculateArchitecture } from "./calculate/architecture.ts";
import { calculateSequence } from "./calculate/sequence.ts";
import { buildCodeIndex } from "./index/buildCodeIndex.ts";
import { readCodeIndex, writeCodeIndex } from "./index/codeIndexStore.ts";
import { buildEvidencePacket } from "./index/evidencePacket.ts";
import { validateView, type UnderstandView } from "./model/exploration.ts";
import {
  DEFAULT_INDEX_RELATIVE_PATH,
  DEFAULT_KNOWLEDGE_RELATIVE_PATH,
  DEFAULT_STORE_RELATIVE_PATH,
  DEFAULT_VIEW_RELATIVE_DIR,
  readWalkthrough,
  writeJsonDocument,
  writeWalkthrough,
} from "./model/jsonStore.ts";
import {
  applyKnowledgePatch,
  emptyKnowledge,
  validateKnowledge,
  validateKnowledgePatch,
  type Knowledge,
  type KnowledgePatch,
} from "./model/knowledge.ts";
import { projectKnowledgeToWalkthrough } from "./project/knowledgeToWalkthrough.ts";
import { renderArchitecture } from "./render/architecture.ts";
import { renderGuidePage } from "./render/page.ts";
import { renderSequence } from "./render/sequence.ts";
import { resolveFocusId } from "./scope/architecture.ts";
import {
  applyPatch,
  emptyWalkthrough,
  validatePatch,
  validateWalkthrough,
  type Walkthrough,
  type WalkthroughPatch,
} from "./model/walkthrough.ts";

const usage = `用法：
  node cli.ts index --root <dir> [--out .productforge/understand/index]
  node cli.ts packet --index <dir> --file <path> --symbol <name> [--line <n>]
  node cli.ts validate --input <snapshot.json|patch.json>
  node cli.ts save --input <snapshot.json> [--store <file.json>]
  node cli.ts apply --patch <patch.json> [--store <file.json>]
  node cli.ts render [--input <snapshot.json>] [--store <file.json>] [--view <view.json>] [--output <file.html>] [--open]
`;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  switch (options.command) {
    case "index":
      await runIndex(options);
      break;
    case "packet":
      await runPacket(options);
      break;
    case "validate":
      await runValidate(options);
      break;
    case "save":
      await runSave(options);
      break;
    case "apply":
      await runApply(options);
      break;
    case "render":
      await runRender(options);
      break;
    default:
      throw new Error(usage.trim());
  }
}

async function runIndex(options: { root?: string; out?: string }) {
  const root = requirePath(options.root, "--root");
  const out = resolveStore(options.out, DEFAULT_INDEX_RELATIVE_PATH);
  const previous = await readCodeIndex(out);
  const index = await buildCodeIndex(root, previous);
  await writeCodeIndex(out, index);
  process.stdout.write(`已索引 ${index.files.length} 个文件、${index.symbols.length} 个符号，写入 ${out}\n`);
}

async function runPacket(options: { index?: string; file?: string; symbol?: string; line?: string }) {
  const indexDir = requirePath(options.index, "--index");
  const file = options.file;
  const symbol = options.symbol;
  if (!file || !symbol) throw new Error(`缺少 --file 或 --symbol\n${usage}`);
  const index = await readCodeIndex(indexDir);
  if (!index) throw new Error(`找不到代码索引 ${indexDir}`);
  const line = options.line === undefined ? undefined : Number(options.line);
  if (options.line !== undefined && !Number.isInteger(line)) throw new Error("--line 必须是整数");
  const packet = await buildEvidencePacket(index, { file, name: symbol, line });
  process.stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
}

async function runValidate(options: { input?: string }) {
  const inputPath = requirePath(options.input, "--input");
  const value = await readJson(inputPath);
  const issues = issuesFor(value);
  if (issues.length > 0) throw new Error(`校验失败：\n- ${issues.join("\n- ")}`);
  process.stdout.write(`${inputPath} 校验通过\n`);
}

async function runSave(options: { input?: string; store?: string }) {
  const inputPath = requirePath(options.input, "--input");
  const value = await readJson(inputPath);
  const issues = issuesFor(value);
  if (issues.length > 0) throw new Error(`校验失败：\n- ${issues.join("\n- ")}`);
  if (isKnowledge(value)) {
    const storePath = resolveStore(options.store, DEFAULT_KNOWLEDGE_RELATIVE_PATH);
    await writeJsonDocument(storePath, value);
    process.stdout.write(`已写入 ${storePath}（revision ${value.revision}）\n`);
    return;
  }
  if (isView(value)) {
    const storePath = resolveStore(options.store, join(DEFAULT_VIEW_RELATIVE_DIR, `${value.id}.json`));
    await writeJsonDocument(storePath, value);
    process.stdout.write(`已写入 ${storePath}\n`);
    return;
  }
  const storePath = resolveStore(options.store, DEFAULT_STORE_RELATIVE_PATH);
  await writeWalkthrough(storePath, value as Walkthrough);
  process.stdout.write(`已写入 ${storePath}（revision ${(value as Walkthrough).revision}）\n`);
}

async function runApply(options: { patch?: string; store?: string }) {
  const patchPath = requirePath(options.patch, "--patch");
  const patch = await readJson(patchPath);
  if (isKnowledgePatch(patch)) {
    const storePath = resolveStore(options.store, DEFAULT_KNOWLEDGE_RELATIVE_PATH);
    const current = await readKnowledge(storePath);
    const next = applyKnowledgePatch(current, patch);
    await writeJsonDocument(storePath, next);
    process.stdout.write(`已写入 ${storePath}（revision ${next.revision}）\n`);
    return;
  }
  const storePath = resolveStore(options.store, DEFAULT_STORE_RELATIVE_PATH);
  const current = await readWalkthrough(storePath);
  const base = current.participants ? current : emptyWalkthrough();
  const next = applyPatch(base, patch as WalkthroughPatch);
  await writeWalkthrough(storePath, next);
  process.stdout.write(`已写入 ${storePath}（revision ${next.revision}）\n`);
}

async function runRender(options: { input?: string; store?: string; view?: string; output?: string; open?: boolean }) {
  const storePath = resolveStore(options.store, DEFAULT_STORE_RELATIVE_PATH);
  const sourcePath = options.input ? resolve(options.input) : storePath;
  const loaded = options.input ? await readJson(sourcePath) : await readWalkthrough(storePath);
  const issues = issuesFor(loaded);
  if (issues.length > 0) throw new Error(`校验失败：\n- ${issues.join("\n- ")}`);
  const walkthrough = isKnowledge(loaded) ? projectKnowledgeToWalkthrough(loaded) : (loaded as Walkthrough);
  const view = options.view ? ((await readJson(resolve(options.view))) as UnderstandView) : undefined;
  if (view) {
    const viewIssues = validateView(view);
    if (viewIssues.length > 0) throw new Error(`View 校验失败：\n- ${viewIssues.join("\n- ")}`);
  }

  const kinds = new Set((view?.slideSpecs ?? []).map((slide) => slide.kind));
  const filter = kinds.size > 0;
  const focusId = resolveFocusId(walkthrough);
  const requested =
    walkthrough.participants.length === 0 || (filter && !kinds.has("architecture"))
      ? []
      : focusId
        ? [
            { id: "architecture-overview", title: "架构概览", view: "overview" as const },
            { id: "architecture-detail", title: "架构展开", view: "detail" as const },
          ]
        : [{ id: "architecture-detail", title: "架构", view: "detail" as const }];
  const architectures = (
    await Promise.all(
      requested.map(async (item) => {
        const layout = await calculateArchitecture(walkthrough, { view: item.view });
        if (!layout) return null;
        return {
          id: item.id,
          title: item.title,
          svg: renderArchitecture(layout),
          lanes: (layout.lanes ?? []).map((lane: { title: string; slug: string }) => ({
            title: lane.title,
            slug: lane.slug,
          })),
        };
      }),
    )
  ).filter((item) => item !== null);
  const sequenceIds = new Set(
    (view?.slideSpecs ?? []).filter((slide) => slide.kind === "sequence").flatMap((slide) => slide.sourceIds),
  );
  const sequences = (filter && !kinds.has("sequence") ? [] : walkthrough.scenarios)
    .filter((scenario) => sequenceIds.size === 0 || sequenceIds.has(scenario.id))
    .map((scenario) => {
      const layout = calculateSequence(walkthrough, scenario);
      return { id: scenario.id, title: scenario.title, svg: renderSequence(layout) };
    });
  const guide = walkthrough.guide ? { ...walkthrough.guide } : undefined;
  if (guide && filter) {
    if (!kinds.has("summary")) {
      guide.conclusion = undefined;
      guide.userPaths = [];
      guide.rules = [];
    }
    if (!kinds.has("algorithm")) guide.algorithms = [];
    if (!kinds.has("state")) guide.state = undefined;
    if (!kinds.has("reading")) guide.reading = [];
  }
  const html = renderGuidePage({
    title: walkthrough.title ?? "代码导览",
    guide,
    architectures,
    sequences,
    slides: view?.slideSpecs.map((slide) => ({ kind: slide.kind, title: slide.title })),
    unresolved: view?.unresolvedQuestions,
  });
  const outputPath = resolve(options.output ?? defaultOutputPath(sourcePath));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, "utf8");
  process.stdout.write(`已生成 ${outputPath}\n`);
  if (options.open) await openFile(outputPath);
}

function parseArgs(argv: string[]) {
  const [command, ...rest] = argv;
  const options: {
    command?: string;
    open: boolean;
    input?: string;
    patch?: string;
    store?: string;
    output?: string;
    root?: string;
    out?: string;
    index?: string;
    file?: string;
    symbol?: string;
    line?: string;
    view?: string;
  } = { command, open: false };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--open") {
      options.open = true;
      continue;
    }
    const keys = {
      "--input": "input",
      "--patch": "patch",
      "--store": "store",
      "--output": "output",
      "--root": "root",
      "--out": "out",
      "--index": "index",
      "--file": "file",
      "--symbol": "symbol",
      "--line": "line",
      "--view": "view",
    } as const;
    const key = keys[token as keyof typeof keys];
    if (!key) throw new Error(`未知参数 ${token}\n${usage}`);
    const value = rest[index + 1];
    if (value === undefined) throw new Error(`缺少 ${token} 的值\n${usage}`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function requirePath(value: string | undefined, flag: string) {
  if (!value) throw new Error(`缺少 ${flag}\n${usage}`);
  return resolve(value);
}

function resolveStore(value: string | undefined, fallback: string) {
  if (!value) return resolve(fallback);
  return isAbsolute(value) ? value : resolve(value);
}

function defaultOutputPath(sourcePath: string) {
  return sourcePath.endsWith(".json")
    ? sourcePath.replace(/\.json$/u, ".html")
    : resolve(".productforge/understand/walkthrough.html");
}

async function readJson(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

function issuesFor(value: unknown) {
  if (isKnowledge(value)) return validateKnowledge(value);
  if (isView(value)) return validateView(value);
  if (isKnowledgePatch(value)) return validateKnowledgePatch(value);
  if (isPatch(value)) return validatePatch(value);
  return validateWalkthrough(value);
}

function isKnowledge(value: unknown): value is Knowledge {
  return isRecord(value) && value.schemaVersion === 2 && Array.isArray(value.evidence);
}

function isKnowledgePatch(value: unknown): value is KnowledgePatch {
  return isRecord(value) && value.schemaVersion === 2 && Array.isArray(value.operations);
}

function isView(value: unknown): value is UnderstandView {
  return isRecord(value) && Array.isArray(value.slideSpecs) && typeof value.scopeId === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readKnowledge(storePath: string): Promise<Knowledge> {
  try {
    const value = JSON.parse(await readFile(storePath, "utf8")) as unknown;
    if (!isKnowledge(value)) throw new Error(`${storePath} 不是 Knowledge`);
    return value;
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return emptyKnowledge();
    throw error;
  }
}

function isPatch(value: unknown): value is WalkthroughPatch {
  return Boolean(value) && typeof value === "object" && Array.isArray((value as { operations?: unknown }).operations);
}

function openFile(filePath: string) {
  return new Promise<void>((resolveOpen, reject) => {
    const child = spawn("open", [filePath], { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolveOpen();
      else reject(new Error(`无法打开 ${filePath}`));
    });
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
