import multer from "multer";
import * as fs from "fs";
import * as path from "path";
import { MAX_FILE_SIZE } from "./environment.js";

const resolveUploadsDir = () => {
  if (process.env.UPLOADS_DIR) return process.env.UPLOADS_DIR;
  if (fs.existsSync("/data")) return path.join("/data", "uploads");
  return path.join(process.cwd(), "uploads");
};

const UPLOADS_DIR = resolveUploadsDir();

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

console.log(`Upload storage directory: ${UPLOADS_DIR}`);

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

export const upload = multer({ 
  storage,
  limits: { fileSize: MAX_FILE_SIZE }
});

export const UPLOADS_DIR_PATH = UPLOADS_DIR;
