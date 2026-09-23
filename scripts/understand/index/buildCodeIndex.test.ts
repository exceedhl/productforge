import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildCodeIndex } from "./buildCodeIndex.ts";
import { buildEvidencePacket } from "./evidencePacket.ts";
import { readCodeIndex, writeCodeIndex } from "./codeIndexStore.ts";

const fixture = join(import.meta.dirname, "../fixtures/widget");

test("索引连接同文件和相对 import，并抽出测试与状态写入", async () => {
  const index = await buildCodeIndex(fixture);
  const refresh = index.symbols.find((symbol) => symbol.name === "refreshWidget");
  const readDraft = index.symbols.find((symbol) => symbol.name === "readDraft");
  assert.ok(refresh);
  assert.equal(refresh.exported, true);
  assert.equal(readDraft?.file, "draftStore.ts");
  const call = index.relations.find((relation) => {
    return relation.type === "calls" && relation.sourceSymbolId === refresh.id && relation.targetName === "readDraft";
  });
  assert.equal(call?.resolution, "syntactic");
  assert.equal(call?.targetSymbolId, readDraft?.id);
  assert.equal(index.tests[0]?.title, "缺少 id 时拒绝");
  assert.equal(index.tests[0]?.suite[0], "刷新 Widget");
  assert.ok(index.stateAccess.some((access) => access.kind === "write" && access.target === "draft.stored"));
  assert.ok(index.entrypoints.some((entry) => entry.kind === "route" && entry.name === "get /widgets/:id"));
  assert.ok(index.symbols.some((symbol) => symbol.name === "StatusView" && symbol.language === "tsx"));

  const packet = await buildEvidencePacket(index, { file: "widgetRefresh.ts", name: "refreshWidget" });
  assert.match(packet.controlFlow, /if \(!id\)/);
  assert.match(packet.controlFlow, /call readDraft/);
  assert.match(packet.controlFlow, /throw /);
  assert.equal(packet.callees.find((callee) => callee.name === "readDraft")?.targetSymbolId, readDraft?.id);
  assert.equal(packet.tests[0]?.title, "缺少 id 时拒绝");
  assert.equal(packet.unresolved.some((item) => item.includes("成员调用")), false);
});

test("未变化文件会复用索引，内容变化后更新哈希", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pf-understand-"));
  const sourcePath = join(directory, "widgetRefresh.ts");
  await writeFile(sourcePath, await readFile(join(fixture, "widgetRefresh.ts")));
  await writeFile(join(directory, "draftStore.ts"), await readFile(join(fixture, "draftStore.ts")));
  const first = await buildCodeIndex(directory);
  const second = await buildCodeIndex(directory, first);
  assert.deepEqual(second.symbols.map((symbol) => symbol.id), first.symbols.map((symbol) => symbol.id));
  await writeFile(sourcePath, `${await readFile(sourcePath, "utf8")}\n`);
  const third = await buildCodeIndex(directory, second);
  const before = second.files.find((file) => file.path === "widgetRefresh.ts");
  const after = third.files.find((file) => file.path === "widgetRefresh.ts");
  assert.notEqual(after?.contentHash, before?.contentHash);
  const stored = join(directory, "index");
  await writeCodeIndex(stored, third);
  const loaded = await readCodeIndex(stored);
  assert.equal(loaded?.symbols.length, third.symbols.length);
  assert.equal(loaded?.relations.length, third.relations.length);
});
