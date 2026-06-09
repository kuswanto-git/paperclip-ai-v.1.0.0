# Railway WebSocket Connection Failed - Troubleshooting Guide

## 🔴 Problem
```
web socket connection failed
```

Muncul di browser console ketika akses Paperclip di Railway. UI bisa load tapi real-time features (live run logs, agent status updates) tidak berfungsi.

---

## 🔍 Root Causes

### 1. **Railway Reverse Proxy tidak forward WebSocket upgrade**
Railway menggunakan reverse proxy yang harus dikonfigurasi khusus untuk WebSocket.

### 2. **Missing or Wrong Environment Variables**
- `PAPERCLIP_PUBLIC_URL` tidak disesuaikan dengan Railway domain
- `BETTER_AUTH_TRUSTED_ORIGINS` tidak include Railway URL

### 3. **Server tidak mendengarkan upgrade requests**
Express server harus explicitly handle `upgrade` events untuk WebSocket.

### 4. **CORS Headers tidak allow WebSocket origin**

---

## ✅ Solutions

### Solution #1: Update Environment Variables di Railway Dashboard

Pergi ke **Railway Dashboard → Your Project → Variables** dan set:

```bash
# Railway akan memberikan domain seperti: paperclip-prod.up.railway.app
# Copy domain tersebut dan gunakan di bawah:

PAPERCLIP_PUBLIC_URL=https://paperclip-prod.up.railway.app
BETTER_AUTH_TRUSTED_ORIGINS=https://paperclip-prod.up.railway.app
PAPERCLIP_AUTH_PUBLIC_BASE_URL=https://paperclip-prod.up.railway.app
BETTER_AUTH_URL=https://paperclip-prod.up.railway.app

# Untuk deployment lokal/private masih tetap:
PAPERCLIP_DEPLOYMENT_MODE=authenticated
PAPERCLIP_DEPLOYMENT_EXPOSURE=private

# WebSocket settings
NODE_ENV=production
```

**Kemudian: Redeploy via Railway Dashboard!**

---

### Solution #2: Verify Server WebSocket Setup

**File:** `server/src/index.ts`

Pastikan bagian ini ada:

```typescript
import { setupLiveEventsWebSocketServer } from "./realtime/live-events-ws.js";

async function main() {
  // ... existing code ...

  const server = app.listen(port, host, () => {
    logger.info(`API server listening on ${host}:${port}`);
  });

  // ✅ PENTING: Setup WebSocket server on HTTP upgrade
  setupLiveEventsWebSocketServer(server, {
    db,
    deploymentMode: config.server.deploymentMode,
  });

  // Handle graceful shutdown
  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received, shutting down gracefully...");
    server.close(() => {
      process.exit(0);
    });
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

---

### Solution #3: Check Browser Console Logs

Buka **DevTools (F12) → Console** dan cari:

```javascript
// BAD - WebSocket failed to connect:
Failed to connect to WebSocket: wss://paperclip-prod.up.railway.app/api/companies/{companyId}/events/ws

// GOOD - WebSocket connected:
WebSocket connected to wss://paperclip-prod.up.railway.app/api/companies/{companyId}/events/ws
```

---

### Solution #4: Check Network Tab

**DevTools → Network → WS (WebSocket tab):**

| Status | Meaning | Action |
|--------|---------|--------|
| ❌ **Pending** / **Failed** | Proxy tidak forward upgrade | Check PAPERCLIP_PUBLIC_URL |
| ⚠️ **101 Switching Protocols** | OK tapi connection closes | Check auth token |
| ✅ **101** (green) | Connected! | OK |

---

### Solution #5: Fix Server CORS for WebSocket

**File:** `server/src/middleware/cors.ts` (pastikan ada)

```typescript
import cors from "cors";

export function setupCors(app: Express) {
  const allowedOrigins = [
    "http://localhost:3100",
    "http://localhost:3000",
    // Railway URL harus di-add:
    process.env.PAPERCLIP_PUBLIC_URL || "",
    process.env.BETTER_AUTH_TRUSTED_ORIGINS || "",
  ].filter(Boolean);

  app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }));

  // ✅ Handle preflight untuk WebSocket
  app.options("*", cors({
    origin: allowedOrigins,
    credentials: true,
  }));
}
```

---

### Solution #6: Update Dockerfile untuk Railway

**File:** `Dockerfile` (sudah mostly OK, tapi pastikan ini ada)

```dockerfile
# ← Lines 79-87 sudah set:
ENV HOST=0.0.0.0 \
    PORT=3100 \
    ...

# Pastikan startup command ada:
CMD ["tsx", "server/src/index.ts"]

# Dan expose port:
EXPOSE 3100
```

---

### Solution #7: Check Railway Health Endpoint

Jalankan di terminal local Anda:

```bash
# Replace dengan Railway domain Anda
RAILWAY_URL="https://paperclip-prod.up.railway.app"

# Test 1: Basic health check
curl -v "$RAILWAY_URL/api/health"

# Expected response:
# {
#   "status": "ok",
#   "deploymentMode": "authenticated",
#   "bootstrapStatus": "ready"
# }

# Test 2: Check if server accepts WebSocket upgrade
# (ini lebih kompleks, lihat Solution #8)
```

---

### Solution #8: Enable Debug Logging

Di Railway Dashboard, tambah variable:

```bash
LOG_LEVEL=debug
PAPERCLIP_DEBUG=true
```

Kemudian lihat **Deployments → Logs** untuk debug info:

```
[INFO] API server listening on 0.0.0.0:3100
[INFO] WebSocket server initialized
[DEBUG] WebSocket upgrade request from 123.45.67.89
[DEBUG] Auth token validated: user-123
[DEBUG] WebSocket connected, subscribing to company-456 events
```

---

## 🚀 Quick Fix Checklist

Jalankan checklist ini untuk fix WebSocket di Railway:

```bash
☐ 1. Cek Railway domain (dashboard → Deployments)
☐ 2. Set PAPERCLIP_PUBLIC_URL = https://your-railway-domain.up.railway.app
☐ 3. Set BETTER_AUTH_TRUSTED_ORIGINS = https://your-railway-domain.up.railway.app
☐ 4. Set PAPERCLIP_DEPLOYMENT_MODE = authenticated
☐ 5. Set DATABASE_URL jika belum (Railway PostgreSQL)
☐ 6. Set PAPERCLIP_JWT_SECRET = random-string-32-chars-minimum
☐ 7. Redeploy via Railway Dashboard (or push to Git)
☐ 8. Wait 2-3 minutes untuk build & deploy selesai
☐ 9. Buka https://your-railway-domain.up.railway.app
☐ 10. Buka DevTools → Console, cek apakah ada error
```

---

## 📝 Common Railway Issues & Fixes

### Issue: "Connection refused"
```
Railway firewall atau port tidak terbuka
```
**Fix:** Pastikan Railway project setting: **Networking → Allow incoming connections**

### Issue: "Timeout connecting to database"
```
DATABASE_URL tidak valid atau database down
```
**Fix:** Di Railway Dashboard → Database tab → copy connection string ke Variables

### Issue: "Invalid JWT secret"
```
PAPERCLIP_JWT_SECRET belum di-set atau terlalu pendek
```
**Fix:** Buat random string 32+ chars di terminal:
```bash
openssl rand -base64 32
# Copy hasilnya ke Railway Variables
```

### Issue: "WebSocket upgrade rejected (401)"
```
Auth token tidak valid / expired
```
**Fix:** Clear browser cookies dan login ulang

---

## 🔧 Manual Testing WebSocket Connection

```bash
# 1. Install wscat
npm install -g wscat

# 2. Get your Railway domain
RAILWAY_URL="paperclip-prod.up.railway.app"

# 3. Get auth token dari browser console:
# localStorage.getItem('auth_token')

# 4. Test WebSocket connection
wscat -c "wss://$RAILWAY_URL/api/companies/YOUR_COMPANY_ID/events/ws" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"

# Expected:
# Connected (press CTRL+C to quit)
```

---

## 🔗 References

- **Railway Docs:** https://railway.app/docs
- **WebSocket Setup:** `server/src/realtime/live-events-ws.ts`
- **Express Setup:** `server/src/index.ts`
- **Environment Config:** `server/src/config.ts`

---

## 📞 If Still Failing

1. Check **Railway Logs** (last 50 lines):
   ```
   Railway Dashboard → Deployments → View Logs
   ```

2. Check **Browser DevTools** (Network tab):
   - WebSocket URL format correct?
   - Status code 101 (Switching Protocols)?

3. Check **Health Endpoint**:
   ```bash
   curl https://your-railway-domain.up.railway.app/api/health
   ```

4. Rebuild & Redeploy:
   ```bash
   # Push code perubahan
   git push
   
   # Or manually trigger rebuild di Railway Dashboard
   # → Deployments → Redeploy latest
   ```

---

**Last Updated:** 2026-06-09  
**Status:** ✅ Ready for production
