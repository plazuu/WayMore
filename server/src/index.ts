import "dotenv/config";
import os from "node:os";
import { createApp } from "./app";

const app = createApp();

const port = Number(process.env.PORT) || 3000;
// 0.0.0.0 so a phone on the same Wi-Fi (or a cloudflared tunnel) can reach it.
app.listen(port, "0.0.0.0", () => {
  console.log(`server listening on port ${port}`);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) console.log(`  on your LAN: http://${a.address}:${port}`);
    }
  }
});
