import { strict as assert } from "node:assert";
import { createServer } from "node:net";
import { request } from "node:https";
import { pinnedAgentLookup } from "../src/lib/agent-acquisition.server";
// Real Node HTTPS connection: the loopback fixture intentionally closes before TLS.
// No TLS verification is disabled and no external source or credential is involved.
let connected = false;
const server = createServer((socket) => {
  connected = true;
  socket.destroy();
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const address = server.address();
  assert(address && typeof address === "object");
  const code = await new Promise<string>((resolve) => {
    const req = request(`https://fixture.invalid:${address.port}`, {
      lookup: pinnedAgentLookup("127.0.0.1"),
    });
    const timer = setTimeout(() => req.destroy(Error("test timeout")), 3000);
    req.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      resolve(error.code ?? "unknown");
    });
    req.end();
  });
  assert(connected, "Node HTTPS never reached the pinned fixture address");
  assert.notEqual(code, "ERR_INVALID_IP_ADDRESS");
  console.log(
    "PASS real Node HTTPS pinned lookup: connection reached fixture; invalid-IP regression absent",
  );
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
