# Body Parser Debug Report — `req.body` Undefined on Login

**Date:** 2026-07-14  
**Endpoint:** `POST /api/auth/login`  
**Error:** `Cannot destructure property 'email' of 'req.body' as it is undefined`

---

## Executive Summary

| Item | Finding |
|------|---------|
| **Root cause** | `express.json()` **skips parsing** when `Content-Type` is missing or not `application/json`. `req.body` stays **`undefined`**. Destructuring `const { email } = req.body` then throws. |
| **Secondary cause** | Malformed JSON (e.g. Windows `curl` escaping) triggers a **SyntaxError** before the route runs, returned as `REQUEST_FAILED`. |
| **Middleware order** | Body parsers were registered correctly before routes, but the **type filter** was too strict for mobile/proxy clients that omit `Content-Type`. |
| **Fix** | Centralized body parsing in `middleware/requestBody.js` with relaxed type detection for `/api` POST bodies, JSON error handler, `req.body` normalization, and safe login handler. |

---

## Investigation

### Middleware chain (before fix)

```
1. helmet()
2. cookieParser()
3. cors()
4. express.json({ limit: "5mb" })      ← skips if Content-Type ≠ application/json
5. express.urlencoded(...)
6. apiLimiter (/api)
7. route handlers (/api/auth/login, ...)
8. Sentry.setupExpressErrorHandler
9. notFoundHandler / errorHandler
```

**Finding:** Order was correct (parsers before routes). No middleware consumed the request stream before `express.json()`. Multer is **route-scoped** only (`import.js`, `timetableRoutes.js`), not global.

**CORS:** Does not block mobile native clients (no `Origin` header). Not related.

**Nginx proxy:** Forwards requests to `backend:5000`; does not strip `Content-Type` by default.

### Reproduction tests

| Test | Result |
|------|--------|
| `POST` with `Content-Type: application/json` + valid JSON | ✅ Login success |
| `POST` with **no** `Content-Type` + JSON body | ❌ `req.body` undefined → destructuring crash (before fix). **Note:** Windows `curl.exe` without `-H Content-Type` sends `application/x-www-form-urlencoded`, not a truly headerless body — use `-H "Content-Type: application/json"` or `Invoke-RestMethod`. |
| `POST` with malformed JSON (Windows curl escaping) | ❌ `REQUEST_FAILED` / SyntaxError (before JSON error handler) |
| `POST` with no body | Returns 400 "Email and password are required" (empty `{}` after fix) |

### Why `req.body` is `undefined` (not `{}`)

Express `express.json()` only runs when the request matches its `type` (default: `application/json`). If the client sends:

```
POST /api/auth/login
Content-Length: 42
(no Content-Type header)

{"email":"...","password":"..."}
```

…the parser **does not run**, and `req.body` is never assigned → **`undefined`**.

Mobile clients (Axios) normally send `Content-Type: application/json`. The failure also occurs when:
- Using raw `curl` without `-H "Content-Type: application/json"`
- A proxy strips or rewrites headers
- Client sends wrong Content-Type

---

## Changes Made

### 1. `backend/middleware/requestBody.js` (new)

Central body parser configuration:

| Feature | Purpose |
|---------|---------|
| `preParseDebug` / `postParseDebug` | Logs `Content-Type`, `Content-Length`, headers, and `req.body` when `BODY_PARSER_DEBUG=true` or in non-production |
| `shouldParseAsJson()` | Parses standard JSON **and** `/api` POST/PUT/PATCH with body but **missing** Content-Type |
| `jsonSyntaxErrorHandler` | Returns `400 INVALID_JSON` instead of opaque `REQUEST_FAILED` |
| `ensureBodyObject` | Sets `req.body = {}` if still undefined after parsers |

### 2. `backend/server.js`

```javascript
registerBodyParsers(app);  // replaces inline express.json/urlencoded
app.use("/api", apiLimiter); // still after body parsers
```

### 3. `backend/routes/authRoutes.js`

- Safe access: `loginBody = req.body ?? {}` (via object check)
- Clear **400** when email/password missing (no destructuring crash)
- Optional `hint` when Content-Type is not JSON
- Debug log when `BODY_PARSER_DEBUG=true`
- Fixed variable shadowing (`loginBody` vs response `body`)

---

## Middleware Order (after fix)

```
1. trust proxy
2. helmet
3. cookieParser
4. cors
5. [BODY_DEBUG pre-parse log]
6. express.json({ type: shouldParseAsJson })
7. express.urlencoded({ type: urlencoded only })
8. jsonSyntaxErrorHandler
9. [BODY_DEBUG post-parse log]
10. ensureBodyObject (req.body never undefined)
11. apiLimiter (/api)
12. /api/* routes (including /api/auth/login)
13. Sentry error handler
14. notFound / error handlers
```

---

## Verification

After fix + backend restart:

```powershell
# Valid JSON — success
Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/auth/login" `
  -Method POST -ContentType "application/json" `
  -Headers @{ "X-Client-Type" = "mobile" } `
  -Body '{"email":"sample3@kct.ac.in","password":"sample3"}'
# → success: true, token returned
```

Enable debug logging:

```env
BODY_PARSER_DEBUG=true
```

Restart backend; each API request logs:

```
[BODY_DEBUG:pre-parse] POST /api/auth/login ct=application/json len=42 body=undefined
[BODY_DEBUG:headers] POST /api/auth/login content-type=application/json content-length=42
[BODY_DEBUG:post-parse] POST /api/auth/login ct=application/json len=42 body={"email":"...","password":"..."}
```

---

## Modified Files

| File | Change |
|------|--------|
| `backend/middleware/requestBody.js` | **New** — body parsing, debug logs, JSON error handler |
| `backend/server.js` | Use `registerBodyParsers(app)` |
| `backend/routes/authRoutes.js` | Safe body access, validation, debug log |
| `body_parser_debug_report.md` | This report |

---

## Why `req.body` Is Now Correctly Populated

1. **`shouldParseAsJson`** parses JSON for `/api` POST/PUT/PATCH when `Content-Type` is omitted entirely (uses `req.originalUrl` for path matching). Clients that send a wrong type (e.g. Windows curl defaulting to `application/x-www-form-urlencoded`) still need the correct header or urlencoded body fields.
2. **`ensureBodyObject`** guarantees `req.body` is at least `{}`, so destructuring never throws.
3. **`jsonSyntaxErrorHandler`** returns clear 400 for invalid JSON before route handlers run.
4. **Login route** validates fields explicitly and returns **400** instead of **500** when body is empty.

Existing APIs (multipart uploads via Multer, urlencoded forms) are unchanged — multipart and urlencoded types are explicitly excluded from the relaxed JSON parser.

---

## Recommended Client Usage

Always send:

```http
POST /api/auth/login
Content-Type: application/json
X-Client-Type: mobile

{"email":"user@kct.ac.in","password":"secret"}
```

PowerShell example:

```powershell
$body = @{ email = "sample3@kct.ac.in"; password = "sample3" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://10.181.59.52:5000/api/auth/login" `
  -Method POST -ContentType "application/json" `
  -Headers @{ "X-Client-Type" = "mobile" } -Body $body
```

Windows `curl.exe` must use valid JSON quoting or `--data-raw` with a file.
