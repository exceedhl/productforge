import { BOX } from "../calculate/measure.ts";

let domSerial = 0;

function nextDomId(prefix) {
  domSerial += 1;
  return `${prefix}-${domSerial}`;
}

const STATUS_LABELS = {
  context: "Context",
  added: "+ Added",
  removed: "− Removed",
  modified: "~ Modified",
  moved: "↔ Moved / Renamed",
};

export function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderParticipantBox(node, roleClass) {
  const content = node.content;
  const status = node.status ?? "context";
  const classes = [roleClass, `type-${node.type}`, `status-${status}`, node.isCompound ? "compound" : "leaf"]
    .filter(Boolean)
    .join(" ");
  const left = node.x + BOX.padX;
  const right = node.x + node.width - 12;
  const clip = node.isCompound ? compoundClip(node) : null;
  if (node.elkLabels?.length) {
    const lines = node.elkLabels
      .map((label) => {
        const textX = node.x + label.x + (label.role === "contract" ? 14 : 0);
        const textY = node.y + label.y + label.height - 4;
        const mark =
          label.role === "contract"
            ? `<rect class="contract-port" x="${node.x + label.x}" y="${textY - 10}" width="8" height="8" rx="2" />`
            : "";
        const className =
          label.role === "type"
            ? "type-mark"
            : label.role === "file"
              ? "file-badge"
              : label.role === "identity" || label.role === "contract"
                ? "identity"
                : label.role === "responsibility"
                  ? "responsibility"
                  : "title";
        const body =
          label.role === "contract"
            ? `<g class="contract-port">${mark}<text x="${textX}" y="${textY}">${escapeHtml(label.text)}</text></g>`
            : `<text class="${className}" x="${textX}" y="${textY}">${escapeHtml(label.text)}</text>`;
        return body;
      })
      .join("");
    return `
    <g class="${classes}">
      <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${node.isCompound ? 10 : 8}" />
      ${clip?.defs ?? ""}
      <g${clip ? ` clip-path="url(#${clip.id})"` : ""}>
      ${lines}
      </g>
    </g>`;
  }
  let cursorY = node.y + BOX.padTop;
  const typeRow = `
      <text class="type-mark" x="${left}" y="${cursorY}">${escapeHtml(content.typeLabel)}</text>
      ${content.status ? `<text class="status-badge" x="${right}" y="${cursorY}" text-anchor="end">${escapeHtml(STATUS_LABELS[status])}</text>` : ""}`;
  cursorY += BOX.line;
  const title = renderTextLines("title", content.titleLines, left, cursorY);
  cursorY += content.titleLines.length * BOX.line;
  const identity = renderTextLines("identity", content.identityLines, left, cursorY);
  cursorY += content.identityLines.length * BOX.line;
  const responsibility = renderTextLines("responsibility", content.responsibilityLines, left, cursorY);
  cursorY += content.responsibilityLines.length * BOX.line;
  const ports = content.contractLines
    .map((name) => {
      const markX = left;
      const markY = cursorY - 9;
      const markup = `
      <g class="contract-port">
        <rect x="${markX}" y="${markY}" width="8" height="8" rx="2" />
        <text x="${markX + 12}" y="${cursorY}">${escapeHtml(name)}</text>
      </g>`;
      cursorY += BOX.line;
      return markup;
    })
    .join("");
  const fileY = node.isCompound ? node.y + (node.headerHeight ?? node.height) - 8 : node.y + node.height - 10;
  const file = content.file
    ? `<text class="file-badge" x="${right}" y="${fileY}" text-anchor="end">${escapeHtml(content.file)}</text>`
    : "";
  return `
    <g class="${classes}">
      <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${node.isCompound ? 10 : 8}" />
      ${clip?.defs ?? ""}
      <g${clip ? ` clip-path="url(#${clip.id})"` : ""}>
      ${typeRow}
      ${title}
      ${identity}
      ${responsibility}
      ${ports}
      ${file}
      </g>
    </g>`;
}

function compoundClip(node) {
  const id = nextDomId("compound");
  const header = Math.min(node.headerHeight ?? node.height, node.height);
  return {
    id,
    defs: `<clipPath id="${id}"><rect x="${node.x}" y="${node.y}" width="${node.width}" height="${header}" /></clipPath>`,
  };
}

function renderTextLines(className, lines, x, startY) {
  return lines
    .map((line, index) => `<text class="${className}" x="${x}" y="${startY + index * BOX.line}">${escapeHtml(line)}</text>`)
    .join("");
}

export function wrapSvg(width, height, content) {
  const paddedWidth = Math.ceil(width + 48);
  const paddedHeight = Math.ceil(height + 48);
  return `<div class="canvas" data-canvas>
    <div class="canvas-tools">
      <button type="button" data-canvas-zoom="in">放大</button>
      <button type="button" data-canvas-zoom="out">缩小</button>
      <button type="button" data-canvas-zoom="fit">适应</button>
    </div>
    <svg viewBox="0 0 ${paddedWidth} ${paddedHeight}" width="${paddedWidth}" height="${paddedHeight}" role="img">
    <defs>
      <marker id="arrow-context" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" orient="auto">
        <path d="M 1 1 L 11 6 L 1 11 z" />
      </marker>
      <marker id="arrow-added" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" orient="auto">
        <path d="M 1 1 L 11 6 L 1 11 z" />
      </marker>
      <marker id="arrow-removed" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" orient="auto">
        <path d="M 1 1 L 11 6 L 1 11 z" />
      </marker>
      <marker id="arrow-modified" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" orient="auto">
        <path d="M 1 1 L 11 6 L 1 11 z" />
      </marker>
      <marker id="arrow-moved" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" orient="auto">
        <path d="M 1 1 L 11 6 L 1 11 z" />
      </marker>
    </defs>
    <g transform="translate(24 24)">${content}</g>
  </svg></div>`;
}

