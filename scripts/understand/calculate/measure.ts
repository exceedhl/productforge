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
  const nested = walkthrough.participants.filter(
    (item) => item.type === "contract" && item.parentId === entity.id,
  );
  const implemented = walkthrough.relations
    .filter((relation) => relation.type === "implements" && relation.sourceId === entity.id)
    .map((relation) =>
      walkthrough.participants.find((item) => item.id === relation.targetId && item.type === "contract"),
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

export function boxNodeLabels(entity, contracts = []) {
  const slots = boxSlots(entity, contracts);
  const labels = [];
  const addLine = (role, text, fontSize) => {
    const raw = String(text ?? "").trim();
    if (!raw) return;
    const lines = wrapText(raw, 240, fontSize, role === "title" || role === "responsibility" ? 2 : 1);
    for (const line of lines) {
      labels.push({
        id: `${entity.id}::${role}::${labels.length}`,
        text: line,
        width: Math.max(28, estimateTextWidth(line, fontSize) + (role === "contract" ? 18 : 6)),
        height: 16,
        layoutOptions: {
          "elk.nodeLabels.placement": "INSIDE V_TOP H_LEFT",
        },
      });
    }
  };
  addLine("type", slots.type, 11);
  addLine("title", slots.title, 13);
  addLine("identity", slots.identity, 11);
  addLine("responsibility", slots.responsibility, 12);
  for (const name of slots.contracts) addLine("contract", name, 11);
  addLine("file", slots.file, 10);
  return labels;
}

export function measureBox(entity, contracts = [], limits: { minWidth?: number; maxWidth?: number } = {}) {
  const slots = boxSlots(entity, contracts);
  const minWidth = limits.minWidth ?? BOX.minWidth;
  const maxWidth = limits.maxWidth ?? BOX.maxWidth;
  const texts = [slots.type, slots.title, slots.identity, ...slots.contracts];
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

export function participantContent(node) {
  const slots = boxSlots(node, node.contracts ?? []);
  const lines = layoutBoxSlots(slots, node.width);
  return {
    typeLabel: slots.type,
    status: slots.status,
    titleLines: lines.titleLines,
    identityLines: lines.identityLines,
    responsibilityLines: lines.responsibilityLines,
    contractLines: lines.contractLines,
    file: slots.file,
  };
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

export function measureEdgeLabel(edge) {
  const title = edge.label || "";
  const protocol = edge.protocol ?? "";
  const lines = [title, protocol].filter(Boolean);
  if (lines.length === 0) return { width: 0, height: 0 };
  return {
    width: Math.max(36, ...lines.map((line) => estimateTextWidth(line, 11))) + 16,
    height: lines.length * 15 + 8,
  };
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
