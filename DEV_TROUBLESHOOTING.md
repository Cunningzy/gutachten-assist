# Development Troubleshooting Guide

## CRITICAL: "Localhost Refused to Connect" / No UI Elements

**Problem**: Desktop app window opens with colored background but NO UI elements (no buttons, sidebar, text). Browser shows "localhost refused to connect".

**Root Cause**: The Vite dev server (`localhost:3000`) is not running. Tauri dev mode requires a **continuously running** development server to load the React UI.

**Solution**:
```bash
# Start dev server (must run in background continuously)
npm run tauri:dev
```

**What This Does**:
1. Starts Vite dev server at `http://localhost:3000`
2. Compiles Rust backend
3. Opens desktop window that loads UI from localhost:3000
4. **Server must stay running** - DO NOT kill the process

**Symptoms**:
- ✅ Desktop window opens
- ❌ No UI elements visible
- ❌ "localhost refused to connect" in browser
- ❌ F12 DevTools work but show connection errors

**Why This Happens**:
- Dev server process stopped/completed
- Previous dev server wasn't properly backgrounded
- Network port 3000 is blocked

**Verification**:
```bash
# Check if server is running
curl http://localhost:3000
# Should return HTML, not "connection refused"

# Check if process is running
netstat -ano | findstr :3000
# Should show listening process
```

---

## Production Build Issues

**Problem**: `.exe` file from `src-tauri/target/release/` has no UI elements.

**Causes**:
1. **Old build not updated**: Check file timestamp - should be TODAY
2. **dist folder missing**: Run `npm run build` first
3. **Build cache corruption**: Delete `target/release` and rebuild

**Solution**:
```bash
# Clean rebuild
Remove-Item -Recurse -Force 'src-tauri\target\release'
Remove-Item -Recurse -Force 'dist'

# Full rebuild
npm run build           # Build React frontend to dist/
npm run tauri:build     # Build Rust + bundle into .exe

# Verify new .exe timestamp
ls 'src-tauri\target\release\gutachten-assistant.exe'
```

---

## Dev vs Production Differences

| Aspect | Dev Mode | Production Build |
|--------|----------|------------------|
| **Command** | `npm run tauri:dev` | `npm run tauri:build` |
| **Server** | Vite at localhost:3000 | Bundled into .exe |
| **Hot Reload** | ✅ Yes | ❌ No |
| **DevTools** | ✅ F12 works | ❌ Not available |
| **File Location** | `target/debug/` | `target/release/` |
| **Speed** | Faster iteration | Slower rebuild |

---

## Quick Reference

### Start Development
```bash
npm run tauri:dev
# Wait for "VITE ready in Xms" and "Running target\debug\gutachten-assistant.exe"
# Keep this terminal open!
```

### Build Production
```bash
npm run tauri:build
# Creates: src-tauri/target/release/gutachten-assistant.exe
```

### Check Server Status
```bash
# PowerShell
Get-NetTCPConnection -LocalPort 3000

# CMD
netstat -ano | findstr :3000
```

---

## Common Mistakes

❌ **Killing dev server too early**
✅ Keep `npm run tauri:dev` running during entire dev session

❌ **Testing old .exe file**
✅ Check file timestamp before testing production builds

❌ **Forgetting to rebuild after changes**
✅ Dev mode auto-reloads, but production requires full rebuild

❌ **Using production .exe for development**
✅ Use dev mode (`npm run tauri:dev`) for faster iteration

---

Last Updated: 2025-10-23
