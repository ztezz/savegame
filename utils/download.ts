import * as fs from "fs";
import * as path from "path";

const STREAM_HIGH_WATER_MARK = 4 * 1024 * 1024; // 4MB chunk size for high-throughput downloads

const fallbackFileName = (fileName: string) => {
  const baseName = path.basename(fileName || "download");
  return baseName.replace(/["\\\r\n]/g, "_");
};

export function streamFileDownload(res: any, filePath: string, fileName: string) {
  const stat = fs.statSync(filePath);
  const totalSize = stat.size;
  const safeName = fallbackFileName(fileName);

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Accel-Buffering", "no");

  const req = res.req;
  const rangeHeader = req?.headers?.range;

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d+)?/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

      if (start >= 0 && start < totalSize && end >= start && end < totalSize) {
        const chunkSize = (end - start) + 1;

        res.statusCode = 206; // Partial Content
        res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
        res.setHeader("Content-Length", chunkSize);

        const stream = fs.createReadStream(filePath, { 
          start, 
          end, 
          highWaterMark: STREAM_HIGH_WATER_MARK 
        });

        stream.on("error", (err) => {
          console.error("Download partial stream error:", err);
          if (!res.headersSent) res.status(500).json({ error: "Download failed" });
          else res.destroy(err);
        });

        stream.pipe(res);
        return;
      }
    }
  }

  // Fallback: Send entire file (200 OK)
  res.setHeader("Content-Length", totalSize);

  const stream = fs.createReadStream(filePath, { highWaterMark: STREAM_HIGH_WATER_MARK });
  stream.on("error", (err) => {
    console.error("Download stream error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Download failed" });
    else res.destroy(err);
  });
  stream.pipe(res);
}
