// api/fortune.js — Serverless Function
export default async function handler(req, res) {
  const fortunes = [
    "Semboyan pertama",
    "Semboyan keduax!",
    "Kata-kata hari ini?",
  ];

  const randomFortune = fortunes[Math.floor(Math.random() * fortunes.length)];

  return res.status(200).json({
    source: "Serverless Function",
    fortune: randomFortune,
  });
}
