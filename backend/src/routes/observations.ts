import express from 'express';
import { randomUUID } from 'crypto';
import { dbStore, TeacherObservationRecord } from '../db';
import { getAuthUser } from '../auth';

const RATINGS = new Set(['Proficient', 'Progressive', 'Beginner']);

function cycleFromRequest(req: express.Request): string | undefined {
  return typeof req.query.cycle === 'string' && req.query.cycle.trim() ? req.query.cycle.trim() : undefined;
}

function parseQrPayload(value: unknown): Record<string, any> | null {
  if (value && typeof value === 'object') return value as Record<string, any>;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function registerObservationRoutes(app: express.Express) {
  app.get('/api/observations/student/:studentId', async (req, res) => {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const cycle = cycleFromRequest(req);
    if (!cycle) return res.status(400).json({ error: 'cycle is required.' });
    res.json(await dbStore.getObservationRecordsForStudent(req.params.studentId, cycle));
  });

  app.get('/api/observations/class/:classId', async (req, res) => {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const cycle = cycleFromRequest(req);
    if (!cycle) return res.status(400).json({ error: 'cycle is required.' });
    res.json(await dbStore.getObservationRecordsForClass(req.params.classId, cycle));
  });

  /**
   * Convert the existing scan pipeline's OCR result into observation records.
   * The QR payload identifies the child/class and concept order; `ratings` may
   * be an object keyed by conceptId or the OCR-ordered array returned by the
   * ICR endpoint. This keeps observation scanning on the established upload ->
   * OCR -> server-submit path instead of introducing a second scanner.
   */
  app.post('/api/observations/scan', async (req, res) => {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const qr = parseQrPayload(req.body?.qrPayload || req.body?.qrData);
    if (!qr || qr.documentType !== 'teacher-observation') {
      return res.status(400).json({ error: 'A teacher-observation QR payload is required.' });
    }
    const conceptIds = Array.isArray(qr.conceptIds) ? qr.conceptIds.filter((id: unknown): id is string => typeof id === 'string') : [];
    const ratings = req.body?.ratings || req.body?.scanResult?.ratings || req.body?.scanResult?.answers;
    const entries: Array<{ studentId: string; conceptId: string; rating?: string; notYetAssessed?: boolean }> = [];
    if (ratings && !Array.isArray(ratings) && typeof ratings === 'object') {
      for (const [key, value] of Object.entries(ratings)) {
        const [studentId, conceptId] = key.includes(':') ? key.split(':', 2) : [qr.studentId, key];
        entries.push({ studentId, conceptId, rating: typeof value === 'string' ? value : undefined, notYetAssessed: value === 'Not yet assessed' });
      }
    } else if (Array.isArray(ratings) && qr.studentId) {
      conceptIds.forEach((conceptId, index) => {
        const value = ratings[index];
        entries.push({ studentId: qr.studentId, conceptId, rating: typeof value === 'string' ? value : undefined, notYetAssessed: value === 'Not yet assessed' });
      });
    }
    if (entries.length === 0) return res.status(400).json({ error: 'No observation ratings were supplied.' });
    const schoolId = String(req.body?.schoolId || qr.schoolId || '').trim();
    const classId = String(req.body?.classId || qr.classId || '').trim();
    const cycle = String(req.body?.cycle || qr.cycle || '').trim();
    if (!schoolId || !classId || !cycle) {
      return res.status(400).json({ error: 'Observation scan is missing schoolId, classId, or cycle.' });
    }
    const now = new Date().toISOString();
    const records: TeacherObservationRecord[] = [];
    for (const entry of entries) {
      if (!entry.studentId || !conceptIds.includes(entry.conceptId)) continue;
      if (!entry.notYetAssessed && !RATINGS.has(entry.rating)) {
        return res.status(400).json({ error: `Invalid rating for ${entry.conceptId}.` });
      }
      records.push(await dbStore.upsertObservationRecord({
        id: 'obs_' + randomUUID(),
        studentId: entry.studentId,
        conceptId: entry.conceptId,
        teacherId: user.id,
        teacherEmail: user.email,
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
    if (records.length === 0) return res.status(400).json({ error: 'No valid observation ratings matched the QR concept list.' });
    return res.json({ success: true, records });
  });

  app.post('/api/observations', async (req, res) => {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const body = req.body || {};
    const required = ['studentId', 'conceptId', 'schoolId', 'classId', 'cycle'];
    const missing = required.filter(field => typeof body[field] !== 'string' || !body[field].trim());
    if (missing.length > 0) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });
    if (!RATINGS.has(body.rating) && !body.notYetAssessed) {
      return res.status(400).json({ error: 'rating must be Proficient, Progressive, or Beginner unless notYetAssessed is true.' });
    }
    const now = new Date().toISOString();
    const record: TeacherObservationRecord = {
      id: typeof body.id === 'string' ? body.id : 'obs_' + randomUUID(),
      studentId: body.studentId.trim(),
      conceptId: body.conceptId.trim(),
      teacherId: user.id,
      teacherEmail: user.email,
      schoolId: body.schoolId.trim(),
      classId: body.classId.trim(),
      cycle: body.cycle.trim(),
      rating: RATINGS.has(body.rating) ? body.rating : 'Beginner',
      notYetAssessed: body.notYetAssessed === true,
      observedAt: typeof body.observedAt === 'string' ? body.observedAt : now,
      createdAt: typeof body.createdAt === 'string' ? body.createdAt : now,
      updatedAt: now,
    };
    res.status(200).json(await dbStore.upsertObservationRecord(record));
  });
}
