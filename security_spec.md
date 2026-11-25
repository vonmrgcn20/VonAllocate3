# Security Specification & Red-Team TDD (`security_spec.md`)

## 1. Data Invariants
1. **Strict Ownership**: Every document at `/users/{userId}` belongs strictly to the verified Firebase Auth user whose `request.auth.uid == userId` and `request.auth.token.email_verified == true`.
2. **Zero Blanket Listing**: `allow list` is explicitly `false` on `/users/{userId}`; clients only access their own document via `doc(db, 'users', uid)`.
3. **Immutable Identity & Creation Timestamp**: `uid` and `createdAt` cannot be modified after document creation, and `createdAt` / `updatedAt` must strictly equal `request.time`.
4. **Native Structured Storage**: `budgetState` must be a valid native Firestore `map` with bounded array sizes (`banks <= 50`, `fixedItems <= 200`, `variableCategories <= 50`, `debts <= 200`, `goals <= 200`, `toBuyCategories <= 100`, `toBuyItems <= 500`, `savedAllocations <= 260`, `activityLog <= 100`), preventing shadow fields and denial-of-wallet oversized documents.
5. **Zero Unauthenticated Access**: Default catch-all denies all reads and writes everywhere else (`match /{document=**} { allow read, write: if false; }`).

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. Unauthenticated read of `/users/user_abc`.
2. Unauthenticated write/create of `/users/user_abc`.
3. Collection list query (`getDocs(collection(db, 'users'))`) by an authenticated user.
4. Cross-user read (`getDoc(doc(db, 'users', 'victim_uid'))`) while signed in as `attacker_uid`.
5. Identity spoofing on create (`uid: 'victim_uid'` inside `/users/attacker_uid`).
6. Unverified email account attempting create/update (`email_verified: false`).
7. Shadow field injection (`role: 'admin'` or `isVerified: true` added to `/users/{uid}`).
8. Spoofed client timestamp (`createdAt: new Date(0)` instead of `serverTimestamp()`).
9. Mutating immutable `uid` or `createdAt` on update.
10. Invalid `userId` path variable (>128 chars or containing special characters like `foo$bar`).
11. Oversized `displayName` (>80 chars) or non-map `budgetState` (e.g., stringified JSON blob).
12. Unbounded array poisoning (`toBuyItems` with >500 entries or non-map elements).
