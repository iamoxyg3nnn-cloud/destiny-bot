# GitHub Actions Incident Report — Destiny Bot Runner

**Analysed:** 2026-11-10 (covering "yesterday" = 2026-11-09)
**Repo:** `apunabhibhilegendhai/destiny-bot`
**Workflow:** `.github/workflows/destiny.yml` (id `411270252`)

---

## 1. The failing run on Nov 9 — NOT your code

**Run `42672531403`** · `workflow_dispatch` · created `2026-11-09T18:16:04Z` · failed `18:16:59Z` (55s lifetime)

| Signal | Value |
|---|---|
| Jobs created | **0** |
| Log bytes | **0** (empty zip) |
| Check runs in suite | **0** |
| GitHub's verdict | *"This run likely failed because of a workflow file issue."* |
| Triggered by | `github-actions[bot]` (the `Chain Next Session` step of run `42617569541`) |

### Root cause: GitHub's own incident

From `githubstatus.com`, a **critical** incident was open at exactly that moment:

```
18:12:37Z  incident opened: "Incident with Actions and Checks API"  (critical)
18:14:58Z  "Actions is experiencing degraded availability"
18:16:04Z  run 42672531403 CREATED   <-- inside the degradation window
18:16:59Z  run 42672531403 FAILED    <-- inside the degradation window
18:24:13Z  "elevated errors affecting GitHub Actions and the Checks API"
18:43:24Z  degradation mitigated
18:59:32Z  incident RESOLVED
```

A run that fails with **zero jobs and zero log bytes** never reached a runner — it was
rejected by the Actions control plane while that incident was active.

### Proof it is not the workflow file

- The deployed `destiny.yml` at the run's SHA (`e4c324e`) is **byte-identical** to the
  local file (5145 bytes, `diff` empty).
- It **parses as valid YAML** (PyYAML): 9 steps, `jobs: [run-bot]`, `on:` with
  `push`/`workflow_dispatch`/`schedule` intact.
- The **same SHA** produced healthy runs before and after the incident
  (`42617569541` at 12:30, `42688462264` at 19:58, `42754720091` currently running).
- The two Nov 8 failures are a **different, genuine** shape:
  - `42498386675` — 0 jobs, **0s** lifetime, actor `apunabhibhilegendhai` → real
    YAML syntax error in the workflow at that commit (fixed in `3485f02a`/`2cd0a16a`).
  - `42498521352` — 1 job, 32s, failed at a step → real build/install failure.

**Conclusion: nothing to fix in the workflow file. This was upstream.**

---

## 2. The real recurring problem: exit 137 on every session boundary

### What the logs show

**Run `42711956362`** (Nov 9 22:27 → Nov 10 04:15):

```
04:12:40.049  🛑 Received SIGINT. Gracefully stopping Destiny Ecosystem...
04:12:40.056  ##[warning]Destiny bot exited with status 137; waiting 3m before triggering recovery...
```

**Run `42617569541`** (Nov 9 12:31 → 18:16) — healthy comparison:

```
18:16:00.489  🛑 Received SIGINT. Gracefully stopping Destiny Ecosystem...
18:16:00.491   ELIFECYCLE  Command failed.
18:16:00.500  ##[notice]Session window ended cleanly after 345m; chaining next session...
```

### Interpretation

The workflow runs:

```bash
timeout --signal=INT --kill-after=90s "${seconds}s" pnpm start
```

- `rc == 124` → `timeout` expired normally → **"Session window ended cleanly"** ✅
- `rc == 137` → the child was **SIGKILLed** (128 + 9) → **"exited with status 137"** ❌

The 137 run spent **348 minutes** in the session step (345 target + the 3-minute
`sleep 180` recovery) vs **345.00 minutes** for the clean run. The 3 extra minutes
are the recovery sleep, confirming the non-124 path was taken.

**In the 137 run there is no `ELIFECYCLE Command failed.` line at all** — the process
tree died hard (SIGKILL) rather than exiting. `pnpm start` → `tsx src/index.ts` means
`timeout` signals the *`pnpm`* process, and `pnpm` spawns `tsx` as a child. The Node
process **does** receive SIGINT (we see its own log line), but the process group is torn
down by the runner's orphan reaper rather than exiting cleanly.

### Why the shutdown hangs

`src/index.ts:34-46`:

```ts
const handleShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Gracefully stopping Destiny Ecosystem...`);
  try {
    if (bot.client) {
      await bot.client.destroy();   // <-- can hang on a live gateway socket
    }
    server.close();                 // <-- NOT awaited, keeps sockets alive
  } catch {}
  process.exit(0);                  // <-- never reached if destroy() hangs
};
```

Three problems:

1. **`await bot.client.destroy()`** can hang indefinitely on an open Discord gateway
   websocket. `process.exit(0)` sits *after* it, so a hang means no clean exit.
2. **`server.close()` is not awaited** and the HTTP server has no `closeAllConnections()`,
   so keep-alive sockets keep the event loop alive.
3. **The workers are never stopped.** `matchmakingWorker.stop()`,
   `notificationWorker.stop()` and `cleanupWorker.stop()` all exist
   (`src/workers/*.ts`) but are **never called** from `handleShutdown`. Their
   `setInterval` timers and BullMQ `Worker` connections keep the event loop alive
   forever, so even a completed `destroy()` would not let Node exit on its own.

Because `timeout --kill-after=90s` escalates to SIGKILL, the run always ends in 137
and then adds a wasted 3-minute `sleep 180` before chaining the next session.

---

## 3. Why nearly every run says "cancelled"

The `concurrency` block is:

```yaml
concurrency:
  group: destiny-bot-runner
  cancel-in-progress: true
```

`Chain Next Session` dispatches a *new* run into the **same concurrency group** with
`cancel-in-progress: true`, so the new run **immediately cancels the one that just
dispatched it**. Annotations confirm it:

```
[notice] .github:108  Session window ended cleanly after 345m; chaining next session...
[failure] .github:1   Canceling since a higher priority waiting request for destiny-bot-runner exists
```

This is why the history reads as `cancelled` almost everywhere — it is **self-inflicted
by the chaining design**, not a crash. The bot is running fine; it just keeps replacing
itself. Only two runs were genuinely `failure`, both explained above.

---

## 4. Recommended fixes

### Fix A — make shutdown deterministic (removes the 137 + the 3-minute stall)

`src/index.ts`:

```ts
const handleShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Gracefully stopping Destiny Ecosystem...`);
  const forceExit = setTimeout(() => process.exit(0), 15_000);
  forceExit.unref();
  try {
    matchmakingWorker.stop();
    notificationWorker.stop();
    cleanupWorker.stop();
    await bot.client?.destroy();
    server.closeAllConnections?.();
    server.close();
  } catch {}
  process.exit(0);
};
```

- Stop the workers so their intervals/BullMQ sockets release the event loop.
- `closeAllConnections()` releases keep-alive HTTP sockets.
- A 15s watchdog guarantees exit well inside `timeout`'s 90s `--kill-after`, so `rc`
  becomes `0` instead of `137`.

### Fix B — stop the chain from cancelling itself

Give the chained successor a **different concurrency group** than the running job, e.g.
key the group on the trigger:

```yaml
concurrency:
  group: destiny-bot-runner-${{ github.event_name }}
```

so `Chain Next Session` cannot cancel the run that spawned it. Alternatively, drop
`cancel-in-progress: true` and rely on the `queued` check already present in the
chain step.

### Fix C — treat 137 as a normal boundary, not an error

In the session step, accept `137` alongside `124`/`0` so the chain proceeds immediately
without the 3-minute `sleep 180`:

```bash
if [ "${rc}" -eq 124 ] || [ "${rc}" -eq 0 ] || [ "${rc}" -eq 137 ]; then
  echo "::notice::Session window ended (rc=${rc}); chaining next session..."
  exit 0
fi
```

Fix A is the real remedy; C is belt-and-braces.

---

## 5. Verification performed

| Check | Result |
|---|---|
| Deployed `destiny.yml` @ `e4c324e` vs local | byte-identical, 5145 bytes |
| YAML parse of deployed file | valid — 9 steps, all triggers intact |
| Jobs created by failed run | 0 (never reached a runner) |
| Logs for failed run | 0 bytes |
| GitHub status API, Nov 9 | critical "Incident with Actions and Checks API" 18:12:37Z → 18:59:32Z |
| Same-SHA runs before/after incident | healthy |
| Exit codes at session boundary | 124 (clean) and 137 (SIGKILL) observed |
| 137 run session-step duration | 348.00m vs 345.00m for the clean run |
| `ELIFECYCLE` line present | yes in the 124 run, **absent** in the 137 run |
| Worker `stop()` methods called from shutdown | **never** — confirmed by grep |
