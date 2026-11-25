# Security Specification & Red-Team TDD (`security_spec.md`)

## 1. Data Invariants
1. **Default-Deny Catch-All**: Global catch-all denies all reads and writes everywhere outside `/workspaces/{workspaceId}` (`match /{document=**} { allow read, write: if false; }`).
2. **Zero Blanket Listing & Zero Remote Deletes**: `allow list` and `allow delete` are explicitly `false` on `/workspaces/{workspaceId}` to block collection scraping and unauthorized wiping.
3. **Immutable Identity & Creation Timestamp**: `workspaceId` and `createdAt` cannot be modified after document creation, and `createdAt` / `updatedAt` must strictly equal `request.time`.
4. **Native Structured Storage & Bounded Arrays**: `budgetState` must be a valid native Firestore `map` with bounded array sizes (`banks <= 50`, `fixedItems <= 200`, `variableCategories <= 50`, `debts <= 200`, `goals <= 200`, `toBuyCategories <= 100`, `toBuyItems <= 500`, `savedAllocations <= 260`, `activityLog <= 100`), preventing shadow fields and denial-of-wallet oversized documents.
5. **PII & Credential Isolation**: Workspace documents contain zero PII (`email`, `phone`, `address`) and zero passwords/passkeys.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. Collection list query (`getDocs(collection(db, 'workspaces'))`) attempting to enumerate workspaces.
2. Delete operation (`deleteDoc(doc(db, 'workspaces', 'von'))`) attempting to wipe workspace data.
3. Access to any unauthorized collection outside `/workspaces/{workspaceId}` (e.g., `/users/u1` or `/admin/config`).
4. Identity mismatch on create (`workspaceId: 'other'` inside `/workspaces/von`).
5. Shadow field injection (`role: 'admin'` or `password: '123'` added to `/workspaces/von`).
6. Spoofed client timestamp (`createdAt: new Date(0)` instead of `serverTimestamp()`).
7. Mutating immutable `workspaceId` or `createdAt` on update.
8. Invalid `workspaceId` path variable (<2 chars, >64 chars, or special characters like `foo$bar`).
9. Oversized `displayName` (>80 chars) or empty `displayName`.
10. Non-map `budgetState` (e.g., stringified JSON blob or >45 keys).
11. Unbounded array poisoning (`toBuyItems` with >500 entries or non-map elements).
12. Invalid `syncRevision` (`<= 0` or non-number) or oversized `updatedByDevice` (>64 chars).
