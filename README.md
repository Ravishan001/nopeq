# NopeQ — Nope to queues. Book your time.

Salons වලට online booking platform එක. **powered by Ravion Studio**

- Owner signup → business type → **AI chat හෝ Manual setup** (MVP: manual, AI ළඟදීම)
- Manual wizard: Business විස්තර → Services + ගණන් (salon template) → Staff + වෙලාවල් → Live 🚀
- Dashboard: Setup checklist, booking link + QR, ඉදිරි bookings, Came / No-show / Cancel
- Settings: Logo, cover photo, contact, social links, services, staff, open වෙලාවල්, branches
- Public booking page `nopeq.com/<slug>`: customer ට **login නැතුව** book කරන්න පුළුවන්
- Booking link එකෙන් customer ට booking එක බලන්නත් cancel කරන්නත් පුළුවන් (`/b/<token>`)
- සිංහල / English toggle + Dark / Light mode (phone setting එක අනුව ඉබේම)
- **Worldwide:** signup කරන IP එක අනුව රට auto-suggest වෙනවා (වෙනස් කරන්නත් පුළුවන්). ඒ අනුව currency, time zone, phone format, template ගණන් සහ NopeQ plan ගණන් ඉබේම සෙට් වෙනවා
- PWA: home screen එකට add කරන්න පුළුවන්

**Tech:** Next.js 15 (App Router) · Supabase (Postgres + Auth + Storage) · Tailwind CSS 4 · Vercel

---

## Setup කරන විදිය (පළවෙනි පාර විතරයි)

### 1. Supabase project එක
1. supabase.com → **New project** → නම `nopeq`, region **Singapore** (ලංකාවට ළඟම), strong DB password එකක් දාන්න
   - Create කරන කොට Security එකේ: **Enable Data API ✅**, **Automatically expose new tables ⬜ (untick)**, **Enable automatic RLS ✅**
2. Project එක හැදුනම **SQL Editor → New query** → `supabase/schema.sql` file එකේ තියෙන ඔක්කොම copy කරලා paste කරන්න → **Run**
   - "Success. No rows returned" ආවොත් හරි ✅
3. **Authentication → URL Configuration**
   - Site URL: `https://nopeq.com` (domain එක තාම connect කරලා නැත්නම් Vercel URL එක)
   - Redirect URLs: `https://nopeq.com/**` සහ `http://localhost:3000/**`
4. **Project Settings → API** එකේ තියෙන **Project URL** සහ **anon public** key දෙක copy කරගන්න

> ⚠️ `service_role` key එක කවදාවත් මේ project එකට හෝ GitHub එකට දාන්න එපා. ඕන වෙන්නේ anon key එක විතරයි.

> **දැනටමත් පරණ schema එක run කරලා නම්:** `supabase/migrations/002_worldwide.sql` එකත් SQL Editor එකේ run කරන්න (රට, currency, time zone support).

### 2. Vercel එකට deploy
1. vercel.com → **Add New → Project** → GitHub එකේ `nopeq` repo එක **Import**
2. **Environment Variables** තුනක් දාන්න:
   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
   | `NEXT_PUBLIC_SITE_URL` | `https://nopeq.com` |
3. **Deploy**
4. **Settings → Domains** → `nopeq.com` add කරලා Vercel කියන DNS records ටික domain registrar එකේ දාන්න

### 3. Test කරන්න
1. Site එකට ගිහින් **Sign up** → email confirm කරන්න → login
2. Salon → Manual → Look Hair Studio විස්තර දාලා **Page එක live කරන්න**
3. Dashboard එකේ link එක phone එකෙන් open කරලා test booking එකක් දාන්න (login නැතුව)
4. Dashboard → Bookings එකේ booking එක පේනවද බලන්න

---

## Notifications setup (අලුත් booking එකක් ආවම දැනුම් දෙන්න)

1. **Database:** Supabase SQL Editor එකේ `supabase/migrations/003_notifications.sql` run කරන්න
2. **Email (Resend):** resend.com → free account → **API Keys → Create** → key එක copy කරගන්න.
   ඔයාගේම domain එකෙන් emails යවන්න **Domains → Add domain** (`nopeq.com`) කරලා DNS records ටික දාන්න.
   Domain එක verify කරනකම් test emails යන්නේ ඔයාගේ Resend account email එකට විතරයි.
3. **Vercel → Settings → Environment Variables** එකට මේවා add කරන්න (type: **Secret**, `NEXT_PUBLIC_` නැති ඒවා කවදාවත් public කරන්න එපා):
   | Name | Value |
   |---|---|
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API Keys → **service_role / secret** key |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key |
   | `VAPID_PRIVATE_KEY` | VAPID private key |
   | `VAPID_SUBJECT` | `mailto:ඔයාගේ@email.com` |
   | `RESEND_API_KEY` | Resend API key |
   | `EMAIL_FROM` | `NopeQ <bookings@nopeq.com>` (verify කරපු domain එකෙන්) |
   | `CRON_SECRET` | දිග random string එකක් |
   ඊට පස්සේ **Redeploy**
4. **Reminders (පැය 2කට කලින්):** `supabase/cron_reminders.sql` එකේ `YOUR-SITE` සහ `YOUR_CRON_SECRET` replace කරලා SQL Editor එකේ run කරන්න. විනාඩි 10කට වතාවක් reminder job එක run වෙනවා.
5. **Phone push:** Dashboard → 🔔 Notifications → **On කරන්න**.
   iPhone එකේ: Safari → Share → **Add to Home Screen** → home screen එකේ NopeQ icon එකෙන් open කරලා On කරන්න (iOS 16.4+).

**Notifications යන්නේ:**
- Owner ට: අලුත් booking එකක් සහ customer cancel කළොත් → push + email (dashboard එකෙන් on/off කරන්න පුළුවන්)
- Customer ට (email එක දුන්නොත්): booking confirmation email එක + පැය 2කට කලින් reminder email එක

## Local එකේ run කරන්න (optional)
```bash
npm install
cp .env.example .env.local   # values දාන්න
npm run dev                  # http://localhost:3000
```

## Security (දැනට තියෙන ඒවා)
- **Row Level Security:** එක business එකකට අනිත් business එකේ data කිසිම විදියකට පේන්නේ නෑ. Customers ලට `bookings` table එක කෙලින්ම කියවන්න බෑ.
- Booking එක හැදෙන්නේ `book_slot()` database function එකෙන් විතරයි. ඒකෙන්:
  - Slot එක ඇත්තටම හිස්ද කියලා check කරනවා. Lock එකක් තියෙන නිසා එකම වෙලාවට දෙන්නෙක්ට book කරන්න බෑ.
  - Open වෙලාවලින් පිට booking දාන්න දෙන්නේ නෑ.
  - එක phone number එකකින් upcoming bookings 3කට වඩා දාන්න බෑ, දවසකට 20කට වඩා බෑ.
- Customer ට පේන්නේ තමන්ගේ booking එක විතරයි, ඒකත් random token link එකෙන් විතරයි.
- Busy times public වෙලා පේනවා, ඒත් නම් හෝ phone numbers නෑ.
- Logo/cover uploads: තමන්ගේ folder එකට විතරයි, 3 MB max, PNG/JPG/WEBP විතරයි.
- Honeypot field එකකින් spam bots අල්ලනවා.

## ඊළඟට (roadmap)
- [ ] AI setup chat (Claude) + AI agent (web + WhatsApp)
- [x] Push + email notifications, email reminders
- [ ] WhatsApp / SMS confirmation + reminders
- [ ] Cloudflare Turnstile check එක
- [ ] PayHere subscriptions (Pro / AI plans)
- [ ] Pro plan එකට business logo එකෙන් PWA icon එක
- [ ] Cake shop (order) සහ tuition (class) templates

---
© Ravion Studio · ravionstudio.com
