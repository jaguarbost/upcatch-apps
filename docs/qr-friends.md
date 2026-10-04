# QR friends

Authenticated members with completed profiles can add friends through **My code** and **Scan** in their profile or meetup screen. No shared meetup, arrival, location permission, matching allowance, or same-city requirement applies.

**My code** displays a random code that expires after 60 seconds and refreshes while the sheet is open. **Scan** opens the scanner. Tap **Allow camera** to request browser permission; it uses the rear-facing camera when available and decodes UpCatch friend codes locally. Finding a code shows the real account; **Add** sends a request. The code owner confirms on **My code** before both friend lists update. Requests expire after five minutes. Duplicate requests and confirmations cannot create duplicate friendships.

Scanning requires HTTPS or localhost and a camera-capable browser. The camera stops on closing the sheet, changing tabs, finding a valid code, or hiding the browser tab. Camera permission errors offer a retry.

Migration `202609271001_independent_qr_friends.sql` updates the QR RPC and removes profile-row sharing policies. Photos remain in private Storage and are served by `/api/friend-photo` after checking a valid scanned code, an active request, or an existing friendship. Blocked, suspended, unconfirmed, and incomplete accounts cannot be added. Demo QR screens remain separate from real account state.

To apply this migration alone, use `node scripts/apply-qr-migration.mjs`. It uses the ignored `SUPABASE_DB_URL` and records the migration checksum in the existing migration history. General migration commands can still apply it in version order.
