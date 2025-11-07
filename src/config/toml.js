/**
 * TOML configuration loader using the 'toml' library
 * The toml library properly handles:
 *  - comments with '#'
 *  - key = "string" | number | true/false
 *  - arrays: [1,2] or ["a","b"]
 *  - tables: [section] and [section.sub]
 *  - arrays of tables: [[backends]]
 */
export async function loadToml(filepath) {
  try {
    const file = Bun.file(filepath);
    if (!(await file.exists())) {
      console.log("Warning: config.toml file not found, using default values");
      return {};
    }
    const text = await file.text();

    // Use the TOML library for proper parsing including [[backends]] arrays of tables
    try {
      const { default: toml } = await import("toml");
      const parsed = toml.parse(text);
      return parsed;
    } catch (tomlError) {
      console.error("Error parsing TOML with toml library:", tomlError?.message || tomlError);
      console.log("Falling back to minimal parser (note: [[backends]] arrays may not work properly)");

      // Minimal parser fallback - simplified for basic cases only
      const lines = text.split(/\r?\n/);
      const root = {};
      let current = root;

      function setKey(obj, keyPath, value) {
        const parts = keyPath.split(".");
        let node = obj;
        for (let i = 0; i < parts.length - 1; i++) {
          const p = parts[i].trim();
          if (!node[p] || typeof node[p] !== "object") node[p] = {};
          node = node[p];
        }
        node[parts[parts.length - 1].trim()] = value;
      }

      function parseValue(v) {
        const s = v.trim();
        if (s === "true") return true;
        if (s === "false") return false;
        if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
        if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1);
        if (s.startsWith("[") && s.endsWith("]")) {
          const inner = s.slice(1, -1).trim();
          if (!inner) return [];
          return inner
            .split(",")
            .map((x) => parseValue(x));
        }
        const num = Number(s);
        if (!Number.isNaN(num)) return num;
        return s;
      }

      for (let raw of lines) {
        const noComment = raw.replace(/#.*/, "");
        const line = noComment.trim();
        if (!line) continue;
        if (line.startsWith("[") && line.endsWith("]")) {
          const section = line.slice(1, -1).trim();
          if (section.startsWith("[") && section.endsWith("]")) {
            // Array of tables - not supported in minimal parser
            console.warn("Warning: Array of tables [[...]] not supported in fallback parser");
            continue;
          }
          setKey(root, section, root[section] || {});
          current = section.split(".").reduce((acc, k) => acc[k], root);
          continue;
        }
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        const val = line.slice(eq + 1);
        const parsed = parseValue(val);
        if (current === root && key.includes(".")) {
          setKey(root, key, parsed);
        } else {
          current[key] = parsed;
        }
      }
      return root;
    }
  } catch (e) {
    console.log("Warning: failed to read/parse config.toml:", e?.message || e);
    return {};
  }
}