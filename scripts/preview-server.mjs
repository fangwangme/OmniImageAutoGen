import path from "node:path";

// Development-only HTTP preview for the extension's built module scripts.
const root = path.resolve(import.meta.dir, "../.local/dist");
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT || 4173),
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url).pathname); }
    catch { return new Response("Invalid path", { status: 400 }); }
    const filename = path.join(root, pathname === "/" ? "sidepanel.html" : pathname);
    if (filename !== root && !filename.startsWith(root + path.sep)) {
      return new Response("Forbidden", { status: 403 });
    }
    const file = Bun.file(filename);
    if (!await file.exists()) return new Response("Not found", { status: 404 });
    return new Response(request.method === "HEAD" ? null : file, { headers: { "Content-Type": file.type, "Cache-Control": "no-store" } });
  }
});
console.log(`UI preview: http://${server.hostname}:${server.port}/sidepanel.html?preview=setup`);
