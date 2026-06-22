import 'dotenv/config';
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import express from "express";
import cors from "cors";
import * as path from "path";
import * as fs from "fs";

// Config imports
import { JWT_SECRET, NODE_ENV, PORT, FRONTEND_ORIGIN } from "./config/environment.js";
import { pool } from "./config/database.js";
import { UPLOADS_DIR_PATH } from "./config/multer.js";

// Database initialization
import { initializeSchema } from "./database/schema.js";

// Middleware imports
import { authenticateToken, isAdmin } from "./middleware/auth.js";

// Route imports
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { savesRouter } from "./routes/saves.js";
import { gamesRouter } from "./routes/games.js";
import { syncRouter } from "./routes/sync.js";
import { activationRouter } from "./routes/activation.js";
import { categoryRouter } from "./routes/category.js";
import { deviceKeysRouter } from "./routes/deviceKeys.js";
import { deviceLinksRouter } from "./routes/deviceLinks.js";
import { agentDownloadRouter } from "./routes/agentDownload.js";
import { settingsRouter } from "./routes/systemSettings.js";

// Utils imports
import { startUploadSessionCleanupInterval } from "./utils/uploads.js";
import { auditApiRequestMiddleware } from "./utils/audit.js";

const isProduction = NODE_ENV === "production";

async function startServer() {
  const app = express();

  // Initialize database schema
  await initializeSchema();

  // Start upload session cleanup interval
  startUploadSessionCleanupInterval();

  // Ensure upload directory exists
  if (!fs.existsSync(UPLOADS_DIR_PATH)) {
    fs.mkdirSync(UPLOADS_DIR_PATH, { recursive: true });
  }

  // CORS Configuration
  const corsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (mobile apps, curl requests)
      if (!origin || typeof FRONTEND_ORIGIN === 'string') return callback(null, true);
      
      // Convert single origin string to array for consistent handling
      const allowedOrigins = Array.isArray(FRONTEND_ORIGIN) ? FRONTEND_ORIGIN : [FRONTEND_ORIGIN];
      
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        console.warn(`CORS rejected origin: ${origin}`);
        callback(new Error('CORS policy violation'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400, // 24 hours
  };
  
  app.use(cors(corsOptions));
  console.log(`CORS enabled for origins:`, Array.isArray(FRONTEND_ORIGIN) ? FRONTEND_ORIGIN : [FRONTEND_ORIGIN]);
  
  // Timeout middleware
  const enableTimeoutForUploads = (req: any, res: any, next: any) => {
    if (!req.path.includes('/upload')) {
      res.setTimeout(600000); // 10 minutes for non-upload routes
    } else {
      res.setTimeout(1800000); // 30 minutes for upload routes
    }
    next();
  };
  app.use(enableTimeoutForUploads);
  
  // Body parser middleware (skip for upload endpoints)
  const skipBodyParserForUploads = (req: any, res: any, next: any) => {
    if (req.path.includes('/upload')) {
      return next();
    }
    express.json({ limit: '100mb' })(req, res, () => {
      express.urlencoded({ limit: '100mb', extended: true })(req, res, next);
    });
  };
  app.use(skipBodyParserForUploads);

  // Socket monitoring for uploads
  const monitorUploadSockets = (req: any, res: any, next: any) => {
    if (req.path.includes('/upload')) {
      console.log(`[${new Date().toISOString()}] Upload request: ${req.path}`);
      if (req.socket) {
        req.socket.setTimeout(1800000); // 30 minutes
        req.socket.setKeepAlive(true, 60000); // Keep-alive every 60s
      }
    }
    next();
  };
  app.use(monitorUploadSockets);

  // Audit API requests
  app.use(auditApiRequestMiddleware);

  // Routes
  app.use(authRouter);
  app.use(usersRouter);
  app.use(savesRouter);
  app.use(gamesRouter);
  app.use(syncRouter);
  app.use(activationRouter);
  app.use(categoryRouter);
  app.use(deviceKeysRouter);
  app.use(deviceLinksRouter);
  app.use(agentDownloadRouter);
  app.use(settingsRouter);

  // Health check
  app.get("/api/health", async (req, res) => {
    let db = "unknown";
    try { await pool.query("SELECT 1"); db = "up"; } catch { db = "down"; }
    res.json({ status: "ok", timestamp: new Date().toISOString(), env: NODE_ENV, db });
  });

  // Serve frontend in production
  if (isProduction) {
    const distPath = path.join(process.cwd(), '..', 'frontend', 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } else {
      app.get('*', (req, res) => {
        res.json({
          status: "running",
          message: "Cloudsave Hub Backend API is running. Frontend static files are not hosted in this container.",
          timestamp: new Date().toISOString()
        });
      });
    }
  }

  // Start server
  app.listen(PORT as number, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (!isProduction) console.log(`API Backend listening on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

