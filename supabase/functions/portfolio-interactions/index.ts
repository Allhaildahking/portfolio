import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  let serviceKey: string | undefined;
  try {
    serviceKey = secretKeysRaw ? JSON.parse(secretKeysRaw).default : undefined;
  } catch {
    serviceKey = undefined;
  }
  const ipSecret = Deno.env.get("IP_HASH_SECRET");
  if (!supabaseUrl || !serviceKey || !ipSecret) {
    return json({ ok: false, error: "Server configuration is incomplete." }, 500);
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const payload = await request.json();
    const action = String(payload.action || "");
    const visitorId = String(payload.visitorId || "");
    const postId = String(payload.postId || "");
    const allowedPostIds = new Set(Array.from({ length: 30 }, (_, i) =>
      `home-post-${String(i + 1).padStart(2, "0")}`
    ));

    if (!/^[0-9a-f-]{36}$/i.test(visitorId)) return json({ ok: false, error: "Invalid visitor." }, 400);
    if (action !== "summary" && action !== "views" && !allowedPostIds.has(postId)) {
      return json({ ok: false, error: "Unknown post." }, 400);
    }

    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const connecting = request.headers.get("cf-connecting-ip")?.trim();
    const rawIp = connecting || forwarded || "unknown";
    const [visitorHash, ipHash] = await Promise.all([
      sha256(`visitor:${visitorId}:${ipSecret}`),
      sha256(`ip:${rawIp}:${ipSecret}`),
    ]);

    const consumeLimit = async (name: string, limit: number, seconds: number) => {
      const { data, error } = await db.rpc("consume_portfolio_rate_limit", {
        p_ip_hash: ipHash,
        p_action: name,
        p_limit: limit,
        p_window_seconds: seconds,
      });
      if (error) throw error;
      return data === true;
    };

    if (action === "summary") {
      const ids: string[] = Array.isArray(payload.postIds)
        ? payload.postIds.filter((id: unknown): id is string => typeof id === "string" && allowedPostIds.has(id)).slice(0, 30)
        : [];
      const summaryAllowed = await consumeLimit("summary", 120, 3600);
      if (!summaryAllowed) return json({ ok: false, error: "Rate limit reached." }, 429);
      const { data, error } = await db.rpc("get_portfolio_summary", {
        p_post_ids: ids,
        p_visitor_hash: visitorHash,
      });
      if (error) throw error;
      return json({ ok: true, ...(data || { posts: {}, activity: [] }) });
    }

    if (action === "views") {
      const ids: string[] = Array.isArray(payload.postIds)
        ? payload.postIds.filter((id: unknown): id is string => typeof id === "string" && allowedPostIds.has(id)).slice(0, 30)
        : [];
      if (!ids.length) return json({ ok: true });
      const allowed = await consumeLimit("views", 1200, 3600);
      if (!allowed) return json({ ok: false, error: "Rate limit reached." }, 429);
      const rows = ids.map((id) => ({
        post_id: id,
        visitor_hash: visitorHash,
        ip_hash: ipHash,
      }));
      const { error } = await db.from("portfolio_views").upsert(
        rows,
        { onConflict: "post_id,visitor_hash", ignoreDuplicates: true },
      );
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "like") {
      const allowed = await consumeLimit("like", 60, 3600);
      if (!allowed) return json({ ok: false, error: "Rate limit reached." }, 429);
      const { data: existing, error: findError } = await db
        .from("portfolio_likes")
        .select("id")
        .eq("post_id", postId)
        .eq("visitor_hash", visitorHash)
        .maybeSingle();
      if (findError) throw findError;
      if (existing) {
        const { error } = await db.from("portfolio_likes").delete().eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("portfolio_likes").insert({
          post_id: postId, visitor_hash: visitorHash, ip_hash: ipHash,
        });
        if (error && error.code !== "23505") throw error;
      }
      return json({ ok: true, changed: true });
    }

    if (action === "comment") {
      const displayName = String(payload.displayName || "").trim().replace(/\s+/g, " ");
      const body = String(payload.body || "").trim();
      if (displayName.length < 2 || displayName.length > 32 || body.length < 2 || body.length > 500) {
        return json({ ok: false, error: "Name or comment length is invalid." }, 400);
      }
      if (/[<>]/.test(displayName)) return json({ ok: false, error: "Please use a simple display name." }, 400);
      const allowed = await consumeLimit("comment", 3, 86400);
      if (!allowed) return json({ ok: false, error: "Comment rate limit reached." }, 429);
      const { error } = await db.from("portfolio_comments").insert({
        post_id: postId,
        visitor_hash: visitorHash,
        ip_hash: ipHash,
        display_name: displayName,
        body,
        status: "pending",
      });
      if (error) throw error;
      return json({ ok: true, pending: true });
    }

    return json({ ok: false, error: "Unknown action." }, 400);
  } catch (error) {
    console.error("portfolio-interactions:", error);
    return json({ ok: false, error: "The interaction could not be completed." }, 500);
  }
});
