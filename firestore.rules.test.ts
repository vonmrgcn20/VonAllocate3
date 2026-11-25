// Security specification matrix for Von Allocator Firestore Rules (/users/{userId}).
// Verifies all 12 Dirty Dozen adversarial scenarios map to PERMISSION_DENIED.

export interface SecurityAuditCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED';
  payloadSummary: string;
}

export const DIRTY_DOZEN_CASES: SecurityAuditCase[] = [
  { id: 1, name: 'Unauthenticated get', operation: 'get', expected: 'PERMISSION_DENIED', payloadSummary: 'auth: null on /users/u1' },
  { id: 2, name: 'Unauthenticated create', operation: 'create', expected: 'PERMISSION_DENIED', payloadSummary: 'auth: null create /users/u1' },
  { id: 3, name: 'Collection list scraping', operation: 'list', expected: 'PERMISSION_DENIED', payloadSummary: 'list /users' },
  { id: 4, name: 'Cross-user read', operation: 'get', expected: 'PERMISSION_DENIED', payloadSummary: 'attacker reading /users/victim' },
  { id: 5, name: 'Identity spoofing create', operation: 'create', expected: 'PERMISSION_DENIED', payloadSummary: 'doc.uid != request.auth.uid' },
  { id: 6, name: 'Unverified email write', operation: 'create', expected: 'PERMISSION_DENIED', payloadSummary: 'email_verified: false' },
  { id: 7, name: 'Shadow field injection', operation: 'update', expected: 'PERMISSION_DENIED', payloadSummary: 'extra key role: admin' },
  { id: 8, name: 'Client-forged timestamp', operation: 'create', expected: 'PERMISSION_DENIED', payloadSummary: 'createdAt != request.time' },
  { id: 9, name: 'Immutable uid/createdAt mutation', operation: 'update', expected: 'PERMISSION_DENIED', payloadSummary: 'changing createdAt or uid' },
  { id: 10, name: 'ID poisoning guard', operation: 'create', expected: 'PERMISSION_DENIED', payloadSummary: 'invalid path characters or >128 length' },
  { id: 11, name: 'Type/length violation', operation: 'update', expected: 'PERMISSION_DENIED', payloadSummary: 'displayName > 80 or string budgetState' },
  { id: 12, name: 'Array poisoning guard', operation: 'update', expected: 'PERMISSION_DENIED', payloadSummary: 'toBuyItems.size() > 500 or invalid element' }
];
