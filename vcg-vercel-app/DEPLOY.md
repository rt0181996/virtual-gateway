# 🚀 VCG App — Vercel Deployment Guide
### Ronit · MI6228 · Group 13

---

## STEP 1: Copy this folder to your project

Copy the `vcg-vercel-app` folder into your project:
```
C:\Users\Ronit\OneDrive\Desktop\virtual-gateway\vcg-vercel-app
```

---

## STEP 2: Push to GitHub

### Option A — Add to your existing repo (recommended)
```bash
cd C:\Users\Ronit\OneDrive\Desktop\virtual-gateway
git add vcg-vercel-app/
git commit -m "Add VCG Next.js web app (Paytm style)"
git push
```

### Option B — Create a new repo for just the web app
1. Go to https://github.com/new
2. Name it `vcg-webapp`
3. Then:
```bash
cd vcg-vercel-app
git init
git add .
git commit -m "Initial VCG web app"
git branch -M main
git remote add origin https://github.com/rt0181996/vcg-webapp.git
git push -u origin main
```

---

## STEP 3: Deploy to Vercel

1. Go to **https://vercel.com** → Sign in with GitHub
2. Click **"Add New Project"**
3. Select your repo (either `virtual-gateway` or `vcg-webapp`)
4. If using `virtual-gateway`, set **Root Directory** to `vcg-vercel-app`
5. Framework: **Next.js** (auto-detected)
6. Click **Deploy** ✅

Vercel will give you a URL like:
```
https://vcg-webapp-ronit.vercel.app
```

---

## STEP 4: QR Code

Once deployed, your QR code is already built into the app!
- Open the app → tap the **QR icon** in the top right
- Or go to: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=YOUR_VERCEL_URL

---

## What's in the app

| Feature | Details |
|---------|---------|
| Live API | Calls https://virtual-gateway.onrender.com |
| IEEE 2030.5 | Buttons for /dcap, /edev, /mup, /sdev, /tm, /dr |
| Platform Stack | FIWARE, InfluxDB, Grafana, IDS shown live |
| Devices | 4 smart devices with real-time energy readings |
| Activity Log | Gateway event history |
| QR Code | Scan-to-share built-in |
| Style | Paytm-inspired (navy blue + cyan gradient) |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails | Run `npm install` first, check Node ≥ 18 |
| API not loading | Your Render backend may be sleeping (free tier); refresh |
| CORS error | Add CORS headers in your FastAPI backend |
| Port mismatch | Update API_BASE in `src/app/page.tsx` line 13 |

---

## Add CORS to your FastAPI (if needed)

In your `main.py`:
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # or ["https://your-vercel-url.vercel.app"]
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

**Built by Claude · Anthropic**  
**Project: Virtual Communication Gateway (VCG)**  
**Mentor: Paolo Cammardella · Group 13**
