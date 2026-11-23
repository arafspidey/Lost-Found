// Claiming an item, approving/rejecting claims, handover, and no-show reports.
const express = require('express');
const db = require('./db');
const { requireLogin } = require('./middleware');
const { locationJoin, locationColumn, CONTACT_VISIBLE } = require('./helpers');

const router = express.Router();

// ---------- Loser claims an item by answering the verification question ----------
// The answer is NOT checked by the computer. It goes to the finder, who reads it and decides.
router.post('/items/:id/claims', requireLogin, (req, res) => {
  const itemId = Number(req.params.id);
  const userId = req.session.userId;
  const answer = String(req.body.answer || '').trim();

  const item = db.prepare('SELECT finder_id, status FROM items WHERE id = ?').get(itemId);
  if (!item || item.status !== 'available') {
    return res.status(404).json({ error: 'This item is not available' });
  }
  if (item.finder_id === userId) {
    return res.status(400).json({ error: 'You cannot claim your own listing' });
  }
  if (answer.length < 3 || answer.length > 500) {
    return res.status(400).json({ error: 'Describe your answer in 3-500 characters' });
  }

  try {
    db.prepare('INSERT INTO claims (item_id, claimant_id, answer) VALUES (?, ?, ?)').run(
      itemId,
      userId,
      answer
    );
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'You have already submitted a claim for this item' });
    }
    throw err;
  }
  res.status(201).json({ message: 'Claim sent. The finder will read your answer and decide.' });
});

// ---------- Finder's dashboard: my items with the claims on them ----------
router.get('/my/items', requireLogin, (req, res) => {
  const userId = req.session.userId;
  const items = db
    .prepare(
      `SELECT i.id, i.category, i.description, i.photo, i.status, i.created_at,
              i.secret_question, i.secret_answer, ${locationColumn}
       FROM items i ${locationJoin}
       WHERE i.finder_id = ? AND i.status != 'removed'
       ORDER BY i.id DESC`
    )
    .all(userId);

  const claimsFor = db.prepare(
    `SELECT c.id, c.answer, c.status, c.created_at,
            u.name AS claimant_name, u.phone AS claimant_phone,
            (SELECT COUNT(*) FROM reports r WHERE r.claim_id = c.id AND r.reporter_id = ?) AS reported_by_me
     FROM claims c JOIN users u ON u.id = c.claimant_id
     WHERE c.item_id = ? ORDER BY c.id DESC`
  );

  res.json(
    items.map((item) => ({
      ...item,
      photo_url: item.photo ? '/uploads/' + item.photo : null,
      photo: undefined,
      claims: claimsFor.all(userId, item.id).map((c) => ({
        id: c.id,
        answer: c.answer,
        status: c.status,
        created_at: c.created_at,
        claimant_name: c.claimant_name,
        claimant_phone: CONTACT_VISIBLE.includes(c.status) ? c.claimant_phone : null,
        reported_by_me: c.reported_by_me > 0,
      })),
    }))
  );
});

// ---------- Loser's dashboard: the claims I made ----------
router.get('/my/claims', requireLogin, (req, res) => {
  const userId = req.session.userId;
  const rows = db
    .prepare(
      `SELECT c.id, c.status, c.created_at,
              i.id AS item_id, i.category, i.description, i.photo, i.status AS item_status,
              ${locationColumn}, f.name AS finder_name, f.phone AS finder_phone,
              (SELECT COUNT(*) FROM reports r WHERE r.claim_id = c.id AND r.reporter_id = ?) AS reported_by_me
       FROM claims c
       JOIN items i ON i.id = c.item_id
       ${locationJoin}
       JOIN users f ON f.id = i.finder_id
       WHERE c.claimant_id = ?
       ORDER BY c.id DESC`
    )
    .all(userId, userId);

  res.json(
    rows.map((r) => ({
      id: r.id,
      status: r.status,
      created_at: r.created_at,
      item_id: r.item_id,
      category: r.category,
      description: r.description,
      photo_url: r.photo ? '/uploads/' + r.photo : null,
      item_status: r.item_status,
      location: r.location,
      finder_name: r.finder_name,
      finder_phone: CONTACT_VISIBLE.includes(r.status) ? r.finder_phone : null,
      reported_by_me: r.reported_by_me > 0,
    }))
  );
});

// Loads a claim plus who the finder is, or replies 404.
function loadClaim(req, res) {
  const claim = db
    .prepare(
      `SELECT c.id, c.item_id, c.claimant_id, c.status, i.finder_id, i.status AS item_status
       FROM claims c JOIN items i ON i.id = c.item_id WHERE c.id = ?`
    )
    .get(Number(req.params.id));
  if (!claim) {
    res.status(404).json({ error: 'Claim not found' });
    return null;
  }
  return claim;
}

// ---------- Finder approves a claim ----------
router.post('/claims/:id/approve', requireLogin, (req, res) => {
  const claim = loadClaim(req, res);
  if (!claim) return;
  if (claim.finder_id !== req.session.userId) return res.status(403).json({ error: 'Not your item' });
  if (claim.status !== 'pending' || claim.item_status !== 'available') {
    return res.status(409).json({ error: 'This claim can no longer be approved' });
  }
  db.tx(() => {
    db.prepare("UPDATE claims SET status = 'approved' WHERE id = ?").run(claim.id);
    db.prepare("UPDATE items SET status = 'claimed' WHERE id = ?").run(claim.item_id);
    // Only one person can receive the item, so close the other pending claims.
    db.prepare("UPDATE claims SET status = 'rejected' WHERE item_id = ? AND status = 'pending'").run(claim.item_id);
  });
  res.json({ message: 'Claim approved. Contact details are now visible to both of you.' });
});

// ---------- Finder rejects a claim ----------
router.post('/claims/:id/reject', requireLogin, (req, res) => {
  const claim = loadClaim(req, res);
  if (!claim) return;
  if (claim.finder_id !== req.session.userId) return res.status(403).json({ error: 'Not your item' });
  if (claim.status !== 'pending') return res.status(409).json({ error: 'This claim is already decided' });
  db.prepare("UPDATE claims SET status = 'rejected' WHERE id = ?").run(claim.id);
  res.json({ message: 'Claim rejected' });
});

// ---------- Either person confirms the item was handed over ----------
router.post('/claims/:id/handed-over', requireLogin, (req, res) => {
  const claim = loadClaim(req, res);
  if (!claim) return;
  const userId = req.session.userId;
  if (userId !== claim.finder_id && userId !== claim.claimant_id) {
    return res.status(403).json({ error: 'Not your claim' });
  }
  if (claim.status !== 'approved') return res.status(409).json({ error: 'Nothing to confirm yet' });
  db.tx(() => {
    db.prepare("UPDATE claims SET status = 'completed' WHERE id = ?").run(claim.id);
    db.prepare("UPDATE items SET status = 'returned' WHERE id = ?").run(claim.item_id);
  });
  res.json({ message: 'Marked as handed over. Thank you!' });
});

// ---------- Report a no-show or fraud ----------
router.post('/claims/:id/report', requireLogin, (req, res) => {
  const claim = loadClaim(req, res);
  if (!claim) return;
  const userId = req.session.userId;
  const reason = String(req.body.reason || '').trim();

  const isFinder = userId === claim.finder_id;
  const isClaimant = userId === claim.claimant_id;
  if (!isFinder && !isClaimant) return res.status(403).json({ error: 'Not your claim' });
  if (claim.status !== 'approved') {
    return res.status(409).json({ error: 'You can only report during an active handover' });
  }
  if (reason.length < 10 || reason.length > 500) {
    return res.status(400).json({ error: 'Describe what happened (10-500 characters)' });
  }

  const reportedUserId = isFinder ? claim.claimant_id : claim.finder_id;
  db.tx(() => {
    db.prepare('INSERT INTO reports (claim_id, reporter_id, reported_user_id, reason) VALUES (?, ?, ?, ?)').run(
      claim.id,
      userId,
      reportedUserId,
      reason
    );
    db.prepare("UPDATE claims SET status = 'reported' WHERE id = ?").run(claim.id);
    // Finder reports a no-show claimant: item goes back on the list.
    // Claimant reports the finder: the listing is hidden until an admin reviews it.
    db.prepare('UPDATE items SET status = ? WHERE id = ?').run(isFinder ? 'available' : 'flagged', claim.item_id);
  });
  res.json({ message: 'Report submitted. An admin will review it.' });
});

module.exports = router;
