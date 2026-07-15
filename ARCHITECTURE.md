# Backend Architecture Refactoring

## Overview
The backend has been refactored from a monolithic `server.ts` file into a modular, organized structure for improved maintainability and scalability.

## Project Structure

```
backend/
├── server.ts              # Main entry point (imports and initializes all modules)
├── config/                # Configuration files
│   ├── database.ts       # SQLite connection and pg-compatible adapter
│   ├── environment.ts    # Environment variables
│   └── multer.ts         # File upload configuration
├── database/              # Database related
│   ├── schema.ts         # Database schema initialization
│   └── types.ts          # TypeScript interfaces for entities
├── middleware/            # Express middleware
│   └── auth.ts           # Authentication and authorization (JWT, isAdmin)
├── routes/                # API routes (organized by feature)
│   ├── auth.ts           # POST /api/auth/register, POST /api/auth/login
│   ├── users.ts          # CRUD operations for user management
│   ├── saves.ts          # Game save management (upload, download, delete)
│   ├── games.ts          # Game metadata management
│   ├── sync.ts           # Sync operations (push, pull, logs)
│   ├── activation.ts     # Activation file chunked upload & management
│   └── sqliteAdmin.ts    # Admin-only SQLite browser, SQL console, backup, maintenance
├── utils/                 # Utility functions
│   └── uploads.ts        # Upload session management
└── package.json

```

## Module Descriptions

### Config (`/config`)
- **database.ts**: SQLite connection setup and query adapter
- **environment.ts**: Centralized environment variables and constants
- **multer.ts**: File upload middleware configuration

### Database (`/database`)
- **schema.ts**: Initializes database tables on startup, ensures admin user exists
- **types.ts**: TypeScript interfaces (User, Game, Save, Device, UploadSession)

### Middleware (`/middleware`)
- **auth.ts**: 
  - `authenticateToken`: JWT verification middleware
  - `isAdmin`: Role-based access control middleware

### Routes (`/routes`)
Each route file exports a Router and manages a specific feature:

- **auth.ts**: Authentication (register, login)
- **users.ts**: User management (list, create, update, delete)
- **saves.ts**: Game save management (upload, list, history, download, delete)
- **games.ts**: Game metadata (rename, categorize)
- **sync.ts**: Device sync operations (logs, push, pull)
- **activation.ts**: Activation file uploads (chunked + single, list, download, delete)
- **sqliteAdmin.ts**: Full SQLite management for administrators

### Utils (`/utils`)
- **uploads.ts**: Manages chunked upload sessions, cleanup scheduler

## Key Improvements

### 1. **Modularity**
- Each route is in its own file, making it easy to locate and modify features
- Config is centralized for easier management

### 2. **Maintainability**
- Clear separation of concerns (config, middleware, routes, utils)
- Easy to add new routes or modify existing ones

### 3. **Scalability**
- Each module can be independently tested
- Easy to add new features without touching existing code

### 4. **Local Persistence**
- SQLite stores application data without requiring an external database service
- WAL mode and foreign-key enforcement are enabled at startup

### 5. **File Organization**
- Logical grouping of related files
- Easier to navigate for developers

## Adding a New Feature

1. **Create a new route file** in `/routes/newfeature.ts`
2. **Define the Router** and export it
3. **Import in server.ts** and add with `app.use(newFeatureRouter)`
4. **Add types** to `/database/types.ts` if needed
5. **Add middleware** to `/middleware` if required

Example:
```typescript
// routes/newfeature.ts
import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";

export const newFeatureRouter = Router();

newFeatureRouter.get("/api/newfeature", authenticateToken, async (req, res) => {
  res.json({ data: "example" });
});
```

Then in `server.ts`:
```typescript
import { newFeatureRouter } from "./routes/newfeature.js";
// ...
app.use(newFeatureRouter);
```

## Database Modes

### SQLite
- Data is stored at `data/savegame.sqlite` by default
- Set `DATABASE_PATH` to override the location
- Set `SQLITE_SCAN_PATHS` to a comma-separated allowlist of directories that the admin manager may scan and create databases in; the main database directory is always included
- Set `ADMIN_INITIAL_PASSWORD` on the first production run to create the admin account
- Mount the database directory on persistent storage when running in a container
- Admins can open **Quản lý SQLite** in the dashboard to browse tables, edit rows, run SQL, check integrity, optimize, checkpoint WAL, and download a consistent backup
- The manager detects `.sqlite`, `.sqlite3`, and `.db` files by validating their SQLite header, supports switching between detected databases, and can create a new empty SQLite file in an allowed directory
- SQLite management endpoints use the `/api/admin/sqlite` prefix and require an authenticated Admin account
- File-access SQL such as `ATTACH`, `DETACH`, `VACUUM INTO`, and `load_extension()` is blocked; data-changing operations are written to the audit log

## Running the Server

```bash
# Development mode (with file watching)
npm run dev

# Build TypeScript
npm run build

# Production mode
npm start
```

## Error Handling

- All routes include proper error handling
- Database errors are logged and returned by the affected endpoint
- File upload errors are logged and reported to client

## Security

- JWT token verification on protected routes
- Role-based access control (Admin-only endpoints)
- File upload size limits (500MB)
- SQL injection protection through parameterized queries

## Future Enhancements

- [ ] Add input validation layer
- [ ] Implement request logging/audit trail
- [ ] Add rate limiting
- [ ] Implement caching layer (Redis)
- [ ] Add comprehensive error codes
- [ ] Separate admin routes to `/admin` namespace
