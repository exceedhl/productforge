import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { emptyWalkthrough, type Walkthrough } from "./walkthrough.ts";

export const DEFAULT_STORE_RELATIVE_PATH = join(".productforge", "understand", "graph.json");

export async function readWalkthrough(storePath: string): Promise<Walkthrough> {
  try {
    const text = await readFile(storePath, "utf8");
    return JSON.parse(text) as Walkthrough;
  } catch (error) {
    if (isMissingFile(error)) return emptyWalkthrough();
    throw error;
  }
}

export async function writeWalkthrough(storePath: string, walkthrough: Walkthrough) {
  await mkdir(dirname(storePath), { recursive: true });
  try {
    await copyFile(storePath, previousPath(storePath));
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
  const tempPath = `${storePath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(walkthrough, null, 2)}\n`, "utf8");
  await rename(tempPath, storePath);
  return storePath;
}

export function previousPath(storePath: string) {
  return storePath.replace(/\.json$/u, ".previous.json");
}

function isMissingFile(error: unknown) {
  return Boolean(error) && typeof error === "object" && (error as { code?: string }).code === "ENOENT";
}
