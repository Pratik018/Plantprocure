# Security Specification - Plant Procure Ledger

## Data Invariants
1. A procurement request must have a valid `userId` matching the creator.
2. A message must have a `chatId` representing the non-admin user involved.
3. A notification must be readable only by its `userId`.
4. Users in `authorized_users` must be verified via email.

## The "Dirty Dozen" Payloads (Messages)
1. **Identity Spoofing**: Create a message with `senderId` of another user.
2. **Chat Escaping**: Create a message with a `chatId` that does not belong to the user.
3. **Admin Impersonation**: Create a message with `isAdminMessage: true` as a non-admin user.
4. **ID Poisoning**: Create a message with an extremely long or invalid `messageId`.
5. **PII Scraping**: Attempt to list all messages without a `chatId` filter.
6. **Shadow Update**: Update a message's `text` or `senderId` after creation.
7. **Unauthorized Deletion**: Delete a message from a chat you are not part of.
8. **Admin-Only Deletion**: Delete an admin message as a regular user (if not allowed).
9. **Bulk Deletion Poisoning**: Trigger a batch delete with IDs that don't belong to your chat.
10. **State Manipulation**: Update `isRead` to `false` after it was `true`.
11. **Timestamp Spoofing**: Provide a non-server timestamp for `createdAt`.
12. **Incomplete Message**: Create a message missing required fields like `text`.

## Test Scenarios to Verify Denial
- `delete` message where `chatId != request.auth.uid` and user is not Admin.
- `update` message fields other than `isRead`.
- `create` message where `senderId != request.auth.uid`.
