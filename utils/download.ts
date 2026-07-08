import * as fs from "fs";
import * as path from "path";

const STREAM_HIGH_WATER_MARK = 1024 * 1024;

const fallbackFileName = (fileName: string) => {
  const baseName = path.basename(fileName || "download");
  return baseName.replace(/["\\\r\n]/g, "_");
};

export function streamFileDownload(res: any, filePath: string, fileName: string) {
  const stat = fs.statSync(filePath);
  const safeName = fallbackFileName(fileName);

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Length", stat.size);
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
  res.setHeader("Accept-Ranges", "bytes");

  const stream = fs.createReadStream(filePath, { highWaterMark: STREAM_HIGH_WATER_MARK });
  stream.on("error", (err) => {
    console.error("Download stream error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Download failed" });
    else res.destroy(err);
  });
  stream.pipe(res);
}
