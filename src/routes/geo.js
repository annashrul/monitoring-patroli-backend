import { Router } from 'express';

const router = Router();

const GOOGLE_KEY = 'AIzaSyDqD1Z03FoLnIGJTbpAgRvjcchrR-NiICk';

// GET /api/geo/autocomplete?q=...
router.get('/autocomplete', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ message: 'q diperlukan' });
  try {
    const r = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&key=${GOOGLE_KEY}&components=country:id&language=id`
    );
    const data = await r.json();
    const predictions = (data.predictions || []).slice(0, 50);
    const results = await Promise.all(
      predictions.map(async (p) => {
        try {
          const d = await fetch(
            `https://maps.googleapis.com/maps/api/place/details/json?place_id=${p.place_id}&key=${GOOGLE_KEY}&fields=geometry`
          );
          const dd = await d.json();
          const loc = dd.result?.geometry?.location;
          return { display_name: p.description, lat: loc?.lat, lng: loc?.lng };
        } catch {
          return null;
        }
      })
    );
    res.json({ data: results.filter((r) => r && r.lat != null && r.lng != null) });
  } catch (e) {
    res.status(500).json({ message: 'Gagal mencari lokasi' });
  }
});

export default router;
