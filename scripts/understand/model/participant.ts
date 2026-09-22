export const PARTICIPANT_TYPES = [
  "actor",
  "system",
  "container",
  "component",
  "module",
  "unit",
  "contract",
  "store",
] as const;

export type ParticipantType = (typeof PARTICIPANT_TYPES)[number];

export const RELATION_TYPES = [
  "calls",
  "reads",
  "writes",
  "implements",
  "dependsOn",
  "publishes",
  "subscribes",
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];

export const STEP_KINDS = ["call", "return", "async", "note"] as const;

export type StepKind = (typeof STEP_KINDS)[number];

export const CHANGE_STATUSES = ["context", "added", "removed", "modified", "moved"] as const;

export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

export interface Evidence {
  path: string;
  startLine: number;
  endLine?: number;
}

interface ParticipantBase {
  id: string;
  title: string;
  codeIdentity?: string;
  file?: string;
  responsibility?: string;
  parentId?: string;
  layer?: string;
  status?: ChangeStatus;
  evidence?: Evidence[];
}

export interface Actor extends ParticipantBase {
  type: "actor";
}

export interface System extends ParticipantBase {
  type: "system";
}

export interface Container extends ParticipantBase {
  type: "container";
}

export interface Component extends ParticipantBase {
  type: "component";
}

export interface Module extends ParticipantBase {
  type: "module";
}

export interface Unit extends ParticipantBase {
  type: "unit";
}

export interface Contract extends ParticipantBase {
  type: "contract";
}

export interface Store extends ParticipantBase {
  type: "store";
}

export type Participant = Actor | System | Container | Component | Module | Unit | Contract | Store;

export interface Relation {
  id: string;
  type: RelationType;
  sourceId: string;
  targetId: string;
  label?: string;
  protocol?: string;
  status?: ChangeStatus;
  evidence?: Evidence[];
}

export interface ScenarioLane {
  id: string;
  title: string;
}

export interface ScenarioStep {
  id: string;
  order: number;
  kind: StepKind;
  fromId: string;
  toId?: string;
  label: string;
  method?: string;
  detail?: string;
  params?: string | string[];
  laneId?: string;
  branch?: { position: "start" | "else" | "end"; label?: string };
  status?: ChangeStatus;
  evidence?: Evidence[];
}

export interface Scenario {
  id: string;
  title: string;
  participantIds: string[];
  lanes: ScenarioLane[];
  steps: ScenarioStep[];
}
