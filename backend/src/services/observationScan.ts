import { randomUUID } from 'crypto';
import { dbStore, TeacherObservationRecord } from '../db';

const RATINGS = new Set(['Proficient', 'Progressive', 'Beginner']);

export function parseObservationQrPayload(value: unknown): Record<string, any> | null {
  if (value && typeof value === 'object') return value as Record<string, any>;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function persistObservationScan({
  qrPayload,
  ratings,
  schoolId: suppliedSchoolId,
  classId: suppliedClassId,
  cycle: suppliedCycle,
  teacherId,
  teacherEmail,
}: {
  qrPayload: unknown;
  ratings: unknown;
  schoolId?: string;
  classId?: string;
  cycle?: string;
  teacherId: string;
  teacherEmail: string;
}): Promise<TeacherObservationRecord[]> {
  const qr = parseObservationQrPayload(qrPayload);
  if (!qr || qr.documentType !== 'teacher-observation') throw new Error('A teacher-observation QR payload is required.');
  const conceptIds = Array.isArray(qr.conceptIds)
    ? qr.conceptIds.filter((id: unknown): id is string => typeof id === 'string')
    : [];
  const entries: Array<{ studentId: string; conceptId: string; rating?: string; notYetAssessed?: boolean }> = [];
  if (ratings && !Array.isArray(ratings) && typeof ratings === 'object') {
    for (const [key, value] of Object.entries(ratings as Record<string, unknown>)) {
      const [studentId, conceptId] = key.includes(':') ? key.split(':', 2) : [qr.studentId, key];
      entries.push({ studentId, conceptId, rating: typeof value === 'string' ? value : undefined, notYetAssessed: value === 'Not yet assessed' });
    }
  } else if (Array.isArray(ratings) && qr.studentId) {
    conceptIds.forEach((conceptId, index) => {
      const value = ratings[index];
      entries.push({ studentId: qr.studentId, conceptId, rating: typeof value === 'string' ? value : undefined, notYetAssessed: value === 'Not yet assessed' });
    });
  }
  if (entries.length === 0) throw new Error('No observation ratings were supplied.');
  const schoolId = String(suppliedSchoolId || qr.schoolId || '').trim();
  const classId = String(suppliedClassId || qr.classId || '').trim();
  const cycle = String(suppliedCycle || qr.cycle || '').trim();
  if (!schoolId || !classId || !cycle) throw new Error('Observation scan is missing schoolId, classId, or cycle.');
  const now = new Date().toISOString();
  const records: TeacherObservationRecord[] = [];
  for (const entry of entries) {
    if (!entry.studentId || !conceptIds.includes(entry.conceptId)) continue;
    if (!entry.notYetAssessed && !RATINGS.has(entry.rating)) throw new Error(`Invalid rating for ${entry.conceptId}.`);
    records.push(await dbStore.upsertObservationRecord({
      id: 'obs_' + randomUUID(),
      studentId: entry.studentId,
      conceptId: entry.conceptId,
      teacherId,
      teacherEmail,
      schoolId,
      classId,
      cycle,
      rating: RATINGS.has(entry.rating) ? entry.rating as TeacherObservationRecord['rating'] : 'Beginner',
      notYetAssessed: entry.notYetAssessed === true,
      observedAt: now,
      createdAt: now,
      updatedAt: now,
    }));
  }
  if (records.length === 0) throw new Error('No valid observation ratings matched the QR concept list.');
  return records;
}
