#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { calculateArchitecture } from "./calculate/architecture.ts";
import { calculateSequence } from "./calculate/sequence.ts";
import { renderArchitecture } from "./render/architecture.ts";
import { renderGuidePage } from "./render/page.ts";
import { renderSequence } from "./render/sequence.ts";
import { resolveFocusId } from "./scope/architecture.ts";
import { DEFAULT_STORE_RELATIVE_PATH, readWalkthrough, writeWalkthrough } from "./model/jsonStore.ts";
import {
  applyPatch,
  emptyWalkthrough,
  validatePatch,
  validateWalkthrough,
  type Walkthrough,
  type WalkthroughPatch,
} from "./model/walkthrough.ts";
const usage = `用法：
  node cli.ts validate --input <snapshot.json|patch.json>
  node cli.ts save --input <snapshot.json> [--store .productforge/understand/graph.json]
  node cli.ts apply --patch <patch.json> [--store .productforge/understand/graph.json]
  node cli.ts render [--input <snapshot.json>] [--store .productforge/understand/graph.json] [--output <file.html>] [--open]
`;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  switch (options.command) {
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

async function runValidate(options: { input?: string }) {
  const inputPath = requirePath(options.input, "--input");
  const value = await readJson(inputPath);
  const issues = isPatch(value) ? validatePatch(value) : validateWalkthrough(value);
  if (issues.length > 0) throw new Error(`校验失败：\n- ${issues.join("\n- ")}`);
  process.stdout.write(`${inputPath} 校验通过\n`);
}

async function runSave(options: { input?: string; store?: string }) {
  const inputPath = requirePath(options.input, "--input");
  const storePath = resolveStore(options.store);
  const walkthrough = await readJson(inputPath);
  const issues = validateWalkthrough(walkthrough);
  if (issues.length > 0) throw new Error(`Walkthrough 校验失败：\n- ${issues.join("\n- ")}`);
  await writeWalkthrough(storePath, walkthrough as Walkthrough);
  process.stdout.write(`已写入 ${storePath}（revision ${(walkthrough as Walkthrough).revision}）\n`);
}

async function runApply(options: { patch?: string; store?: string }) {
  const patchPath = requirePath(options.patch, "--patch");
  const storePath = resolveStore(options.store);
  const current = await readWalkthrough(storePath);
  const patch = (await readJson(patchPath)) as WalkthroughPatch;
  const base = current.participants ? current : emptyWalkthrough();
  const next = applyPatch(base, patch);
  await writeWalkthrough(storePath, next);
  process.stdout.write(`已写入 ${storePath}（revision ${next.revision}）\n`);
}

async function runRender(options: { input?: string; store?: string; output?: string; open?: boolean }) {
  const storePath = resolveStore(options.store);
  const sourcePath = options.input ? resolve(options.input) : storePath;
  const walkthrough = (
    options.input ? await readJson(sourcePath) : await readWalkthrough(storePath)
  ) as Walkthrough;
  const issues = validateWalkthrough(walkthrough);
  if (issues.length > 0) throw new Error(`Walkthrough 校验失败：\n- ${issues.join("\n- ")}`);

  const focusId = resolveFocusId(walkthrough);
  const requested =
    walkthrough.participants.length === 0
      ? []
      : focusId
        ? [
            { id: "architecture-overview", title: "架构概览", view: "overview" as const },
            { id: "architecture-detail", title: "架构展开", view: "detail" as const },
          ]
        : [{ id: "architecture-detail", title: "架构", view: "detail" as const }];
  const architectures = (
    await Promise.all(
      requested.map(async (view) => {
        const layout = await calculateArchitecture(walkthrough, { view: view.view });
        if (!layout) return null;
        return {
          id: view.id,
          title: view.title,
          svg: renderArchitecture(layout),
          lanes: (layout.lanes ?? []).map((lane: { title: string; slug: string }) => ({
            title: lane.title,
            slug: lane.slug,
          })),
        };
      }),
    )
  ).filter((view) => view !== null);
  const sequences = walkthrough.scenarios.map((scenario) => {
    const layout = calculateSequence(walkthrough, scenario);
    return { id: scenario.id, title: scenario.title, svg: renderSequence(layout) };
  });
  const html = renderGuidePage({
    title: walkthrough.title ?? "代码导览",
    guide: walkthrough.guide,
    architectures,
    sequences,
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

function resolveStore(value: string | undefined) {
  if (!value) return resolve(DEFAULT_STORE_RELATIVE_PATH);
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
