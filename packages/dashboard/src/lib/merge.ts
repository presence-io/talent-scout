import type { TalentEntry } from '@talent-scout/shared';

export interface Annotation {
  status: 'approved' | 'rejected' | 'noted';
  note: string;
  annotated_at: string;
}

export type AnnotationMap = Partial<Record<string, Annotation>>;

export interface MergedTalentEntry extends TalentEntry {
  annotation?: Annotation;
  ignored?: boolean;
}

export function mergeWithAnnotations(
  entries: TalentEntry[],
  annotations: AnnotationMap
): MergedTalentEntry[] {
  return entries.map((e) => {
    const annotation = annotations[e.username];
    return annotation ? { ...e, annotation } : e;
  });
}

export function mergeWithIgnoreList(
  entries: MergedTalentEntry[],
  ignoreList: Record<string, unknown>
): MergedTalentEntry[] {
  return entries.map((e) => {
    if (e.username in ignoreList) {
      return { ...e, ignored: true };
    }
    return e;
  });
}
