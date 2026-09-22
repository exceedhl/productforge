import { escapeHtml, renderParticipantBox, wrapSvg } from "./participantBox.ts";

export function renderSequence(sequence) {
  const gutter = sequence.laneGutter ?? 108;
  const laneMarkup = sequence.laneRanges
    .map((lane) => {
      const titleLines = lane.titleLines ?? [];
      const titleBlock = titleLines
        .map(
          (line, index) =>
            `<text class="lane-title" x="${16 + (gutter - 28) / 2}" y="${lane.titleTop + index * 16}" text-anchor="middle">${escapeHtml(line)}</text>`,
        )
        .join("");
      return `
      <rect class="lane" x="${gutter - 8}" y="${lane.y}" width="${sequence.width - gutter - 20}" height="${lane.height}" rx="14" />
      <rect class="lane-rail" x="16" y="${lane.y}" width="${gutter - 28}" height="${lane.height}" rx="10" />
      ${titleBlock}`;
    })
    .join("");
  const lifelines = sequence.participants
    .map(
      (participant) =>
        `<line class="lifeline" x1="${participant.centerX}" y1="${participant.y + participant.height}" x2="${participant.centerX}" y2="${sequence.height - 36}" />`,
    )
    .join("");
  const headers = sequence.participants.map((participant) => renderParticipant(participant)).join("");
  const branchMarkup = renderBranchBoxes(sequence, gutter);
  const steps = sequence.steps.map((step) => renderSequenceStep(step)).join("");
  return wrapSvg(sequence.width, sequence.height, `${laneMarkup}${lifelines}${headers}${branchMarkup}${steps}`);
}

function renderParticipant(participant) {
  return renderParticipantBox(participant, "participant");
}

function renderSequenceStep(step) {
  if (step.kind === "note") {
    return `
      <g class="note status-${step.status ?? "context"}">
        <rect x="${(step.fromX ?? 0) - 70}" y="${step.y - 22}" width="140" height="36" rx="8" />
        <text x="${step.fromX}" y="${step.y}" text-anchor="middle">${escapeHtml(step.label)}</text>
      </g>`;
  }
  const fromX = step.fromX ?? 0;
  const toX = step.toX ?? fromX;
  const midX = (fromX + toX) / 2;
  const labelLines = step.labelLines ?? [];
  const methodLines = step.methodLines ?? [];
  const detailLines = step.detailLines ?? [];
  const evidenceText = step.evidenceText;
  const above = [...labelLines.map((line) => ["message-label", line]), ...methodLines.map((line) => ["message-method", line])];
  const below = detailLines.map((line) => ["message-detail", line]);
  const aboveMarkup = above
    .map(([className, line], index) => {
      const y = step.y - 8 - (above.length - 1 - index) * 16;
      return `<text class="${className}" x="${midX}" y="${y}" text-anchor="middle">${escapeHtml(line)}</text>`;
    })
    .join("");
  const belowMarkup = below
    .map(([className, line], index) => `<text class="${className}" x="${midX}" y="${step.y + 16 + index * 16}" text-anchor="middle">${escapeHtml(line)}</text>`)
    .join("");
  return `
    <g class="message kind-${step.kind} status-${step.status ?? "context"}">
      <line x1="${fromX}" y1="${step.y}" x2="${toX}" y2="${step.y}" />
      <polygon class="arrow-head" points="${step.arrowPoints}" />
      ${aboveMarkup}
      ${belowMarkup}
      ${evidenceText ? `<text class="file-badge" x="${midX}" y="${step.y + 16 + below.length * 16}" text-anchor="middle">${escapeHtml(evidenceText)}</text>` : ""}
    </g>`;
}

function renderBranchBoxes(sequence, gutter = 108) {
  const boxes = [];
  let open = null;
  for (const step of sequence.steps) {
    if (step.branch?.position === "start") {
      open = { label: step.branch.label ?? "alt", startY: step.y - 46 };
    }
    if (step.branch?.position === "end" && open) {
      boxes.push(`
        <g class="branch">
          <rect x="${gutter + 8}" y="${open.startY}" width="${sequence.width - gutter - 36}" height="${step.y - open.startY + 28}" rx="10" />
          <text x="${gutter + 24}" y="${open.startY + 18}">${escapeHtml(open.label)}</text>
        </g>`);
      open = null;
    }
  }
  return boxes.join("");
}

