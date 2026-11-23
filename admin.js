// Admin-only: view reports (with the reported person's NID) and restore hidden listings.
const express = require('express');
const db = require('./db');
const { requireAdmin } = require('./middleware');

const router = express.Router();
router.use('/admin', requireAdmin);

router.get('/admin/reports', (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.id, r.reason, r.created_at,
              rep.name AS reporter_name, rep.phone AS reporter_phone,
              acc.id AS accused_id, acc.name AS accused_name, acc.phone AS accused_phone, acc.nid AS accused_nid,
              (SELECT COUNT(*) FROM reports x WHERE x.reported_user_id = acc.id) AS accused_total_reports,
              i.id AS item_id, i.category, i.status AS item_status
       FROM reports r
       JOIN users rep ON rep.id = r.reporter_id
       JOIN users acc ON acc.id = r.reported_user_id
       JOIN claims c ON c.id = r.claim_id
       JOIN items i ON i.id = c.item_id
       ORDER BY r.id DESC`
    )
    .all();
  res.json(rows);
});

// Users with at least one report against them, worst first.
router.get('/admin/users', (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.phone, u.nid, u.created_at,
              COUNT(r.id) AS reports_against
       FROM users u JOIN reports r ON r.reported_user_id = u.id
       GROUP BY u.id
       ORDER BY reports_against DESC, u.id`
    )
    .all();
  res.json(rows);
});

// Put a flagged listing back on the public list (after the admin decides the finder was fine).
router.post('/admin/items/:id/restore', (req, res) => {
  const result = db
    .prepare("UPDATE items SET status = 'available' WHERE id = ? AND status = 'flagged'")
    .run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: 'No flagged item with that id' });
  res.json({ message: 'Listing restored' });
});

module.exports = router;
