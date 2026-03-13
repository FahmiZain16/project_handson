// api/fortune-edge.js — Edge Function
export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  const fortunes = [
    "Edge: Semboyan pertama",
    "Edge: Semboyan keduax!",
    "Edge: Kata-kata hari ini?",
  ];

  const randomFortune = fortunes[Math.floor(Math.random() * fortunes.length)];

  return new Response(
    JSON.stringify({
      source: "Vercel Edge Real",
      fortune: randomFortune,
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    },
  );
}
