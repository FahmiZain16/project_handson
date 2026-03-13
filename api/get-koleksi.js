// api/get-koleksi.js
// Mengambil semua koleksi dari Supabase, dengan cache di Redis

import { createClient } from "@supabase/supabase-js";
import { createClient as createRedis } from "redis";

const CACHE_KEY = "koleksi:all";
const CACHE_TTL = 60; // detik — sesuaikan selera (60 detik)

export default async function handler(req, res) {
  // CORS untuk dev lokal
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  let redis;
  try {
    // ── 1. Coba ambil dari Redis cache ────────────────────────
    redis = createRedis({ url: process.env.REDIS_URL });
    await redis.connect();

    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      console.log("[get-koleksi] Cache HIT");
      await redis.disconnect();
      return res.status(200).json(JSON.parse(cached));
    }

    // ── 2. Cache MISS — ambil dari Supabase ───────────────────
    console.log("[get-koleksi] Cache MISS — query Supabase");
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );

    const { data, error } = await supabase
      .from("koleksi")
      .select("id, judul, pencipta, tahun, harga, path")
      .order("id", { ascending: true });

    if (error) throw error;

    // ── 3. Simpan ke Redis ────────────────────────────────────
    await redis.setEx(CACHE_KEY, CACHE_TTL, JSON.stringify(data));
    await redis.disconnect();

    return res.status(200).json(data);
  } catch (err) {
    console.error("[get-koleksi] Error:", err.message);
    if (redis?.isOpen) await redis.disconnect();
    return res.status(500).json({ error: err.message });
  }
}
