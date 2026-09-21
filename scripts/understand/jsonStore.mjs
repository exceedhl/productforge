import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { emptyWalkthrough } from "./walkthroughIr.mjs";

export const DEFAULT_STORE_RELATIVE_PATH = join(".lh", "understand", "graph.json");

export async function readWalkthrough(storePath) {
  try {
    const text = await readFile(storePath, "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (error && error.code === "ENOENT") return emptyWalkthrough();
    throw error;
  }
}

export async function writeWalkthrough(storePath, walkthrough) {
  await mkdir(dirname(storePath), { recursive: true });
  try {
    await copyFile(storePath, previousPath(storePath));
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }
  const tempPath = `${storePath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(walkthrough, null, 2)}\n`, "utf8");
  await rename(tempPath, storePath);
  return storePath;
}

export function previousPath(storePath) {
  return storePath.replace(/\.json$/u, ".previous.json");
}
