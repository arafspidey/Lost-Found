# Lost & Found Registry

CSE 3200 project. Finders post items they found, owners claim them by answering a
verification question, and contact details are shared only after the finder approves.

## Run it (Windows)

Needs Node.js 22.13 or newer (you have v24).

1. Extract this folder, open it in VS Code, open a terminal (Command Prompt or PowerShell).
2. Install the packages (once): `npm install`
3. Add demo data (optional): `node seed.js`
4. Start the site: `node server.js`
5. Open http://localhost:3000

Stop the server with `Ctrl + C`. If PowerShell blocks `npm`, run
`Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` once.

Demo accounts (created by `node seed.js`):

| Who | Phone | Password |
|---|---|---|
| Admin | 01700000000 | admin123 |
| Finder (has 3 items) | 01711111111 | demo123 |
| Second user | 01722222222 | demo123 |

To make your own account an admin: register on the site, then run
`node make-admin.js 01XXXXXXXXX` with your phone number.

To start over with an empty database, stop the server and delete `lostfound.db`
and the `uploads` folder.

## How the app works

1. A person registers with name, NID, phone, password.
2. A finder posts an item: category, place (district, upazila, village/mohalla), description,
   optional photo, plus a verification question and optional private notes.
3. Anyone can search by keywords, category, and place. Results are ranked by how many
   search words appear in the description.
4. An owner logs in, sees the question, and sends one answer in their own words.
5. The finder reads each answer, compares it with the item, then approves or rejects.
   The computer does not judge answers.
   Approving closes the other pending claims and reveals both phone numbers.
6. Either person confirms the handover (item becomes "Returned").
7. If someone does not show up, the other person reports them. The report is stored
   against that person's account. Admins see the reported person's NID on the
   Admin page. A finder's report puts the item back on the list; a claimant's
   report hides the listing until an admin restores it.

## Files

| File | What it does |
|---|---|
| `server.js` | Starts the server, sets up sessions and security headers, connects the route files |
| `db.js` | Creates the SQLite database and tables, loads the places from `locations.js` |
| `auth.js` | Register, login, logout, "who am I" |
| `items.js` | Locations, categories, search, item details, posting (with photo upload), removing a listing |
| `claims.js` | Claiming, approving/rejecting, handover, no-show reports, dashboard data |
| `admin.js` | Admin-only reports, offender list, restoring a hidden listing |
| `middleware.js` | Login check, admin check, login rate limit |
| `locations.js` | The list of districts, upazilas and villages/mohallas. Edit it to add places, then restart |
| `helpers.js`, `password.js`, `constants.js` | Shared helpers, password hashing, category list |
| `seed.js`, `make-admin.js` | Demo data, promote a user to admin |
| `public/*.html` | The pages |
| `public/app.js` | Code shared by all pages: calling the server, menu, small helpers |
| `public/home.js`, `post.js`, `item.js`, `dashboard.js`, `admin.js`, `login.js`, `register.js` | One script per page |
| `public/style.css` | All the styling |

## Things to change before real use

- Only Rajshahi City Corporation has villages/mohallas so far. Add more places in `locations.js` and restart.
  Empty districts/upazilas stay hidden from the dropdowns until they have at least one village/mohalla.
- Sessions are kept in memory, so everyone is logged out when the server restarts.
- NID is stored as plain text and not verified against any government system.
