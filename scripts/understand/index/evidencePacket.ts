import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CodeIndex, CodeSymbol, SourceRange, StateAccess, TestCase } from "../model/codeIndex.ts";
import { inspectSource } from "./inspectSource.ts";
import type { SourceLanguage } from "./parseSource.ts";

export interface EvidencePacket {
  symbol: CodeSymbol;
  signature?: string;
  imports: { specifier: string; localName?: string; targetFile?: string; evidence: SourceRange }[];
  callers: { name: string; file: string; evidence: SourceRange }[];
  callees: { name: string; resolution: string; targetSymbolId?: string; targetFile?: string; evidence: SourceRange }[];
  controlFlow: string;
  stateAccess: StateAccess[];
  tests: TestCase[];
  sourceRanges: SourceRange[];
  unresolved: string[];
}

export async function buildEvidencePacket(
  index: CodeIndex,
  selector: { file: string; name: string; line?: number },
): Promise<EvidencePacket> {
  const matches = index.symbols.filter((symbol) => {
    return symbol.file === selector.file && symbol.name === selector.name && (!selector.line || symbol.range.startLine === selector.line);
  });
  if (matches.length === 0) {
    throw new Error(`索引中没有 ${selector.file} 的符号 ${selector.name}`);
  }
  if (matches.length > 1) {
    const lines = matches.map((symbol) => symbol.range.startLine).join(", ");
    throw new Error(`${selector.name} 在 ${selector.file} 有多处定义：${lines}。请用 --line 指定。`);
  }
  const symbol = matches[0];
  const sourcePath = join(index.root, symbol.file);
  const source = await readFile(sourcePath, "utf8");
  const contentHash = createHash("sha256").update(source).digest("hex");
  const unresolved: string[] = [];
  if (contentHash !== symbol.contentHash) unresolved.push("文件内容已变化，需要重新运行 index。");
  const facts = await inspectSource(symbol.file, source, symbol.language as SourceLanguage, contentHash);
  const fresh = facts.symbols.find((item) => item.name === symbol.name && item.range.startLine === symbol.range.startLine);
  const calls = index.relations.filter((relation) => relation.type === "calls" && relation.sourceSymbolId === symbol.id);
  const importedNames = new Set(calls.map((relation) => relation.targetName));
  const imports = index.relations
    .filter((relation) => relation.type === "imports" && relation.sourceFile === symbol.file && relation.localName && importedNames.has(relation.localName))
    .map((relation) => ({
      specifier: relation.targetName,
      localName: relation.localName,
      targetFile: relation.targetFile,
      evidence: relation.evidence,
    }));
  for (const relation of index.relations) {
    if (relation.type === "imports" && relation.sourceFile === symbol.file && relation.localName && importedNames.has(relation.localName) && relation.resolution === "unresolved") {
      unresolved.push(`import ${relation.localName} from ${relation.targetName} 没有解析到仓库内文件。`);
    }
  }
  for (const relation of calls) {
    if (relation.callShape === "identifier" && !relation.targetSymbolId) {
      unresolved.push(`调用 ${relation.targetName} 没有解析到符号。`);
    }
  }
  if (calls.some((relation) => relation.callShape === "member")) {
    unresolved.push("成员调用只保留方法名，没有解析接收者。");
  }
  const callers = index.relations
    .filter((relation) => relation.type === "calls" && relation.targetSymbolId === symbol.id)
    .map((relation) => ({
      name: index.symbols.find((item) => item.id === relation.sourceSymbolId)?.name ?? relation.sourceFile,
      file: relation.sourceFile,
      evidence: relation.evidence,
    }));
  const tests = index.tests.filter((testCase) => {
    return index.relations.some((relation) => {
      return relation.type === "calls"
        && relation.targetSymbolId === symbol.id
        && relation.sourceFile === testCase.file
        && relation.evidence.startLine >= testCase.evidence.startLine
        && relation.evidence.startLine <= testCase.evidence.endLine;
    });
  });
  return {
    symbol,
    signature: fresh?.signature ?? symbol.signature,
    imports,
    callers,
    callees: calls.map((relation) => ({
      name: relation.targetName,
      resolution: relation.resolution,
      targetSymbolId: relation.targetSymbolId,
      targetFile: relation.targetFile,
      evidence: relation.evidence,
    })),
    controlFlow: facts.skeletons.find((item) => item.symbolId === fresh?.id)?.text ?? "",
    stateAccess: index.stateAccess.filter((access) => access.symbolId === symbol.id),
    tests,
    sourceRanges: [symbol.range],
    unresolved,
  };
}
