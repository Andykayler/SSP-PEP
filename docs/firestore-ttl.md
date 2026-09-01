# Notification expiry (Firestore TTL)

Every document written to `notifications` carries an `expiresAt` timestamp,
stamped 90 days ahead at write time by `NOTIFICATION_TTL_DAYS` in
[`src/services/notifications.js`](../src/services/notifications.js) and mirrored
in `acalink/lib/services/chat_service.dart`.

**The field does nothing on its own.** Firestore only deletes by it once a TTL
policy names that field, and a policy is per-project configuration — it cannot
live in `firestore.rules`. Until it is created, notifications accumulate
forever and the field is inert.

## Creating the policy

Console: **Firestore → TTL → Create policy**, collection group `notifications`,
timestamp field `expiresAt`.

Or with gcloud:

```bash
gcloud firestore fields ttls update expiresAt --collection-group=notifications --enable-ttl --project=ssp-pep
```

Confirm it afterwards:

```bash
gcloud firestore fields ttls list --project=ssp-pep
```

## What to expect

- Deletion is a background process. Firestore deletes "within 24 hours" of
  expiry, not on the stroke — do not build anything that depends on precise
  timing.
- Deletes count as normal document deletes for billing.
- Documents written before this change have no `expiresAt` and will never
  expire. Either leave them (they age out of the 60-document read window
  anyway) or backfill once:

  ```js
  // one-off, via the Admin SDK
  const cutoff = Date.now() + 90 * 86400000;
  const snap = await db.collection("notifications").get();
  const missing = snap.docs.filter((d) => !d.data().expiresAt);
  for (let i = 0; i < missing.length; i += 450) {
    const batch = db.batch();
    missing.slice(i, i + 450).forEach((d) =>
      batch.update(d.ref, { expiresAt: new Date(cutoff) }));
    await batch.commit();
  }
  ```

## Why 90 days

Long enough that a parent returning after a school holiday still sees the term's
history, short enough that the collection does not grow without bound. A school
of 800 students generates roughly 800 documents per school-wide announcement, so
the cap matters more than it looks. Change `NOTIFICATION_TTL_DAYS` and the Dart
constant together if you revise it — the policy itself needs no change.
