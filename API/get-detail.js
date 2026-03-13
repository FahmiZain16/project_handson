// api/get-detail.js
// Serverless function — GET /api/get-detail?id=<uuid>
// Mengembalikan detail lengkap satu koleksi
// Data Supabase di-cache di Redis selama 10 menit per ID

import { createClient } from "@supabase/supabase-js";
import { createClient as createRedisClient } from "redis";

// ── Konstanta ──────────────────────────────────────
const CACHE_TTL = 600; // 10 menit

// ── Singleton clients ──────────────────────────────
let _supabase = null;
let _redis = null;

function getSupabase() {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key)
      throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY belum diset");
    _supabase = createClient(url, key);
  }
  return _supabase;
}

async function getRedis() {
  if (!_redis) {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    _redis = createRedisClient({ url: redisUrl });
    _redis.on("error", (e) => console.warn("[Redis] error:", e.message));
    await _redis.connect();
  }
  return _redis;
}

// ── Handler ────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Backend tidak di-cache
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");

  // Validasi query param ?id=
  const { id } = req.query;
  if (!id) {
    return res
      .status(400)
      .json({ success: false, error: "Parameter 'id' diperlukan" });
  }
  // Sanitasi: hanya alfanumerik + dash (UUID safe)
  if (!/^[\w-]{1,100}$/.test(id)) {
    return res
      .status(400)
      .json({ success: false, error: "Format id tidak valid" });
  }

  const CACHE_KEY = `detail:${id}`;

  // 1. Cek Redis
  let detail = null;
  let cacheHit = false;
  try {
    const redis = await getRedis();
    const raw = await redis.get(CACHE_KEY);
    if (raw) {
      detail = JSON.parse(raw);
      cacheHit = true;
    }
  } catch (e) {
    console.warn("[get-detail] Redis get gagal:", e.message);
  }

  // 2. Miss → ambil dari Supabase
  if (!detail) {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("koleksi")
        .select("id, judul, tipe, path, pencipta, tahun, harga, deskripsi")
        .eq("id", id)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // Row not found
          return res
            .status(404)
            .json({ success: false, error: "Koleksi tidak ditemukan" });
        }
        throw error;
      }
      detail = data;

      // 3. Simpan ke Redis
      try {
        const redis = await getRedis();
        await redis.setEx(CACHE_KEY, CACHE_TTL, JSON.stringify(detail));
      } catch (e) {
        console.warn("[get-detail] Redis set gagal:", e.message);
      }
    } catch (e) {
      console.error("[get-detail] Supabase error:", e.message);
      return res
        .status(500)
        .json({ success: false, error: "Gagal mengambil detail koleksi" });
    }
  }

  return res.status(200).json({
    success: true,
    cache: cacheHit ? "HIT" : "MISS",
    data: detail,
  });
}
