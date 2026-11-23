// Shared query and formatting helpers used by several route files.

// Pieces of SQL that turn an item's area_id into a readable place, e.g.
// "Kazla, Rajshahi City Corporation, Rajshahi". Used in several queries.
const locationJoin = `
  JOIN areas a ON a.id = i.area_id
  JOIN upazilas up ON up.id = a.upazila_id
  JOIN districts d ON d.id = up.district_id`;
const locationColumn = "(a.name || ', ' || up.name || ', ' || d.name) AS location";

// Base query for items, joined with location and finder name.
const itemSelect = `
  SELECT i.id, i.finder_id, i.category, i.description, i.photo, i.status, i.created_at,
         ${locationColumn}, u.name AS finder_name
  FROM items i
  ${locationJoin}
  JOIN users u ON u.id = i.finder_id`;

// What anyone is allowed to see about an item (never the secret answer or phone).
function publicItem(row) {
  return {
    id: row.id,
    category: row.category,
    description: row.description,
    location: row.location,
    photo_url: row.photo ? '/uploads/' + row.photo : null,
    status: row.status,
    created_at: row.created_at,
    finder_name: row.finder_name,
  };
}

// Contact details are only revealed once a claim has been approved.
const CONTACT_VISIBLE = ['approved', 'completed', 'reported'];

module.exports = { itemSelect, locationJoin, locationColumn, publicItem, CONTACT_VISIBLE };
