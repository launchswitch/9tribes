import type { SessionSaveSnapshot } from '../game/controller/GameSession';
import type { SerializedGameState } from '../game/types/playState';

const STORAGE_KEY = 'war-civ-v2.savegames.v1';

export type SaveGameRecord = {
  id: string;
  label: string;
  savedAt: string;
  preview: SessionSaveSnapshot['preview'];
  payload: SerializedGameState;
};

export type SaveGameSummary = Omit<SaveGameRecord, 'payload'>;

export function listSaveGames(): SaveGameSummary[] {
  return readRecords().map(({ payload: _payload, ...summary }) => summary);
}

export function getSaveGame(id: string): SaveGameRecord | null {
  return readRecords().find((record) => record.id === id) ?? null;
}

export function findSaveGameByLabel(label: string): SaveGameSummary | null {
  const normalized = normalizeLabel(label);
  if (!normalized) {
    return null;
  }

  const record = readRecords().find((entry) => normalizeLabel(entry.label) === normalized);
  if (!record) {
    return null;
  }

  const { payload: _payload, ...summary } = record;
  return summary;
}

export function writeSaveGame(
  snapshot: SessionSaveSnapshot,
  label?: string,
  overwriteId?: string,
): SaveGameSummary {
  const records = readRecords();
  const resolvedLabel = label?.trim() || buildDefaultLabel(snapshot.preview);
  const recordId = overwriteId ?? createSaveId();
  const record: SaveGameRecord = {
    id: recordId,
    label: resolvedLabel,
    savedAt: new Date().toISOString(),
    preview: snapshot.preview,
    payload: snapshot.payload,
  };

  const nextRecords = records.filter((entry) => entry.id !== recordId);
  nextRecords.unshift(record);
  writeRecords(nextRecords.slice(0, 12));

  const { payload: _payload, ...summary } = record;
  return summary;
}

export function deleteSaveGame(id: string): void {
  writeRecords(readRecords().filter((record) => record.id !== id));
}

function readRecords(): SaveGameRecord[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    console.log('Reading from localStorage...');
    const raw = window.localStorage.getItem(STORAGE_KEY);
    console.log('Raw storage:', raw);
    if (!raw) {
      console.log('No raw data');
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      console.log('Not array');
      return [];
    }

    console.log('Records found:', parsed.length);
    return parsed.filter(isSaveGameRecord);
  } catch (e) {
    console.error('Error reading records:', e);
    return [];
  }
}

function writeRecords(records: SaveGameRecord[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function isSaveGameRecord(value: unknown): value is SaveGameRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SaveGameRecord>;
  return typeof candidate.id === 'string'
    && typeof candidate.label === 'string'
    && typeof candidate.savedAt === 'string'
    && typeof candidate.payload === 'object'
    && candidate.payload !== null
    && typeof candidate.preview === 'object'
    && candidate.preview !== null;
}

function createSaveId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `save-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function buildDefaultLabel(preview: SessionSaveSnapshot['preview']) {
  const owner = preview.playerFactionName ?? preview.activeFactionName;
  return `${owner} | Round ${preview.round}`;
}

function normalizeLabel(value: string) {
  return value.trim().toLocaleLowerCase();
}
