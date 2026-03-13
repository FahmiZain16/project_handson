// api/get-detail.js
// Mengambil detail 1 koleksi berdasarkan ?id=, dengan cache per-item di Redis

import { createClient } from "@supabase/supabase-js";
import { createClient as createRedis } from "redis";

const CACHE_TTL = 120; // detik (2 menit)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: "Parameter id wajib diisi" });
  }

  const CACHE_KEY = `koleksi:detail:${id}`;
  let redis;

  try {
    // ── 1. Coba cache Redis ───────────────────────────────────
    redis = createRedis({ url: process.env.REDIS_URL });
    await redis.connect();

    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      console.log(`[get-detail] Cache HIT untuk id=${id}`);
      await redis.disconnect();
      return res.status(200).json(JSON.parse(cached));
    }

    // ── 2. Cache MISS — query Supabase ────────────────────────
    console.log(`[get-detail] Cache MISS — query Supabase id=${id}`);
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );

    const { data, error } = await supabase
      .from("koleksi")
      .select("id, judul, pencipta, tahun, harga, path")
      .eq("id", id)
      .single();

    if (error) throw error;
    if (!data)
      return res.status(404).json({ error: "Koleksi tidak ditemukan" });

    // ── 3. Simpan ke Redis ────────────────────────────────────
    await redis.setEx(CACHE_KEY, CACHE_TTL, JSON.stringify(data));
    await redis.disconnect();

    return res.status(200).json(data);
  } catch (err) {
    console.error("[get-detail] Error:", err.message);
    if (redis?.isOpen) await redis.disconnect();
    return res.status(500).json({ error: err.message });
  }
}
