import type { AlphaSimulationResult } from '../../services/alphaApi';

export const ALPHA_STUDIES_KEY = 'finquant_alpha_studies_v1';
export const ALPHA_STUDIES_TRASH_KEY = 'finquant_alpha_studies_trash_v1';

export type AlphaStudy = {
  id: string;
  savedAt: string;
  name: string;
  templateId: string;
  templateName: string;
  quantile: number;
  periodsPerYear: number;
  result: AlphaSimulationResult;
};

type AlphaStudyDraft = Omit<AlphaStudy, 'id' | 'savedAt'>;

function readStudies(key: string): AlphaStudy[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is AlphaStudy => (
      item && typeof item.id === 'string' && typeof item.name === 'string'
      && typeof item.templateId === 'string' && Array.isArray(item.result?.period_returns)
      && Array.isArray(item.result?.equity_curve) && item.result?.metrics
    ));
  } catch {
    return [];
  }
}

export const readAlphaStudies = () => readStudies(ALPHA_STUDIES_KEY);
export const readTrashedAlphaStudies = () => readStudies(ALPHA_STUDIES_TRASH_KEY);

function writeAlphaStudies(studies: AlphaStudy[]) {
  localStorage.setItem(ALPHA_STUDIES_KEY, JSON.stringify(studies));
}

export function saveAlphaStudy(draft: AlphaStudyDraft): AlphaStudy {
  const name = draft.name.trim();
  if (!name) throw new Error('请输入研究名称。');
  const study = {
    ...draft,
    id: `alpha-${Date.now()}`,
    savedAt: new Date(Date.now()).toISOString(),
    name,
  };
  writeAlphaStudies([study, ...readAlphaStudies()].slice(0, 20));
  return study;
}

export function deleteAlphaStudy(id: string) {
  const studies = readAlphaStudies();
  const removed = studies.find((study) => study.id === id);
  if (!removed) return;
  writeAlphaStudies(studies.filter((study) => study.id !== id));
  localStorage.setItem(
    ALPHA_STUDIES_TRASH_KEY,
    JSON.stringify([removed, ...readTrashedAlphaStudies()].slice(0, 20)),
  );
}

export function restoreAlphaStudy(id: string) {
  const trash = readTrashedAlphaStudies();
  const restored = trash.find((study) => study.id === id);
  if (!restored) return;
  writeAlphaStudies([restored, ...readAlphaStudies()].slice(0, 20));
  localStorage.setItem(
    ALPHA_STUDIES_TRASH_KEY,
    JSON.stringify(trash.filter((study) => study.id !== id)),
  );
}
