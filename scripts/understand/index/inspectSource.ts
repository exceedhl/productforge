import type { Node } from "web-tree-sitter";
import type { CodeSymbol, FileFacts, SourceRange } from "../model/codeIndex.ts";
import { withParsedTree, type SourceLanguage } from "./parseSource.ts";

const SYMBOL_NODES = new Set([
  "function_declaration",
  "class_declaration",
  "method_definition",
  "variable_declarator",
]);
const ROUTE_OBJECTS = new Set(["app", "router"]);
const ROUTE_METHODS = new Set(["get", "post", "put", "patch", "delete", "use"]);
const STATE_CALLS = new Set(["useState", "useReducer", "setState", "dispatch"]);
const SKELETON_LIMIT = 40;

export async function inspectSource(
  file: string,
  source: string,
  language: SourceLanguage,
  contentHash: string,
): Promise<FileFacts> {
  return withParsedTree(source, language, (root) => {
    const facts: FileFacts = {
      file: { path: file, language, contentHash },
      symbols: [],
      relations: [],
      stateAccess: [],
      entrypoints: [],
      tests: [],
      skeletons: [],
    };
    const stack: CodeSymbol[] = [];
    walk(root, file, language, contentHash, stack, [], facts);
    for (const symbol of facts.symbols) {
      if (!symbol.exported || symbol.kind === "method") continue;
      facts.entrypoints.push({
        id: `entry:${file}:${symbol.range.startLine}:${symbol.name}`,
        kind: "export",
        symbolId: symbol.id,
        file,
        name: symbol.name,
        evidence: symbol.range,
      });
    }
    return facts;
  });
}

function walk(
  node: Node,
  file: string,
  language: string,
  contentHash: string,
  stack: CodeSymbol[],
  suite: string[],
  facts: FileFacts,
) {
  if (node.type === "import_statement") {
    recordImport(node, file, facts);
    return;
  }
  if (node.type === "call_expression" && isTestCall(node, "describe")) {
    const title = firstStringArg(node) ?? "describe";
    const body = callbackBody(node);
    if (body) walk(body, file, language, contentHash, stack, [...suite, title], facts);
    return;
  }
  if (node.type === "call_expression" && (isTestCall(node, "it") || isTestCall(node, "test"))) {
    const title = firstStringArg(node);
    if (title) {
      const evidence = rangeOf(file, node);
      facts.tests.push({
        id: `test:${file}:${evidence.startLine}:${title}`,
        file,
        title,
        suite: [...suite],
        evidence,
      });
    }
  }

  const symbol = symbolFrom(node, file, language, contentHash);
  const nextStack = symbol ? [...stack, symbol] : stack;
  if (symbol) {
    facts.symbols.push(symbol);
    const body = skeletonBody(node);
    if (body) facts.skeletons.push({ symbolId: symbol.id, text: skeleton(body) });
  }
  if (node.type === "call_expression") recordCall(node, file, nextStack, facts);
  if (node.type === "assignment_expression") recordWrite(node, file, nextStack, facts);
  if (node.type === "call_expression" && STATE_CALLS.has(calleeName(node))) {
    recordStateCall(node, file, nextStack, facts);
  }

  for (const child of node.namedChildren) walk(child, file, language, contentHash, nextStack, suite, facts);
}

function symbolFrom(node: Node, file: string, language: string, contentHash: string): CodeSymbol | undefined {
  if (!SYMBOL_NODES.has(node.type)) return undefined;
  if (node.type === "variable_declarator") {
    const value = node.childForFieldName("value");
    if (!value || !["arrow_function", "function_expression", "generator_function"].includes(value.type)) {
      return undefined;
    }
  }
  const nameNode = node.childForFieldName("name");
  const name = nameNode?.text || (node.parent?.type === "export_statement" ? "default" : "");
  if (!name) return undefined;
  const range = rangeOf(file, node);
  const kind = node.type === "class_declaration"
    ? "class"
    : node.type === "method_definition"
      ? "method"
      : node.type === "variable_declarator"
        ? "variable"
        : "function";
  return {
    id: `symbol:${file}:${range.startLine}:${nameNode?.startPosition.column ?? node.startPosition.column}:${name}`,
    language,
    kind,
    name,
    file,
    range,
    signature: signatureOf(node),
    exported: isExported(node),
    contentHash,
  };
}

function skeletonBody(node: Node) {
  const body = node.childForFieldName("body") ?? node.childForFieldName("value");
  if (!body) return undefined;
  if (body.type === "arrow_function" || body.type === "function_expression") {
    return body.childForFieldName("body") ?? body;
  }
  return body;
}

function recordImport(node: Node, file: string, facts: FileFacts) {
  const source = node.childForFieldName("source");
  if (!source) return;
  const specifier = stripQuotes(source.text);
  const evidence = rangeOf(file, node);
  const bindings = importBindings(node);
  if (bindings.length === 0) {
    facts.relations.push({
      id: relationId(file, node, "imports", specifier),
      type: "imports",
      sourceFile: file,
      targetName: specifier,
      evidence,
      resolution: "unresolved",
    });
    return;
  }
  for (const binding of bindings) {
    facts.relations.push({
      id: relationId(file, node, "imports", binding.localName),
      type: "imports",
      sourceFile: file,
      targetName: specifier,
      localName: binding.localName,
      importedName: binding.importedName,
      evidence,
      resolution: "unresolved",
    });
  }
}

function recordCall(node: Node, file: string, stack: CodeSymbol[], facts: FileFacts) {
  const route = routeOf(node);
  if (route) {
    const evidence = rangeOf(file, node);
    facts.entrypoints.push({
      id: `entry:${file}:${evidence.startLine}:${route.method}:${route.path}`,
      kind: "route",
      symbolId: stack.at(-1)?.id,
      file,
      name: `${route.method} ${route.path}`,
      evidence,
    });
  }
  if (isTestCall(node, "describe") || isTestCall(node, "it") || isTestCall(node, "test")) return;
  const name = calleeName(node);
  if (!name) return;
  const evidence = rangeOf(file, node);
  facts.relations.push({
    id: relationId(file, node, "calls", name),
    type: "calls",
    sourceSymbolId: stack.at(-1)?.id,
    sourceFile: file,
    targetName: name,
    callShape: callShape(node),
    evidence,
    resolution: "unresolved",
  });
}

function recordWrite(node: Node, file: string, stack: CodeSymbol[], facts: FileFacts) {
  const left = node.childForFieldName("left");
  if (!left) return;
  const evidence = rangeOf(file, node);
  facts.stateAccess.push({
    id: `state:${file}:${evidence.startLine}:${node.startPosition.column}:write`,
    kind: "write",
    symbolId: stack.at(-1)?.id,
    file,
    target: clip(left.text, 80),
    evidence,
  });
}

function recordStateCall(node: Node, file: string, stack: CodeSymbol[], facts: FileFacts) {
  const evidence = rangeOf(file, node);
  facts.stateAccess.push({
    id: `state:${file}:${evidence.startLine}:${node.startPosition.column}:write`,
    kind: "write",
    symbolId: stack.at(-1)?.id,
    file,
    target: calleeName(node),
    evidence,
  });
}

function skeleton(node: Node) {
  const lines: string[] = [];
  writeSkeleton(node, 0, lines);
  if (lines.length >= SKELETON_LIMIT) lines.push("…");
  return lines.join("\n");
}

function writeSkeleton(node: Node, depth: number, lines: string[]) {
  if (lines.length >= SKELETON_LIMIT) return;
  const pad = "  ".repeat(depth);
  if (node.type === "if_statement") {
    lines.push(`${pad}if (${clipCondition(node.childForFieldName("condition")?.text ?? "")})`);
    const consequence = node.childForFieldName("consequence");
    if (consequence) writeSkeleton(consequence, depth + 1, lines);
    const alternative = node.childForFieldName("alternative");
    if (alternative) {
      lines.push(`${pad}else`);
      writeSkeleton(alternative, depth + 1, lines);
    }
    return;
  }
  if (["for_statement", "for_in_statement", "while_statement", "do_statement"].includes(node.type)) {
    lines.push(`${pad}loop`);
    const body = node.childForFieldName("body") ?? node.namedChildren.at(-1);
    if (body) writeSkeleton(body, depth + 1, lines);
    return;
  }
  if (node.type === "try_statement") {
    lines.push(`${pad}try`);
    const body = node.childForFieldName("body");
    if (body) writeSkeleton(body, depth + 1, lines);
    const handler = node.childForFieldName("handler");
    if (handler) {
      lines.push(`${pad}catch`);
      writeSkeleton(handler, depth + 1, lines);
    }
    return;
  }
  if (node.type === "return_statement") {
    const value = node.namedChildren[0];
    lines.push(value ? `${pad}return ${clip(value.text, 80)}` : `${pad}return`);
    return;
  }
  if (node.type === "throw_statement") {
    lines.push(`${pad}throw ${clip(node.namedChildren[0]?.text ?? "", 80)}`);
    return;
  }
  if (node.type === "arrow_function" || node.type === "function_expression" || node.type === "class_declaration") {
    lines.push(`${pad}function`);
    return;
  }
  if (node.type === "call_expression") {
    lines.push(`${pad}call ${calleeName(node)}`);
  }
  for (const child of node.namedChildren) writeSkeleton(child, depth, lines);
}

function importBindings(node: Node) {
  const bindings: { localName: string; importedName: string }[] = [];
  for (const specifier of node.descendantsOfType("import_specifier")) {
    const name = specifier.childForFieldName("name");
    const alias = specifier.childForFieldName("alias");
    if (!name) continue;
    bindings.push({ importedName: name.text, localName: alias?.text ?? name.text });
  }
  if (bindings.length > 0) return bindings;
  const clause = node.namedChildren.find((child) => child.type === "import_clause");
  const identifier = clause?.namedChildren.find((child) => child.type === "identifier");
  if (identifier) bindings.push({ importedName: "default", localName: identifier.text });
  return bindings;
}

function isExported(node: Node) {
  let current = node.parent;
  while (current && !["program", "class_body", "statement_block"].includes(current.type)) {
    if (current.type === "export_statement") return true;
    current = current.parent;
  }
  return false;
}

function isTestCall(node: Node, name: string) {
  const fn = node.childForFieldName("function");
  return fn?.type === "identifier" && fn.text === name;
}

function firstStringArg(node: Node) {
  const first = node.childForFieldName("arguments")?.namedChildren[0];
  if (first?.type !== "string") return undefined;
  return stripQuotes(first.text);
}

function callbackBody(node: Node) {
  const fn = node.childForFieldName("arguments")?.namedChildren.find((child) => {
    return child.type === "arrow_function" || child.type === "function_expression";
  });
  return fn?.childForFieldName("body");
}

function calleeName(node: Node) {
  const fn = node.childForFieldName("function");
  if (!fn) return clip(node.text, 80);
  if (fn.type === "identifier") return fn.text;
  if (fn.type === "member_expression") return fn.childForFieldName("property")?.text ?? clip(fn.text, 80);
  return clip(fn.text, 80);
}

function callShape(node: Node): "identifier" | "member" | "other" {
  const fn = node.childForFieldName("function");
  if (fn?.type === "identifier") return "identifier";
  if (fn?.type === "member_expression") return "member";
  return "other";
}

function routeOf(node: Node) {
  const fn = node.childForFieldName("function");
  if (fn?.type !== "member_expression") return undefined;
  const object = fn.childForFieldName("object");
  const property = fn.childForFieldName("property");
  if (object?.type !== "identifier" || !property) return undefined;
  if (!ROUTE_OBJECTS.has(object.text) || !ROUTE_METHODS.has(property.text)) return undefined;
  const path = node.childForFieldName("arguments")?.namedChildren.find((child) => child.type === "string");
  if (!path) return undefined;
  return { method: property.text, path: stripQuotes(path.text) };
}

function signatureOf(node: Node) {
  const body = node.childForFieldName("body") ?? node.childForFieldName("value");
  const text = body ? node.text.slice(0, Math.max(0, body.startIndex - node.startIndex)) : node.text;
  return clip(text, 180);
}

function rangeOf(file: string, node: Node): SourceRange {
  return {
    path: file,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
  };
}

function relationId(file: string, node: Node, type: string, name: string) {
  return `${type}:${file}:${node.startPosition.row + 1}:${node.startPosition.column}:${name}`;
}

function stripQuotes(text: string) {
  if (text.length >= 2 && (text.startsWith('"') || text.startsWith("'") || text.startsWith("`"))) {
    return text.slice(1, -1);
  }
  return text;
}

function clipCondition(text: string) {
  const flat = clip(text, 120);
  return flat.startsWith("(") && flat.endsWith(")") ? flat.slice(1, -1).trim() : flat;
}

function clip(text: string, max: number) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
