// Thumbs up / down from the budget assistant. Written to the Cloudflare logs
// (Workers & Pages → your project → Logs), so you can see which answers fail.
export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return new Response(null, { status: 403 });
  // same burst limit as the chat: a few votes are fine, a flood is not
  if (env?.CHAT_BURST) {
    try {
      const { success } = await env.CHAT_BURST.limit({ key: "fb:" + (request.headers.get("cf-connecting-ip") || "unknown") });
      if (!success) return new Response(null, { status: 429 });
    } catch {}
  }
  try {
    const b = await request.json();
    if (b.vote === "up" || b.vote === "down") {
      console.log(JSON.stringify({
        type: "chat-feedback",
        vote: b.vote,
        question: String(b.question || "").slice(0, 500),
        answer: String(b.answer || "").slice(0, 2000),
      }));
    }
  } catch {
    /* ignore bad input */
  }
  return new Response(null, { status: 204 });
}
