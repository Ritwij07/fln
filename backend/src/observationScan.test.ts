import assert from 'node:assert/strict';
import { parseObservationQrPayload } from './services/observationScan';

const payload = parseObservationQrPayload(JSON.stringify({
  documentType: 'teacher-observation',
  layout: 'per-child',
  studentId: 'student-1',
  conceptIds: ['S3.11', 'MATHS_VOCABULARY'],
}));

assert.equal(payload?.documentType, 'teacher-observation');
assert.equal(payload?.layout, 'per-child');
assert.deepEqual(payload?.conceptIds, ['S3.11', 'MATHS_VOCABULARY']);
assert.equal(parseObservationQrPayload('{not-json'), null);
assert.equal(parseObservationQrPayload(null), null);

console.log('observation scan contract checks passed');
