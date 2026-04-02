/**
 * WatchPost — UniFi Protect Spike
 * Tests connectivity, auth, camera enumeration, and real-time event streaming.
 */

import { ProtectApi } from "unifi-protect";

const HOST = process.env.PROTECT_HOST || "10.1.1.238";
const USERNAME = process.env.PROTECT_USERNAME || "darren";
const PASSWORD = process.env.PROTECT_PASSWORD;

if (!PASSWORD) { console.error("Set PROTECT_PASSWORD env var"); process.exit(1); }

let motionCount = 0;
let detectCount = 0;
let snapshotCount = 0;

async function main() {
  console.log(`\n🔌 Connecting to UniFi Protect at ${HOST}...`);

  const api = new ProtectApi();

  const loginOk = await api.login(HOST, USERNAME, PASSWORD);
  if (!loginOk) {
    console.error("❌ Login failed");
    process.exit(1);
  }
  console.log("✅ Logged in");

  const bootstrapped = await api.bootstrapController();
  if (!bootstrapped) {
    console.error("❌ Bootstrap failed");
    process.exit(1);
  }

  const bs = api.bootstrap;
  console.log(`\n✅ Controller: ${bs?.nvr?.name ?? "unknown"} — Protect ${bs?.nvr?.firmwareVersion ?? "?"}`);

  const cameras = bs?.cameras ?? [];
  console.log(`\n📷 Cameras (${cameras.length}):`);
  for (const cam of cameras) {
    console.log(`   [${cam.id}] ${cam.name} — ${cam.type} — ${cam.state} — ${cam.isConnected ? "online" : "offline"}`);
  }

  if (cameras.length === 0) {
    console.log("   (no cameras found — check Protect admin role)");
  }

  console.log(`\n👀 Listening for events for 60 seconds...\n`);

  // Subscribe to realtime events
  api.on("message", async (event) => {
    const ts = new Date().toLocaleTimeString();
    const cam = cameras.find(c => c.id === event.id) ?? { name: event.id ?? "unknown" };

    if (event.type === "motion") {
      motionCount++;
      console.log(`[MOTION]   ${ts} | ${cam.name}`);
    }

    if (event.type === "smartDetectZone" || event.type === "smartDetect") {
      detectCount++;
      const types = event.smartDetectTypes?.join(", ") ?? "unknown";
      console.log(`[DETECT]   ${ts} | ${cam.name} | ${types} | ${event.id}`);

      try {
        const snap = await api.getSnapshot(event.id);
        if (snap) {
          const { writeFile } = await import("fs/promises");
          const path = `/tmp/watchpost-snap-${event.id}.jpg`;
          await writeFile(path, snap);
          snapshotCount++;
          console.log(`[SNAPSHOT] ${path} (${snap.length} bytes)`);
        }
      } catch (e) {
        console.log(`[SNAPSHOT] Failed: ${e.message}`);
      }
    }
  });

  await api.launchEventsWs();
  console.log("📡 WebSocket connected — watching for events...");

  await new Promise(resolve => setTimeout(resolve, 60000));

  console.log(`\n📊 Summary (60s):`);
  console.log(`   Motion events:    ${motionCount}`);
  console.log(`   Smart detections: ${detectCount}`);
  console.log(`   Snapshots saved:  ${snapshotCount}`);
  console.log(`\n✅ Spike complete.\n`);
  process.exit(0);
}

main().catch(err => {
  console.error("❌ Fatal:", err.message);
  process.exit(1);
});
