Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    // Aceita tanto o token configurado no Deno.env quanto o fallback fixo solicitado pelo usuário para segurança máxima
    const metaVerifyToken = Deno.env.get("META_VERIFY_TOKEN") || "viva_destinos_webhook_2026";

    if (mode === "subscribe" && (token === metaVerifyToken || token === "viva_destinos_webhook_2026")) {
      return new Response(challenge ?? "", {
        status: 200,
        headers: {
          "Content-Type": "text/plain"
        }
      });
    }

    return new Response("Forbidden", {
      status: 403
    });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null);

    console.log("Webhook Meta recebido:", JSON.stringify(body));

    return new Response("EVENT_RECEIVED", {
      status: 200,
      headers: {
        "Content-Type": "text/plain"
      }
    });
  }

  return new Response("Method not allowed", {
    status: 405
  });
});
