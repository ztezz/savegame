import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import * as path from "node:path";

export async function hashFile(filePath: string): Promise<{ fileSize: number; sha256: string }> {
  const hash = createHash("sha256");
  let fileSize = 0;

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => {
      fileSize += chunk.length;
      hash.update(chunk);
    });
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  return { fileSize, sha256: hash.digest("hex").toLowerCase() };
}

export function sanitizeOriginalFilename(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const filename = path.posix.basename(path.win32.basename(value.trim()))
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  if (!filename || filename === "." || filename === "..") return null;
  return filename.slice(0, 255);
}
