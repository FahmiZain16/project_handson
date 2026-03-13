// api/get-koleksi.js
// Serverless function — GET /api/get-koleksi
// Mengembalikan daftar koleksi (id, judul, thumbnail_url, tipe)
// Data Supabase di-cache di Redis selama 5 menit

const { createClient } = require("@supabase/supabase-js");
const Redis = require("ioredis");

// ── Konstanta ──────────────────────────────────────
const CACHE_KEY = "koleksi:semua";
const CACHE_TTL = 300; // 5 menit

// ── Singleton clients (bertahan antar invokasi warm) ──
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

function getRedis() {
  if (!_redis) {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    _redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => (times > 2 ? null : times * 100),
    });
    _redis.on("error", (e) => console.warn("[Redis] error:", e.message));
  }
  return _redis;
}

// ── Handler ────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Backend tidak di-cache di browser / CDN
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");

  // 1. Cek Redis cache
  let koleksi = null;
  let cacheHit = false;
  try {
    const redis = getRedis();
    const raw = await redis.get(CACHE_KEY);
    if (raw) {
      koleksi = JSON.parse(raw);
      cacheHit = true;
    }
  } catch (e) {
    console.warn(
      "[get-koleksi] Redis get gagal, lanjut ke Supabase:",
      e.message,
    );
  }

  // 2. Jika miss → ambil dari Supabase
  if (!koleksi) {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("koleksi")
        .select("id, judul, thumbnail_url, tipe")
        .order("created_at", { ascending: false });

      if (error) throw error;
      koleksi = data;

      // 3. Simpan ke Redis
      try {
        const redis = getRedis();
        await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(koleksi));
      } catch (e) {
        console.warn("[get-koleksi] Redis set gagal:", e.message);
      }
    } catch (e) {
      console.error("[get-koleksi] Supabase error:", e.message);
      return res
        .status(500)
        .json({ success: false, error: "Gagal mengambil data koleksi" });
    }
  }

  return res.status(200).json({
    success: true,
    cache: cacheHit ? "HIT" : "MISS",
    count: koleksi.length,
    data: koleksi,
  });
};
