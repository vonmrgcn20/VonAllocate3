// Security specification matrix for Von Allocator Firestore Rules (/workspaces/{workspaceId}).
// Verifies all 12 Dirty Dozen adversarial scenarios map to PERMISSION_DENIED.

export interface SecurityAuditCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED';
  payloadSummary: string;
}

export const DIRTY_DOZEN_CASES: SecurityAuditCase[] = [
  { id: 1, name: 'Collection list scraping', operation: 'list', expected: 'PERMISSION_DENIED', payloadSummary: 'list /workspaces' },
  { id: 2, name: 'Unauthorized workspace delete', operation: 'delete', expected: 'PERMISSION_DENIED', payloadSummary: 'delete /workspaces/von' },
  { id: 3, name: 'Disallowed collection access', operation: 'get', expected: 'PERMISSION_DENIED', payloadSummary: 'get /users/u1 or /secrets/a' },
  { id: 4, name: 'Workspace ID mismatch on create', operation: 'create', expected: 'PERMISSION_DENIED', payloadSummary: 'doc.workspaceId != path workspaceId' },
  { id: 5, name: 'Shadow field injection', operation: 'update', expected: 'PERMISSION_DENIED', payloadSummary: 'extra key role: admin or password' },
  { id: 6, name: 'Client-forged timestamp', operation: 'create', expected: 'PERMISSION_DENIED', payloadSummary: 'createdAt != request.time' },
  { id: 7, name: 'Immutable workspaceId/createdAt mutation', operation: 'update', expected: 'PERMISSION_DENIED', payloadSummary: 'changing createdAt or workspaceId' },
  { id: 8, name: 'ID poisoning guard', operation: 'create', expected: 'PERMISSION_DENIED', payloadSummary: 'invalid path characters, <2 or >64 length' },
  { id: 9, name: 'DisplayName length violation', operation: 'update', expected: 'PERMISSION_DENIED', payloadSummary: 'displayName empty or >80 chars' },
  { id: 10, name: 'Non-map or oversized budgetState', operation: 'update', expected: 'PERMISSION_DENIED', payloadSummary: 'stringified JSON budgetState or >45 keys' },
  { id: 11, name: 'Array poisoning guard', operation: 'update', expected: 'PERMISSION_DENIED', payloadSummary: 'toBuyItems.size() > 500 or non-map item' },
  { id: 12, name: 'Invalid syncRevision/device guard', operation: 'update', expected: 'PERMISSION_DENIED', payloadSummary: 'syncRevision < 1 or updatedByDevice > 64 chars' }
];
