# Delete Save Feature - Debugging Guide

## Issue
DELETE `/api/save/:id` endpoint is not working.

## What We've Done

### 1. **Added Comprehensive Logging**
   - Modified `/api/save/:id` DELETE endpoint to log:
     - User authentication status
     - Whether save exists in database/memory
     - Ownership verification
     - File deletion status
   - Modified authentication middleware to log user info setup

### 2. **Verified Code Structure**
   - ✅ Delete endpoint is correctly compiled
   - ✅ Router is properly exported and used in server.ts
   - ✅ JWT token includes user ID
   - ✅ TypeScript types are correct

## How to Test & Debug

### Option 1: Use PowerShell Test Script (Recommended)
```bash
cd d:\code\cloudsave-hub\backend
.\test-delete.ps1
```

This script will:
1. Login as admin
2. Upload a test save file
3. List saves before deletion
4. Delete the save
5. List saves after deletion
6. Show detailed responses at each step

### Option 2: Manual Testing with Curl
```bash
# 1. Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Save the token from response
# Then use it for the delete request:

# 2. Delete save (replace ID and TOKEN)
curl -X DELETE http://localhost:3001/api/save/1 \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Option 3: Check Server Logs
Run the server in development mode and watch the logs:
```bash
cd d:\code\cloudsave-hub\backend
npm run dev
```

Then perform a delete operation and watch the console for logs like:
```
🔐 Auth check for DELETE /api/save/:id: Header present
✅ Token verified - User: { id: 1, username: 'admin', role: 'Admin' }
✅ Using JWT user data (demo mode): { id: 1, username: 'admin', role: 'Admin' }
🗑️ DELETE /api/save/1 - User: admin
  DEMO: Total saves in memory: 1
  DEMO: Save found: YES
  DEMO: Game found: YES
  DEMO: Ownership check - game?.userId=1, req.user.id=1
  DEMO: Delete complete
```

## Possible Issues & Solutions

### ❌ 401 Unauthorized
**Cause**: No authentication token or invalid token
**Solution**: 
1. Make sure you're logged in first
2. Check token is being sent in Authorization header
3. Verify JWT_SECRET env variable is set

### ❌ 403 Forbidden  
**Cause**: User doesn't own the save
**Solution**:
1. Check that the save belongs to the logged-in user
2. In demo mode, user ID must match between upload and delete
3. Admin users can delete any save

### ❌ 404 Not Found
**Cause**: Save doesn't exist
**Solution**:
1. Verify the save ID is correct
2. Make sure you uploaded the save first
3. In demo mode, saves are stored in memory (lost on server restart)

### ❌ 500 Server Error
**Cause**: Database error or unexpected error
**Solution**:
1. Check server logs for detailed error message
2. Verify the SQLite database path is writable
3. Check file system permissions for uploads directory

## Database vs Demo Mode

### Demo Mode (No Database)
- Saves stored in memory
- Lost on server restart
- Faster testing
- No database setup needed

### Database Mode
- Set `DATABASE_PATH` if the default `data/savegame.sqlite` location is not suitable
- Mount the SQLite database directory on persistent storage in production
- Requires database to be running
- More reliable for production

## Files Modified for Debugging

1. **`routes/saves.ts`** - Added detailed logging to DELETE endpoint
2. **`middleware/auth.ts`** - Added logging to show auth flow

## Next Steps

1. Run the test script or manual test
2. Share the console output/logs when describing the issue
3. Check if the problem is:
   - Authentication related?
   - Data not found?
   - Ownership check failing?
   - Filesystem error?

## Quick Fix Checklist

- [ ] Backend is running (`npm run dev` or `npm start`)
- [ ] Frontend can upload saves successfully
- [ ] You're logged in with correct credentials
- [ ] Token is being sent with DELETE request
- [ ] Save ID exists and belongs to current user
- [ ] Check browser Network tab to see actual request/response
- [ ] Check server console for error logs

## Contact Info

If you're still experiencing issues after debugging:
1. Run the test script and share the output
2. Share server console logs from npm run dev
3. Share the browser's Network tab for the failed DELETE request
