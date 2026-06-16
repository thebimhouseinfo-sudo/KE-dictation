import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;


app.use(express.json());

// Helper to perform recursive file search excluding heavy development folders
const audioPathCache = new Map<string, string>();

function findFileRecursive(dir: string, targetFilename: string): string | null {
  try {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const name = file.name;
      if (file.isDirectory()) {
        if (name === "node_modules" || name === "dist" || name === ".git" || name === ".next") {
          continue;
        }
        const found = findFileRecursive(path.join(dir, name), targetFilename);
        if (found) return found;
      } else if (name === targetFilename) {
        return path.join(dir, name);
      }
    }
  } catch (err) {
    // Ignore error
  }
  return null;
}

// Serve local audio files by searching recursively and using a fast memory cache
app.get("/audio/:filename", (req, res) => {
  const filename = req.params.filename;

  // 1. Check cache first
  if (audioPathCache.has(filename)) {
    const cachedPath = audioPathCache.get(filename)!;
    if (fs.existsSync(cachedPath)) {
      return res.sendFile(cachedPath);
    } else {
      audioPathCache.delete(filename);
    }
  }

  // 2. Search folders in priority order
  const searchDirs = [
    path.join(process.cwd(), "public", "audio"),
    path.join(process.cwd(), "audio"),
    path.join(process.cwd(), "public"),
    process.cwd()
  ];

  for (const baseDir of searchDirs) {
    if (!fs.existsSync(baseDir)) continue;
    const foundPath = findFileRecursive(baseDir, filename);
    if (foundPath) {
      audioPathCache.set(filename, foundPath);
      return res.sendFile(foundPath);
    }
  }

  return res.status(404).send(`Audio file ${filename} not found`);
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
