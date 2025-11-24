import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { randomBytes } from "crypto";

const UPLOAD_DIR = "public/uploads/memes";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
}

export async function uploadMemeImage(file: File): Promise<string | null> {
  try {
    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error("Invalid file type. Only JPG, PNG, GIF, and WebP are allowed.");
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error("File too large. Maximum size is 10MB.");
    }

    await ensureUploadDir();

    // Generate unique filename
    const ext = path.extname(file.name);
    const filename = `${randomBytes(16).toString("hex")}${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    // Save file
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);

    // Return public URL
    return `/uploads/memes/${filename}`;
  } catch (error) {
    console.error("Error uploading file:", error);
    return null;
  }
}

export async function parseFormData(request: Request): Promise<FormData> {
  return await request.formData();
}

