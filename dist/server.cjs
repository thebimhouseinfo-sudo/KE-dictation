var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_vite = require("vite");
var import_dotenv = __toESM(require("dotenv"), 1);
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = 3e3;
app.use(import_express.default.json());
var audioPathCache = /* @__PURE__ */ new Map();
function findFileRecursive(dir, targetFilename) {
  try {
    const files = import_fs.default.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const name = file.name;
      if (file.isDirectory()) {
        if (name === "node_modules" || name === "dist" || name === ".git" || name === ".next") {
          continue;
        }
        const found = findFileRecursive(import_path.default.join(dir, name), targetFilename);
        if (found) return found;
      } else if (name === targetFilename) {
        return import_path.default.join(dir, name);
      }
    }
  } catch (err) {
  }
  return null;
}
app.get("/audio/:filename", (req, res) => {
  const filename = req.params.filename;
  if (audioPathCache.has(filename)) {
    const cachedPath = audioPathCache.get(filename);
    if (import_fs.default.existsSync(cachedPath)) {
      return res.sendFile(cachedPath);
    } else {
      audioPathCache.delete(filename);
    }
  }
  const searchDirs = [
    import_path.default.join(process.cwd(), "public", "audio"),
    import_path.default.join(process.cwd(), "audio"),
    import_path.default.join(process.cwd(), "public"),
    process.cwd()
  ];
  for (const baseDir of searchDirs) {
    if (!import_fs.default.existsSync(baseDir)) continue;
    const foundPath = findFileRecursive(baseDir, filename);
    if (foundPath) {
      audioPathCache.set(filename, foundPath);
      return res.sendFile(foundPath);
    }
  }
  return res.status(404).send(`Audio file ${filename} not found`);
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
