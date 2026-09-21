export const TYPE_LABELS = {
  actor: "Actor",
  system: "System",
  container: "Container",
  component: "Component",
  module: "Module",
  unit: "Unit",
  contract: "Contract",
  store: "Store",
};

export const BOX = {
  padX: 16,
  padTop: 18,
  line: 18,
  fileRow: 18,
  minWidth: 200,
  maxWidth: 280,
  minParticipantWidth: 152,
  maxParticipantWidth: 176,
};

export function collectContracts(entity, walkthrough) {
  const nested = walkthrough.entities.filter(
    (item) => item.type === "contract" && item.parentId === entity.id,
  );
  const implemented = walkthrough.relations
    .filter((relation) => relation.type === "implements" && relation.sourceId === entity.id)
    .map((relation) =>
      walkthrough.entities.find((item) => item.id === relation.targetId && item.type === "contract"),
    )
    .filter(Boolean);
  const seen = new Set();
  const contracts = [];
  for (const contract of [...nested, ...implemented]) {
    if (seen.has(contract.id)) continue;
    seen.add(contract.id);
    contracts.push(contract);
  }
  return contracts;
}

export function boxSlots(entity, contracts = []) {
  const type = TYPE_LABELS[entity.type] ?? entity.type;
  const layer = entity.layer && entity.layer !== type && entity.layer !== entity.type ? entity.layer : "";
  const identity = entity.codeIdentity && entity.codeIdentity !== entity.title ? entity.codeIdentity : "";
  return {
    type,
    layer,
    title: entity.title ?? "",
    identity,
    responsibility: entity.responsibility ?? "",
    file: formatFileBadge(entity),
    contracts: contracts
      .map((contract) => contract.title ?? contract.codeIdentity ?? "")
      .filter(Boolean),
    status: entity.status && entity.status !== "context" ? entity.status : "",
  };
}

export function measureBox(entity, contracts = [], limits = {}) {
  const slots = boxSlots(entity, contracts);
  const minWidth = limits.minWidth ?? BOX.minWidth;
  const maxWidth = limits.maxWidth ?? BOX.maxWidth;
  const texts = [slots.type, slots.layer, slots.title, slots.identity, ...slots.contracts];
  const width = Math.min(
    maxWidth,
    Math.max(minWidth, Math.max(0, ...texts.map((text) => estimateTextWidth(text, 13))) + BOX.padX * 2 + 12),
  );
  const layout = layoutBoxSlots(slots, width);
  return { width, height: layout.height, slots, layout };
}

export function measureBoxHeader(entity) {
  return measureBox(entity, []).height;
}

export function measureBoxHeight(slots, width = BOX.minWidth) {
  return layoutBoxSlots(slots, width).height;
}

export function layoutBoxSlots(slots, width) {
  const inner = Math.max(64, width - BOX.padX * 2);
  const titleLines = wrapText(slots.title, inner, 13, 2);
  const identityLines = slots.identity ? wrapText(slots.identity, inner, 11, 1) : [];
  const responsibilityLines = wrapText(slots.responsibility, inner, 12, 2);
  const contractLines = slots.contracts.flatMap((name) => wrapText(name, inner - 12, 11, 1));
  const lines =
    1 + titleLines.length + identityLines.length + responsibilityLines.length + contractLines.length;
  return {
    titleLines,
    identityLines,
    responsibilityLines,
    contractLines,
    height: BOX.padTop + lines * BOX.line + (slots.file ? BOX.fileRow : 10),
  };
}

export function wrapText(text, maxWidth, fontSize = 13, maxLines = 3) {
  const raw = String(text ?? "").trim();
  if (!raw || maxWidth <= 0) return raw ? [raw] : [];
  const units = splitWrapUnits(raw);
  const lines = [""];
  for (const unit of units) {
    const candidate = `${lines.at(-1)}${unit}`;
    if (estimateTextWidth(candidate, fontSize) <= maxWidth || lines.at(-1) === "") {
      lines[lines.length - 1] = candidate;
    } else {
      lines.push(unit.trimStart());
    }
  }
  const cleaned = lines.map((line) => line.trim()).filter(Boolean);
  if (cleaned.length <= maxLines) return cleaned;
  const kept = cleaned.slice(0, maxLines);
  kept[maxLines - 1] = ellipsize(kept[maxLines - 1], maxWidth, fontSize);
  return kept;
}

export function formatMethodSignature(step) {
  const params = formatMethodParams(step);
  const method = step.method ?? (step.kind === "return" ? "return" : step.kind === "async" ? "async" : "");
  if (!method) return params ? `(${params})` : "";
  return `${method}(${params})`;
}

export function formatMethodParams(step) {
  if (Array.isArray(step.params)) return step.params.filter(Boolean).join(", ");
  if (typeof step.params === "string" && step.params.trim() !== "") return step.params.trim();
  return step.detail ?? "";
}

function splitWrapUnits(text) {
  return text.match(/[\u2E80-\u9FFF\uF900-\uFAFF]|[^\s\u2E80-\u9FFF\uF900-\uFAFF]+|\s+/gu) ?? [text];
}

function ellipsize(text, maxWidth, fontSize) {
  if (estimateTextWidth(text, fontSize) <= maxWidth) return text;
  let next = text;
  while (next.length > 1 && estimateTextWidth(`${next}…`, fontSize) > maxWidth) {
    next = next.slice(0, -1);
  }
  return `${next}…`;
}

export function formatFileBadge(item) {
  const evidence = formatEvidence(item?.evidence);
  if (evidence) return evidence;
  return item?.file ? fileName(item.file) : "";
}

export function formatEvidence(evidence) {
  const first = evidence?.[0];
  if (!first?.path) return undefined;
  const line = first.startLine ? `:${first.startLine}` : "";
  return `${fileName(first.path)}${line}`;
}

export function estimateTextWidth(text, fontSize) {
  let units = 0;
  for (const character of String(text ?? "")) {
    units += /[\u2E80-\u9FFF\uF900-\uFAFF]/u.test(character) ? 1 : 0.58;
  }
  return Math.ceil(units * fontSize);
}

function fileName(filePath) {
  return filePath.split("/").at(-1) ?? filePath;
}
