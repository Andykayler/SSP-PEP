import { adminAuth } from "../../src/lib/firebaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: "UID required" });

  try {
    await adminAuth.deleteUser(uid);
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}