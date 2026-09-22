import { escapeHtml, renderParticipantBox, wrapSvg } from "./participantBox.ts";

export function renderArchitecture(picture: {
  width: number;
  height: number;
  nodes: Parameters<typeof renderParticipantBox>[0][];
  edges: { path?: string; status?: string; type?: string; caption?: { title: string; protocol: string; x: number; y: number; width: number; height: number } | null }[];
  lanes?: { titleLines?: string[]; titleTop?: number; y: number; height: number; slug: string; gutter?: number }[];
  gutter?: number;
}) {
  const nodes = [...picture.nodes].sort((a, b) => {
    if (a.isCompound !== b.isCompound) return a.isCompound ? -1 : 1;
    return b.width * b.height - a.width * a.height;
  });
  const laneMarkup = renderLanes(picture);
  const nodeMarkup = nodes.map((node) => renderParticipantBox(node, "box")).join("");
  const edgeMarkup = picture.edges.map((edge) => renderEdge(edge)).join("");
  return wrapSvg(picture.width, picture.height, `${laneMarkup}${nodeMarkup}${edgeMarkup}`);
}

function renderLanes(picture) {
  const lanes = picture.lanes ?? [];
  if (lanes.length === 0) return "";
  const gutter = picture.gutter ?? lanes[0]?.gutter ?? 156;
  return lanes
    .map((lane, index) => {
      const titleLines = lane.titleLines ?? [];
      const titleBlock = titleLines
        .map(
          (line, lineIndex) =>
            `<text class="arch-lane-title" x="${gutter / 2}" y="${lane.titleTop + lineIndex * 16}" text-anchor="middle">${escapeHtml(line)}</text>`,
        )
        .join("");
      const divider = index === 0 ? "" : `<line class="arch-lane-divider" x1="0" y1="${lane.y}" x2="${picture.width}" y2="${lane.y}" />`;
      return `
      <rect class="arch-lane layer-${lane.slug}" x="0" y="${lane.y}" width="${picture.width}" height="${lane.height}" />
      <rect class="arch-lane-rail layer-${lane.slug}" x="0" y="${lane.y}" width="${gutter}" height="${lane.height}" />
      ${titleBlock}
      ${divider}`;
    })
    .join("");
}

function renderEdge(edge) {
  if (!edge.path) return "";
  const status = edge.status ?? "context";
  const caption = edge.caption;
  const labelMarkup = caption
    ? `<g class="edge-caption" transform="translate(${caption.x} ${caption.y})">
        <rect class="edge-pill" x="${-caption.width / 2}" y="${-caption.height - 2}" width="${caption.width}" height="${caption.height}" rx="4" />
        <text class="edge-label" text-anchor="middle" y="${caption.protocol ? -18 : -8}">${escapeHtml(caption.title)}</text>
        ${caption.protocol ? `<text class="edge-protocol" text-anchor="middle" y="-4">${escapeHtml(caption.protocol)}</text>` : ""}
      </g>`
    : "";
  return `
    <g class="edge status-${status} kind-${edge.type ?? "dependsOn"}">
      <path d="${edge.path}" marker-end="url(#arrow-${status})" />
      ${labelMarkup}
    </g>`;
}
