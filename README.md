# KHFM Report — backend version

A real server so every login (on any computer, anywhere) sees the same live data.

## What's inside
- `server.js` — the backend (Node.js + Express). Handles login, and only ever
  sends each login the sections it's allowed to see — enforced on the server,
  not just hidden in the browser.
- `public/index.html` — the app itself (what people see and use).
- `db.json` — created automatically the first time the server runs. This is
  where all your data and passwords live. **Back this file up occasionally.**

## Default passwords (change these immediately after deploying)
| Login | Password | Sees |
|---|---|---|
| Full access | `Sitewise2026` | Everything, including Dashboard, and can manage all passwords |
| Payroll access | `Payroll2026` | Salary, PF/ESIC, Labour Strength only |
| Procurement access | `Vendor2026` | Vendor Expenses, Billing, Special Expenses, Subcontractor P/L only |

Log in with the full-access password, open "Manage logins" in the sidebar,
and set your own passwords for all three before sharing this with anyone.

## Deploying on Render (free, no command line needed)

**1. Put this code on GitHub**
- Go to github.com and create a free account if you don't have one.
- Click the "+" in the top right → "New repository". Name it `khfm-report`.
  Leave it public or private, either works. Click "Create repository".
- On the new repo's page, click "uploading an existing file".
- Drag in all the files from this folder (`server.js`, `package.json`,
  `README.md`, and the `public` folder with `index.html` inside it).
- Click "Commit changes" at the bottom.

**2. Connect Render to it**
- Go to render.com and sign up (you can sign up directly with your GitHub
  account, which makes the next step automatic).
- Click "New +" → "Web Service".
- Choose the `khfm-report` repository you just created.
- Render will auto-detect it's a Node app. Leave the defaults — Build
  Command `npm install`, Start Command `npm start` (or `node server.js`
  if it doesn't autofill).
- Choose the **Free** instance type.
- Click "Create Web Service".

**3. Wait and open it**
- Render will build and deploy — takes 1-3 minutes the first time. You'll
  see live logs; wait for "KHFM report server running on port ...".
- Render gives you a URL like `https://khfm-report.onrender.com` — that's
  your app. Open it, log in, and change the three passwords right away.

**A few things about the free tier:**
- The free service goes to sleep after 15 minutes with no visitors, and
  takes about 30 seconds to wake back up on the next visit. That's normal.
- If you ever push new code changes to GitHub, Render redeploys and the
  `db.json` file (all your data and passwords) gets wiped back to
  defaults. If that ever happens, you'll need to re-add your sites/data
  and reset the three passwords again. For a small internal tool this is
  usually fine since you're not redeploying often — just know it going in.
