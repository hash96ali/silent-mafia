// Types shared by the Socket.io server and the Next.js client.
// `Room` and `Player` are server-only (they hold secrets); clients only ever
// receive a `PlayerView`, built per player by src/server/view.ts.

/** REVENGE: an executed Upright Citizen picks one player to drag down with them. */
export const PHASES = ["LOBBY", "ROLE_REVEAL", "NIGHT", "DAY", "VOTING", "REVENGE", "GAME_OVER"] as const;
export type Phase = (typeof PHASES)[number];

export type Role = "MAFIA" | "DOCTOR" | "DETECTIVE" | "CITIZEN" | "SHEIK" | "SNIPER" | "UPRIGHT";
export type Team = "MAFIA" | "TOWN";

/** Night turns run one at a time, in this order; disabled roles are left out. */
export const NIGHT_TURNS = ["MAFIA", "DOCTOR", "DETECTIVE", "SNIPER"] as const;
export type NightTurn = (typeof NIGHT_TURNS)[number];

export const SKIP = "SKIP" as const;
export type VoteTarget = string | typeof SKIP;

export interface Settings {
  mafiaCount: number;
  doctor: boolean;
  /** Disabled automatically while `sniper` is on. */
  detective: boolean;
  sheik: boolean;
  sniper: boolean;
  upright: boolean;
  /** Durations in seconds; 0 disables the timer. `nightSec` is per night turn. */
  nightSec: number;
  daySec: number;
  voteSec: number;
  /** Reveal a player's role to everyone when they die. */
  revealRoleOnDeath: boolean;
}

// ---------- Server-side state ----------

export interface Player {
  id: string;
  name: string;
  /** Secret used to resume a session after refresh/disconnect. Never sent to other clients. */
  token: string;
  socketId: string | null;
  connected: boolean;
  disconnectedAt: number | null;
  /** The Game Master narrates and sees everything, but is not dealt a role. */
  isGM: boolean;
  role: Role | null;
  alive: boolean;
  /** Role publicly revealed during play (Sheik saved by the vote, executed Upright Citizen). */
  revealed: boolean;
}

export interface NightState {
  /** Whose turn it is; null once every turn has run. */
  turn: NightTurn | null;
  /** Turns still to come tonight, in order. */
  queue: NightTurn[];
  /**
   * Set when the current turn's role can't act (dead, or the Sniper's bullet is
   * spent): the turn ends by itself at this time, earlier than the visible
   * deadline, so it looks like any other turn. Server/GM only.
   */
  ghostEndsAt: number | null;
  /** The Godfather's highlighted pick, shown live to the other Mafia. */
  mafiaSelection: string | null;
  /** The Godfather's confirmed kill. */
  mafiaTarget: string | null;
  doctorTarget: string | null;
  detectiveTarget: string | null;
  /** A target id, SKIP to hold fire tonight, or null if undecided. */
  sniperTarget: VoteTarget | null;
}

export interface Investigation {
  round: number;
  targetId: string;
  isMafia: boolean;
}

export interface Announcement {
  kind: "NIGHT" | "VOTE" | "REVENGE";
  round: number;
  /** Everyone who died; empty means nobody did (doctor save, tie, skip, Sheik reveal). */
  killedIds: string[];
  /** VOTE: a Sheik who survived by revealing, or an executed Upright Citizen. */
  revealedId?: string;
  /** REVENGE: the Upright Citizen who did the dragging. */
  byId?: string;
  /** Weighted vote tally (target id or SKIP -> votes), VOTE announcements only. */
  tally?: Record<string, number>;
}

export interface LogEntry {
  round: number;
  phase: Phase;
  text: string;
  /** Secret entries are only shown to the GM and at GAME_OVER. */
  secret: boolean;
  at: number;
}

export interface Room {
  code: string;
  phase: Phase;
  round: number;
  settings: Settings;
  players: Player[];
  hostId: string;
  /** Epoch ms when the current phase auto-advances, or null for no timer. */
  deadline: number | null;
  night: NightState;
  votes: Record<string, VoteTarget>;
  revealAcks: string[];
  /** detective id -> results */
  investigations: Record<string, Investigation[]>;
  sniperShotUsed: boolean;
  /** The Mafia member who decides the kill; passes to another living Mafia member on death. */
  godfatherId: string | null;
  /** Set during REVENGE: the executed Upright Citizen who is choosing. */
  revenge: { uprightId: string } | null;
  announcements: Announcement[];
  log: LogEntry[];
  winner: Team | null;
  createdAt: number;
  lastActivity: number;
}

// ---------- Client-facing view ----------

export interface PublicPlayer {
  id: string;
  name: string;
  alive: boolean;
  connected: boolean;
  isHost: boolean;
  isGM: boolean;
  revealed: boolean;
  /** Votes this player's day vote counts as (3 for a revealed Sheik). */
  voteWeight: number;
  /** Present only when the viewer is allowed to know it. */
  role?: Role;
}

export interface GmInfo {
  night: NightState;
  votes: Record<string, VoteTarget>;
  revealAcks: string[];
  investigations: Record<string, Investigation[]>;
}

export interface PlayerView {
  code: string;
  phase: Phase;
  round: number;
  settings: Settings;
  deadline: number | null;
  /** Server clock at send time, for client clock-skew correction. */
  serverNow: number;
  meId: string;
  isHost: boolean;
  players: PublicPlayer[];
  /** This player's current night pick / day vote, if any. */
  myNightTarget: string | null;
  myVote: VoteTarget | null;
  hasAckedReveal: boolean;
  /** Whose night turn it is (public, like a narrator calling roles); null outside NIGHT. */
  nightTurn: NightTurn | null;
  /** Mafia, GM and game over only. */
  godfatherId?: string;
  /** Mafia only, during the Mafia turn: the Godfather's live pick. */
  mafiaSelection?: string | null;
  /** Detective only. */
  investigations?: Investigation[];
  /** Sniper only: whether the single shot is still available. */
  sniperShotAvailable?: boolean;
  /** During REVENGE: the Upright Citizen who is choosing. */
  revengeBy: string | null;
  announcements: Announcement[];
  /** How many of the required players have acted in the current phase. */
  progress: { done: number; required: number };
  winner: Team | null;
  log: LogEntry[];
  gm?: GmInfo;
}

// ---------- Socket.io event contracts ----------

export type Ack<T = undefined> = (res: { ok: true; data: T } | { ok: false; error: string }) => void;

export interface SessionInfo {
  code: string;
  playerId: string;
  token: string;
}

export interface ClientToServerEvents {
  "room:create": (p: { name: string; asGM: boolean; settings?: Partial<Settings> }, ack: Ack<SessionInfo>) => void;
  "room:join": (p: { code: string; name: string }, ack: Ack<SessionInfo>) => void;
  "room:resume": (p: SessionInfo, ack: Ack) => void;
  "room:leave": (ack: Ack) => void;
  "room:updateSettings": (p: Partial<Settings>, ack: Ack) => void;
  "room:kick": (p: { playerId: string }, ack: Ack) => void;
  "room:setGM": (p: { playerId: string | null }, ack: Ack) => void;
  "game:start": (ack: Ack) => void;
  "game:advance": (ack: Ack) => void;
  "game:playAgain": (ack: Ack) => void;
  "reveal:ack": (ack: Ack) => void;
  "night:act": (p: { targetId: string }, ack: Ack<{ investigation?: Investigation }>) => void;
  /** Godfather only: highlight a target for the rest of the Mafia before confirming. */
  "night:select": (p: { targetId: string | null }, ack: Ack) => void;
  "vote:cast": (p: { targetId: VoteTarget }, ack: Ack) => void;
  "revenge:pick": (p: { targetId: string }, ack: Ack) => void;
  /** Projector screen: receive the public view of a room without joining it. */
  "screen:watch": (p: { code: string }, ack: Ack) => void;
}

export interface ServerToClientEvents {
  "room:state": (view: PlayerView) => void;
  /** Sent when this session can no longer be used (kicked, replaced, room closed). */
  "room:closed": (p: { reason: string }) => void;
}

export interface SocketData {
  code?: string;
  playerId?: string;
}
