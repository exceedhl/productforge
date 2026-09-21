#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { applyPatch, emptyWalkthrough, validatePatch, validateWalkthrough } from "./walkthroughIr.mjs";
import { DEFAULT_STORE_RELATIVE_PATH, readWalkthrough, writeWalkthrough } from "./jsonStore.mjs";
import { renderWalkthroughToHtml } from "./renderWalkthrough.mjs";

const usage = `用法：
  node cli.mjs validate --input <snapshot.json|patch.json>
  node cli.mjs save --input <snapshot.json> [--store .lh/understand/graph.json]
  node cli.mjs apply --patch <patch.json> [--store .lh/understand/graph.json]
  node cli.mjs render [--input <snapshot.json>] [--store .lh/understand/graph.json] [--output <file.html>] [--open]
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

async function runValidate(options) {
  const inputPath = requirePath(options.input, "--input");
  const value = await readJson(inputPath);
  const issues = Array.isArray(value.operations)
    ? validatePatch(value)
    : validateWalkthrough(value);
  if (issues.length > 0) {
    throw new Error(`校验失败：\n- ${issues.join("\n- ")}`);
  }
  process.stdout.write(`${inputPath} 校验通过\n`);
}

async function runSave(options) {
  const inputPath = requirePath(options.input, "--input");
  const storePath = resolveStore(options.store);
  const walkthrough = await readJson(inputPath);
  const issues = validateWalkthrough(walkthrough);
  if (issues.length > 0) {
    throw new Error(`Walkthrough IR 校验失败：\n- ${issues.join("\n- ")}`);
  }
  await writeWalkthrough(storePath, walkthrough);
  process.stdout.write(`已写入 ${storePath}（revision ${walkthrough.revision}）\n`);
}

async function runApply(options) {
  const patchPath = requirePath(options.patch, "--patch");
  const storePath = resolveStore(options.store);
  const current = await readWalkthrough(storePath);
  const patch = await readJson(patchPath);
  const next = applyPatch(current.entities ? current : emptyWalkthrough(), patch);
  await writeWalkthrough(storePath, next);
  process.stdout.write(`已写入 ${storePath}（revision ${next.revision}）\n`);
}

async function runRender(options) {
  const storePath = resolveStore(options.store);
  const sourcePath = options.input ? resolve(options.input) : storePath;
  const walkthrough = options.input
    ? await readJson(sourcePath)
    : await readWalkthrough(storePath);
  const html = await renderWalkthroughToHtml(walkthrough, { sourcePath });
  const outputPath = resolve(options.output ?? defaultOutputPath(sourcePath));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, "utf8");
  process.stdout.write(`已生成 ${outputPath}\n`);
  if (options.open) await openFile(outputPath);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command, open: false };
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
    };
    if (!keys[token]) throw new Error(`未知参数 ${token}\n${usage}`);
    options[keys[token]] = rest[index + 1];
    index += 1;
  }
  return options;
}

function requirePath(value, flag) {
  if (!value) throw new Error(`缺少 ${flag}\n${usage}`);
  return resolve(value);
}

function resolveStore(value) {
  if (!value) return resolve(DEFAULT_STORE_RELATIVE_PATH);
  return isAbsolute(value) ? value : resolve(value);
}

function defaultOutputPath(sourcePath) {
  return sourcePath.endsWith(".json")
    ? sourcePath.replace(/\.json$/u, ".html")
    : resolve(".lh/understand/walkthrough.html");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function openFile(filePath) {
  return new Promise((resolveOpen, reject) => {
    const child = spawn("open", [filePath], { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolveOpen();
      else reject(new Error(`无法打开 ${filePath}`));
    });
  });
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
