# 🚀 AccessGraph AI Frontend - Quick Start Guide

Get the frontend running in 5 minutes!

---

## Prerequisites

- **Node.js 18+** installed
- **Backend API** running (or will handle gracefully if not)
- Terminal/Command Prompt access

---

## Step 1: Navigate to Frontend Directory

```bash
cd apps/frontend
```

---

## Step 2: Install Dependencies

```bash
npm install
```

**Expected time:** 2-3 minutes

**What this installs:**
- Next.js 14
- TanStack Query (React Query)
- Tailwind CSS
- Radix UI components
- Cytoscape.js (graph visualization)
- Recharts
- Lucide icons
- and more...

---

## Step 3: Configure Environment

```bash
# Copy the example file
cp .env.local.example .env.local

# Edit .env.local (use your favorite editor)
nano .env.local
# or
code .env.local
# or
notepad .env.local
```

**Minimal configuration:**

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_ENABLE_QUERY_DEVTOOLS=true
```

**If backend is NOT running**, set:
```env
NEXT_PUBLIC_DEMO_MODE=true
```

---

## Step 4: Start Development Server

```bash
npm run dev
```

**Expected output:**
```
  ▲ Next.js 14.1.0
  - Local:        http://localhost:3000
  - Ready in 2.3s
```

---

## Step 5: Access the Application

Open your browser to:

### Main Routes (Working Now):

**Dashboard:**
```
http://localhost:3000/orgs/demo-org/dashboard
```
Shows metrics, top anomalies, and recent recommendations.

**Users List:**
```
http://localhost:3000/orgs/demo-org/users
```
Browse users with search and filtering.

---

## 🎨 What You'll See

### Dashboard Page
- **4 Metric Cards**: Total Users, High-Risk Users, Critical Anomalies, Recommendations
- **Sync Status Banner**: Shows latest sync job status
- **Top Anomalous Users**: List of users with highest anomaly scores
- **Recent Recommendations**: Latest remediation suggestions

### Users Page
- **Search Bar**: Filter users by name or email
- **Risk Level Filter**: Filter by critical/high/medium/low
- **User Table**: Shows user details, role, profile, risk level, status
- **Click Row**: Navigate to user detail (page not yet implemented)

---

## 🔧 Troubleshooting

### Error: "Cannot connect to backend"

**Option 1 - Start Backend:**
```bash
# In another terminal
cd apps/backend
python -m uvicorn app.main:app --reload --port 8000
```

**Option 2 - Enable Demo Mode:**
Edit `.env.local`:
```env
NEXT_PUBLIC_DEMO_MODE=true
```
(Demo mode implementation pending - will show graceful error states)

### Error: "Module not found"

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Dark Mode Not Working

- Check if you have `ThemeProvider` errors in console
- Refresh the page
- Clear browser cache

### Styles Not Loading

```bash
# Rebuild Tailwind
npm run dev
# Force refresh: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
```

---

## 🎯 Test the Current Implementation

### Test 1: Dashboard Loads

1. Go to `http://localhost:3000/orgs/demo-org/dashboard`
2. ✅ Should see: Loading skeletons → Dashboard with metrics
3. ✅ Should see: Top anomalous users, Recent recommendations

### Test 2: Users List

1. Go to `http://localhost:3000/orgs/demo-org/users`
2. ✅ Should see: Search bar, filter dropdown, user table
3. ✅ Type in search: Should filter users in real-time
4. ✅ Select risk filter: Should filter by risk level

### Test 3: Dark Mode

1. Look for theme toggle in top-right navbar (if implemented)
2. Toggle between light/dark
3. ✅ Should see: Colors invert smoothly

### Test 4: API Error Handling

1. Stop backend API
2. Refresh dashboard
3. ✅ Should see: Error state with "Try Again" button
4. Start backend, click "Try Again"
5. ✅ Should see: Data loads successfully

---

## 📦 Available Scripts

```bash
# Development
npm run dev              # Start dev server (with hot reload)

# Production
npm run build            # Build for production
npm start               # Start production server

# Code Quality
npm run lint             # Run ESLint
npm run type-check      # TypeScript type checking

# Testing (when implemented)
npm test                # Run tests
npm run test:ui         # Run tests with UI
npm run test:coverage   # Generate coverage report
```

---

## 🌐 Backend Requirements

For full functionality, the backend should be running with:

### Required Endpoints:

- `GET /orgs` - List organizations
- `GET /orgs/{orgId}/users` - List users
- `GET /orgs/{orgId}/anomalies` - List anomalies
- `GET /orgs/{orgId}/anomalies/users/top` - Top anomalous users
- `GET /orgs/{orgId}/recommendations` - List recommendations
- `GET /orgs/{orgId}/sync-jobs` - Sync job history

### Optional (Graceful Degradation):

- `GET /orgs/{orgId}/graph/user/{userId}` - User graph data
- `GET /orgs/{orgId}/users/{userId}` - User detail
- `POST /orgs/{orgId}/sync` - Trigger sync

---

## 🎨 Customize for Your Org

### Set Default Organization

Edit `.env.local`:
```env
NEXT_PUBLIC_DEFAULT_ORG_ID=your-org-id-here
```

Then access:
```
http://localhost:3000/orgs/your-org-id-here/dashboard
```

### Change Theme Colors

Edit `tailwind.config.ts`:
```typescript
colors: {
  primary: {
    500: '#0ea5e9',  // Change to your brand color
    600: '#0284c7',
    // ...
  }
}
```

---

## 📱 Mobile/Tablet Testing

The app is desktop-first but responsive:

```bash
# Test different viewports
# Desktop: 1920x1080
# Tablet: 768x1024
# Mobile: 375x667 (limited support)
```

Use browser DevTools to test responsive design.

---

## 🔐 Security Notes

**Do NOT commit:**
- `.env.local` (actual secrets)
- `node_modules/`
- `.next/` (build output)

**Safe to commit:**
- `.env.local.example` (template)
- Source code
- Configuration files

---

## 📊 Performance

**First Load (Development):**
- Cold start: ~5-8 seconds
- Hot reload: ~1-2 seconds

**Production Build:**
```bash
npm run build
npm start
```
- Much faster (~2-3 seconds first load)

---

## 🐛 Known Issues

1. **Graph visualization not implemented** - Pages will show error/empty state
2. **User detail page not implemented** - Clicking user rows will 404
3. **Demo mode not fully implemented** - Backend required for data
4. **No org selector** - Must manually change URL
5. **Limited test coverage** - Tests not yet implemented

---

## ✅ Success Checklist

After following this guide, you should have:

- [ ] Frontend running on `http://localhost:3000`
- [ ] Dashboard page loads with metrics
- [ ] Users list page loads with search/filter
- [ ] Dark mode works
- [ ] Loading states show correctly
- [ ] Error states show when backend unavailable
- [ ] Console shows no critical errors

---

## 🆘 Need Help?

1. **Check logs:** Browser console (F12) and terminal
2. **Verify backend:** `curl http://localhost:8000/health`
3. **Check environment:** Review `.env.local` values
4. **Clear cache:** Delete `.next/` folder and restart

---

## 🎓 Next Steps

Once you have the frontend running:

1. **Explore existing pages** - Dashboard, Users
2. **Review the code** - See how pages are built
3. **Check `IMPLEMENTATION_STATUS.md`** - See what's pending
4. **Read `README.md`** - Full architecture guide
5. **Implement remaining pages** - Use existing pages as templates

---

## 🎉 You're Ready!

The frontend foundation is complete and ready to use. Enjoy exploring AccessGraph AI!

**Questions?** Check the README.md or IMPLEMENTATION_STATUS.md for detailed documentation.

---

**Last Updated:** 2025-04-15
**Version:** 0.1.0 MVP
