// Locations, categories, searching items, posting a found item, removing a listing.
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { CATEGORIES } = require('./constants');
const { requireLogin } = require('./middleware');
const { itemSelect, publicItem } = require('./helpers');

const router = express.Router();

// ---------- Photo upload settings ----------
const EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, 'uploads'),
    // Random file name, so nobody can overwrite or guess other photos.
    filename: (req, file, cb) =>
      cb(null, crypto.randomBytes(12).toString('hex') + EXTENSIONS[file.mimetype]),
  }),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (EXTENSIONS[file.mimetype]) return cb(null, true);
    cb(new Error('Photo must be a JPG, PNG or WebP image'));
  },
});

// Runs the upload and turns upload errors into clean JSON replies.
function handleUpload(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Photo must be under 3 MB' : err.message;
    res.status(400).json({ error: message || 'Upload failed' });
  });
}

// The browser can lie about the file type, so check the first bytes of the file too.
function looksLikeImage(filePath) {
  const buf = Buffer.alloc(12);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isPng = buf.toString('hex', 0, 4) === '89504e47';
  const isWebp = buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  return isJpeg || isPng || isWebp;
}

function discard(file) {
  if (file) fs.unlink(file.path, () => {});
}

// ---------- Dropdown data ----------
// The whole place tree in one reply: districts -> upazilas -> areas.
// Districts and upazilas that have no areas yet are left out.
router.get('/locations', (req, res) => {
  const rows = db
    .prepare(
      `SELECT d.id AS district_id, d.name AS district,
              up.id AS upazila_id, up.name AS upazila,
              a.id AS area_id, a.name AS area
       FROM areas a
       JOIN upazilas up ON up.id = a.upazila_id
       JOIN districts d ON d.id = up.district_id
       ORDER BY d.name, up.name, a.name`
    )
    .all();

  const districts = [];
  for (const r of rows) {
    let district = districts.find((x) => x.id === r.district_id);
    if (!district) districts.push((district = { id: r.district_id, name: r.district, upazilas: [] }));
    let upazila = district.upazilas.find((x) => x.id === r.upazila_id);
    if (!upazila) district.upazilas.push((upazila = { id: r.upazila_id, name: r.upazila, areas: [] }));
    upazila.areas.push({ id: r.area_id, name: r.area });
  }
  res.json(districts);
});

router.get('/categories', (req, res) => {
  res.json(CATEGORIES);
});

// ---------- Search ----------
// Filters by category and place, then ranks by how many search words appear in the description.
// Place can be as wide or narrow as the visitor chooses: district, upazila, or area.
router.get('/items', (req, res) => {
  const { category, district, upazila, area, q } = req.query;
  let sql = itemSelect + " WHERE i.status = 'available'";
  const params = [];
  if (category) {
    sql += ' AND i.category = ?';
    params.push(String(category));
  }
  if (area) {
    sql += ' AND i.area_id = ?';
    params.push(Number(area));
  } else if (upazila) {
    sql += ' AND a.upazila_id = ?';
    params.push(Number(upazila));
  } else if (district) {
    sql += ' AND up.district_id = ?';
    params.push(Number(district));
  }
  sql += ' ORDER BY i.created_at DESC, i.id DESC LIMIT 500';

  let rows = db.prepare(sql).all(...params);

  const words = String(q || '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  if (words.length) {
    rows = rows
      .map((row) => {
        const text = (row.description + ' ' + row.category).toLowerCase();
        return { row, score: words.filter((w) => text.includes(w)).length };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score) // stable: ties stay newest-first
      .map((entry) => entry.row);
  }
  res.json(rows.map(publicItem));
});

// ---------- One item ----------
router.get('/items/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare(itemSelect + ' WHERE i.id = ?').get(id);
  const userId = req.session.userId;
  if (!row || row.status === 'removed') {
    return res.status(404).json({ error: 'Item not found' });
  }

  const mine = row.finder_id === userId;
  const myClaim = userId
    ? db.prepare('SELECT id, status FROM claims WHERE item_id = ? AND claimant_id = ?').get(id, userId)
    : null;

  // Items that are no longer available are only visible to the finder and the claimant.
  if (row.status !== 'available' && !mine && !myClaim) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const out = { ...publicItem(row), mine, my_claim: myClaim || null };
  if (userId) {
    // The question is shown to logged-in people; the answer is never sent from here.
    out.secret_question = db.prepare('SELECT secret_question FROM items WHERE id = ?').get(id).secret_question;
  }
  res.json(out);
});

// ---------- Post a found item ----------
router.post('/items', requireLogin, handleUpload, (req, res) => {
  const category = String(req.body.category || '').trim();
  const description = String(req.body.description || '').trim();
  const areaId = Number(req.body.area_id);
  const question = String(req.body.secret_question || '').trim();
  const answer = String(req.body.secret_answer || '').trim();

  const fail = (message) => {
    discard(req.file);
    return res.status(400).json({ error: message });
  };

  if (!CATEGORIES.includes(category)) return fail('Choose a category');
  if (description.length < 10 || description.length > 1000) {
    return fail('Description must be 10-1000 characters');
  }
  if (!db.prepare('SELECT 1 FROM areas WHERE id = ?').get(areaId)) {
    return fail('Choose the district, upazila and village/mohalla');
  }
  if (question.length < 5 || question.length > 200) {
    return fail('Verification question must be 5-200 characters');
  }
  // Optional notes for the finder's own reference. Claimants never see this.
  if (answer.length > 300) return fail('Your notes can be up to 300 characters');
  if (req.file && !looksLikeImage(req.file.path)) return fail('That file is not a valid image');

  const result = db
    .prepare(
      `INSERT INTO items (finder_id, category, description, area_id, photo, secret_question, secret_answer)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.session.userId, category, description, areaId, req.file ? req.file.filename : null, question, answer);

  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

// ---------- Remove your own listing ----------
router.delete('/items/:id', requireLogin, (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT finder_id, status FROM items WHERE id = ?').get(id);
  if (!item || item.finder_id !== req.session.userId || item.status === 'removed') {
    return res.status(404).json({ error: 'Item not found' });
  }
  if (item.status !== 'available') {
    return res.status(409).json({ error: 'This item is in the middle of a handover and cannot be removed' });
  }
  db.tx(() => {
    db.prepare("UPDATE items SET status = 'removed' WHERE id = ?").run(id);
    db.prepare("UPDATE claims SET status = 'rejected' WHERE item_id = ? AND status = 'pending'").run(id);
  });
  res.json({ message: 'Listing removed' });
});

module.exports = router;
