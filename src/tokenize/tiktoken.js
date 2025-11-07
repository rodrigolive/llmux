import { logger } from "../logging.js";

let tiktokenModule = null;

export async function ensureTiktoken() {
  if (tiktokenModule !== null) return tiktokenModule;
  try {
    const mod = await import("@dqbd/tiktoken").catch(() => null);
    tiktokenModule = mod;
  } catch {
    tiktokenModule = null;
  }
  return tiktokenModule;
}

export async function getTokenizerForModel(openaiModel) {
  const mod = await ensureTiktoken();
  if (!mod) return null;
  // Heuristic: use cl100k_base for modern models; @dqbd/tiktoken needs a model-specific encoding JSON.
  // In Bun, we can use encodingForModel if provided; otherwise cl100k_base.
  try {
    if (mod.encodingForModel) {
      return mod.encodingForModel(openaiModel);
    }
  } catch {}
  if (mod.get_encoding) {
    return mod.get_encoding("cl100k_base");
  }
  if (mod.Tiktoken) {
    // Last-ditch: not ideal without BPE JSON. Skip.
    return null;
  }
  return null;
}

export async function countTokensFast(messagesOrText, openaiModel = "gpt-4o") {
  try {
    const enc = await getTokenizerForModel(openaiModel);
    if (!enc) {
      // fallback: chars/4
      if (Array.isArray(messagesOrText)) {
        let chars = 0;
        for (const msg of messagesOrText) {
          const c = msg?.content;
          if (!c) continue;
          if (typeof c === "string") chars += c.length;
          else if (Array.isArray(c)) {
            for (const block of c) {
              if (block?.type === "text" && block?.text) chars += String(block.text).length;
            }
          }
        }
        return Math.max(1, Math.floor(chars / 4));
      } else {
        return Math.max(1, Math.floor(String(messagesOrText || "").length / 4));
      }
    }

    if (Array.isArray(messagesOrText)) {
      let total = 0;
      for (const msg of messagesOrText) {
        const c = msg?.content;
        if (!c) continue;
        if (typeof c === "string") total += enc.encode(c).length;
        else if (Array.isArray(c)) {
          for (const block of c) {
            if (block?.type === "text" && block?.text) total += enc.encode(block.text).length;
          }
        }
      }
      enc.free?.();
      return total;
    } else {
      const n = enc.encode(String(messagesOrText || "")).length;
      enc.free?.();
      return n;
    }
  } catch (e) {
    logger.warning("Token counting failed, fallback to chars/4:", e?.message || e);
    if (Array.isArray(messagesOrText)) {
      let chars = 0;
      for (const msg of messagesOrText) {
        const c = msg?.content;
        if (!c) continue;
        if (typeof c === "string") chars += c.length;
        else if (Array.isArray(c)) {
          for (const block of c) {
            if (block?.type === "text" && block?.text) chars += String(block.text).length;
          }
        }
      }
      return Math.max(1, Math.floor(chars / 4));
    }
    return Math.max(1, Math.floor(String(messagesOrText || "").length / 4));
  }
}