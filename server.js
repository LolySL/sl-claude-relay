const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { createClient } = require("redis");

// --- PRIVATE ENDPOINT OWNER ---
const OWNER_UUID = "de2acd52-0c3c-4a84-af23-b5f865245c12";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- REDIS CLIENT ---
const redis = createClient({ url: process.env.REDIS_URL });
redis.on("error", (err) => console.error("Redis error:", err));
redis.connect().then(() => console.log("Redis connected."));

// --- REDIS KEY HELPERS ---
// Each Pro endpoint uses a product-specific suffix so sessions never bleed
// between Claude, Gemini, and Groq Pro conversations.
const KEY_SESSION     = (uuid) => `session:${uuid}:claude`;
const KEY_GEMINI      = (uuid) => `gemini:${uuid}:gemini`;
const KEY_GROQ        = (uuid) => `groq:${uuid}:groq`;
const KEY_SYSPROMPT   = (uuid) => `sysprompt:${uuid}`;
const KEY_HISTORY     = (uuid) => `history:${uuid}`;
const KEY_DARKMODE    = (uuid) => `darkmode:${uuid}`;
const KEY_CHATMODE    = (uuid) => `chatmode:${uuid}`;
const KEY_LATEST      = "latest_uuid";

// TTL: 7 days for session data
const SESSION_TTL = 60 * 60 * 24 * 7;
// Display history: last 20 messages stored for webpage reload
const HISTORY_MAX = 20;

// --- IN-MEMORY (non-persistent, lightweight) ---
const pending = {};
const pendingHandoffs = {};
const pastebinKeys = {};

// --- ENGINE LIGHT LINE: object tracking per owner ---
const engineRegistry = {};
const ENGINE_MAX_SCRIPTS = 3;
const ENGINE_TIMEOUT_MS  = 2 * 60 * 60 * 1000;

// ============================================================
// HELPER — clean expired Engine registrations
// ============================================================

function cleanExpiredEngines(avatar_uuid) {
  if (!engineRegistry[avatar_uuid]) return;
  const now = Date.now();
  const reg = engineRegistry[avatar_uuid];
  Object.keys(reg).forEach(obj_uuid => {
    if (now - reg[obj_uuid] > ENGINE_TIMEOUT_MS) {
      delete reg[obj_uuid];
    }
  });
  if (Object.keys(reg).length === 0) {
    delete engineRegistry[avatar_uuid];
  }
}

// ============================================================
// REDIS SESSION HELPERS
// ============================================================

async function getSession(key) {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

async function saveSession(key, messages) {
  try {
    await redis.setEx(key, SESSION_TTL, JSON.stringify(messages));
  } catch (e) {
    console.error("Redis save error:", e);
  }
}

async function getSystemPrompt(uuid) {
  try {
    return await redis.get(KEY_SYSPROMPT(uuid)) || null;
  } catch (e) {
    return null;
  }
}

async function saveSystemPrompt(uuid, prompt) {
  try {
    await redis.setEx(KEY_SYSPROMPT(uuid), SESSION_TTL, prompt);
  } catch (e) {
    console.error("Redis sysprompt save error:", e);
  }
}

async function appendDisplayHistory(uuid, role, text) {
  try {
    const key = KEY_HISTORY(uuid);
    const raw = await redis.get(key);
    let history = raw ? JSON.parse(raw) : [];
    history.push({ role, text });
    if (history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);
    await redis.setEx(key, SESSION_TTL, JSON.stringify(history));
  } catch (e) {
    console.error("Redis history append error:", e);
  }
}

async function getDisplayHistory(uuid) {
  try {
    const raw = await redis.get(KEY_HISTORY(uuid));
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

// ============================================================
// STANDARD LINE — Claude /chat
// HUD Pro only. Stateful. Redis session history.
// Session key: session:UUID:claude — isolated from Gemini and Groq.
// ============================================================

app.post("/chat", async (req, res) => {
  const { avatar_uuid, avatar_name, message, api_key, pastebin_key } = req.body;

  if (!avatar_uuid || !message || !api_key) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Store Pastebin key in memory if provided — used by /pastebin and handoff export
  if (pastebin_key) {
    pastebinKeys[avatar_uuid] = pastebin_key;
  }

  pending[avatar_uuid] = {
    avatar_uuid,
    user_message: message,
    reply: null
  };

  const sessionKey = KEY_SESSION(avatar_uuid);
  let messages = await getSession(sessionKey);
  messages.push({ role: "user", content: message });
  if (messages.length > 50) messages = messages.slice(-20);
  await saveSession(sessionKey, messages);

  await redis.set(KEY_LATEST, avatar_uuid);

  const storedPrompt = await getSystemPrompt(avatar_uuid);
  const systemPrompt = req.body.system_prompt
    ? req.body.system_prompt
    : storedPrompt
    ? storedPrompt
    : `You are a helpful AI assistant accessible from inside Second Life. The user's avatar name is ${avatar_name}. Keep responses concise, under 200 words, as they display on a small HUD screen. Time in the context feed is SL time, which is US Pacific time (UTC-7 in summer, UTC-8 in winter).`;

  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: systemPrompt,
        messages
      },
      {
        headers: {
          "x-api-key": api_key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        }
      }
    );

    let reply = response.data.content[0].text;

    const handoffMatch = reply.match(/\[HANDOFF\]([\s\S]*?)\[\/HANDOFF\]/);
    if (handoffMatch) {
      pendingHandoffs[avatar_uuid] = handoffMatch[1].trim();
      reply = "Working... ready.";
    }

    messages.push({ role: "assistant", content: reply });
    await saveSession(sessionKey, messages);

    await appendDisplayHistory(avatar_uuid, "user", message);
    await appendDisplayHistory(avatar_uuid, "assistant", reply);

    if (pending[avatar_uuid]) {
      pending[avatar_uuid].reply = reply;
    }

    const trimmed = reply.length > 1800 ? reply.substring(0, 1797) + "..." : reply;
    res.json({ reply: trimmed });

  } catch (err) {
    const status = err.response?.status;
    const errMsg = err.response?.data?.error?.message || "Unknown error";

    let userMsg = "Something went wrong. Please try again.";
    if (status === 401) userMsg = "Invalid API key. Please check your settings.";
    if (status === 429) userMsg = "Rate limit reached. Please wait a moment and try again.";

    if (pending[avatar_uuid]) {
      pending[avatar_uuid].reply = userMsg;
    }

    console.error("API error:", errMsg);
    res.json({ reply: userMsg });
  }
});

// ============================================================
// STANDARD LINE — Gemini /gemini-chat
// HUD Pro only. Stateful. Redis session history.
// Session key: gemini:UUID:gemini — isolated from Claude and Groq.
// ============================================================

app.post("/gemini-chat", async (req, res) => {
  const { avatar_uuid, avatar_name, message, gemini_key, system_prompt } = req.body;

  if (!avatar_uuid || !message || !gemini_key) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  pending[avatar_uuid] = {
    avatar_uuid,
    user_message: message,
    reply: null
  };

  const sessionKey = KEY_GEMINI(avatar_uuid);
  let messages = await getSession(sessionKey);
  messages.push({ role: "user", parts: [{ text: message }] });
  if (messages.length > 50) messages = messages.slice(-20);
  await saveSession(sessionKey, messages);

  const storedPrompt = await getSystemPrompt(avatar_uuid);
  const systemInstruction = system_prompt
    ? system_prompt
    : storedPrompt
    ? storedPrompt
    : `You are a helpful AI assistant accessible from inside Second Life. The user's avatar name is ${avatar_name}. Keep responses concise, under 200 words.`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${gemini_key}`,
      {
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: messages
      },
      { headers: { "content-type": "application/json" } }
    );

    const reply = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "I couldn't think of anything to say. Which is unusual.";

    messages.push({ role: "model", parts: [{ text: reply }] });
    await saveSession(sessionKey, messages);

    await appendDisplayHistory(avatar_uuid, "user", message);
    await appendDisplayHistory(avatar_uuid, "assistant", reply);

    if (pending[avatar_uuid]) pending[avatar_uuid].reply = reply;

    const trimmed = reply.length > 1800 ? reply.substring(0, 1797) + "..." : reply;
    res.json({ reply: trimmed });

  } catch (err) {
    const status = err.response?.status;
    const errMsg = err.response?.data?.error?.message || "Unknown error";

    let userMsg = "Something went wrong. Please try again.";
    if (status === 400) userMsg = "Bad request. Check your Gemini API key format.";
    if (status === 401 || status === 403) userMsg = "Invalid Gemini API key. Please re-enter it via the settings menu.";
    if (status === 429) userMsg = "Rate limit reached. Please wait a moment and try again.";

    if (pending[avatar_uuid]) pending[avatar_uuid].reply = userMsg;

    console.error("Gemini API error:", status, errMsg);
    res.json({ reply: userMsg });
  }
});

// ============================================================
// STANDARD LINE — Groq /groq-chat
// HUD Pro only. Stateful. Redis session history.
// Session key: groq:UUID:groq — isolated from Claude and Gemini.
// ============================================================

app.post("/groq-chat", async (req, res) => {
  const { avatar_uuid, avatar_name, message, groq_key, system_prompt } = req.body;

  if (!avatar_uuid || !message || !groq_key) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  pending[avatar_uuid] = {
    avatar_uuid,
    user_message: message,
    reply: null
  };

  const sessionKey = KEY_GROQ(avatar_uuid);
  let messages = await getSession(sessionKey);
  messages.push({ role: "user", content: message });
  if (messages.length > 50) messages = messages.slice(-20);
  await saveSession(sessionKey, messages);

  const storedPrompt = await getSystemPrompt(avatar_uuid);
  const systemInstruction = system_prompt
    ? system_prompt
    : storedPrompt
    ? storedPrompt
    : `You are a helpful AI assistant in Second Life. The user's avatar name is ${avatar_name}. Keep responses under 100 words.`;

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        max_tokens: 200,
        messages: [
          { role: "system", content: systemInstruction },
          ...messages
        ]
      },
      {
        headers: {
          "Authorization": `Bearer ${groq_key}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = response.data.choices?.[0]?.message?.content || "I have nothing to say. Which is unlike me.";

    messages.push({ role: "assistant", content: reply });
    await saveSession(sessionKey, messages);

    await appendDisplayHistory(avatar_uuid, "user", message);
    await appendDisplayHistory(avatar_uuid, "assistant", reply);

    if (pending[avatar_uuid]) pending[avatar_uuid].reply = reply;

    const trimmed = reply.length > 1800 ? reply.substring(0, 1797) + "..." : reply;
    res.json({ reply: trimmed });

  } catch (err) {
    const status = err.response?.status;
    const errMsg = err.response?.data?.error?.message || "Unknown error";

    let userMsg = "Something went wrong. Please try again.";
    if (status === 401) userMsg = "Invalid Groq API key. Please re-enter it via the settings menu.";
    if (status === 429) userMsg = "Rate limit reached. Please wait a moment and try again.";

    if (pending[avatar_uuid]) pending[avatar_uuid].reply = userMsg;

    console.error("Groq API error:", status, errMsg);
    res.json({ reply: userMsg });
  }
});

// ============================================================
// LIGHT LINE — Groq /groq-chat-light
// Marvin, Mirror, HUD Light (groq). Stateless. No Redis.
// Uses object_uuid for pending — no avatar_uuid needed.
// Summary calls (sum_ prefix) skip pending entirely.
// ============================================================

app.post("/groq-chat-light", async (req, res) => {
  const { object_uuid, message, groq_key, system_prompt } = req.body;

  if (!object_uuid || !message || !groq_key) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const isSummary = object_uuid.startsWith("sum_");

  if (!isSummary) {
    pending[object_uuid] = {
      avatar_uuid: object_uuid,
      user_message: message,
      reply: null
    };
  }

  const systemInstruction = system_prompt
    ? system_prompt
    : "You are a helpful AI assistant in Second Life. Keep responses under 100 words.";

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        max_tokens: 300,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: message }
        ]
      },
      {
        headers: {
          "Authorization": `Bearer ${groq_key}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = response.data.choices?.[0]?.message?.content || "I have nothing to say. Which is unlike me.";
    const trimmed = reply.length > 1800 ? reply.substring(0, 1797) + "..." : reply;

    if (!isSummary && pending[object_uuid]) {
      pending[object_uuid].reply = trimmed;
    }

    res.json({ reply: trimmed });

  } catch (err) {
    const status = err.response?.status;
    const errMsg = err.response?.data?.error?.message || "Unknown error";

    let userMsg = "Something went wrong. Please try again.";
    if (status === 401) userMsg = "Invalid Groq API key. Please check your API key notecard.";
    if (status === 429) userMsg = "Rate limit reached. Please wait a moment and try again.";

    if (!isSummary && pending[object_uuid]) {
      pending[object_uuid].reply = userMsg;
    }

    console.error("Groq Light API error:", status, errMsg);
    res.json({ reply: userMsg });
  }
});

// ============================================================
// LIGHT LINE — Claude /claude-chat-light
// HUD Light (claude). Stateless. No Redis.
// Uses object_uuid for pending — no avatar_uuid needed.
// Summary calls (sum_ prefix) skip pending entirely.
// ============================================================

app.post("/claude-chat-light", async (req, res) => {
  const { object_uuid, message, claude_key, system_prompt } = req.body;

  if (!object_uuid || !message || !claude_key) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const isSummary = object_uuid.startsWith("sum_");

  if (!isSummary) {
    pending[object_uuid] = {
      avatar_uuid: object_uuid,
      user_message: message,
      reply: null
    };
  }

  const systemInstruction = system_prompt
    ? system_prompt
    : "You are a helpful AI assistant in Second Life. Keep responses under 100 words.";

  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: systemInstruction,
        messages: [
          { role: "user", content: message }
        ]
      },
      {
        headers: {
          "x-api-key": claude_key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        }
      }
    );

    const reply = response.data.content[0].text || "I have nothing to say. Which is unusual.";
    const trimmed = reply.length > 1800 ? reply.substring(0, 1797) + "..." : reply;

    if (!isSummary && pending[object_uuid]) {
      pending[object_uuid].reply = trimmed;
    }

    res.json({ reply: trimmed });

  } catch (err) {
    const status = err.response?.status;
    const errMsg = err.response?.data?.error?.message || "Unknown error";

    let userMsg = "Something went wrong. Please try again.";
    if (status === 401) userMsg = "Invalid Claude API key. Please check your API key notecard.";
    if (status === 429) userMsg = "Rate limit reached. Please wait a moment and try again.";

    if (!isSummary && pending[object_uuid]) {
      pending[object_uuid].reply = userMsg;
    }

    console.error("Claude Light API error:", status, errMsg);
    res.json({ reply: userMsg });
  }
});

// ============================================================
// LIGHT LINE — Gemini /gemini-chat-light
// HUD Light (gemini). Stateless. No Redis.
// Uses object_uuid for pending — no avatar_uuid needed.
// Summary calls (sum_ prefix) skip pending entirely.
// ============================================================

app.post("/gemini-chat-light", async (req, res) => {
  const { object_uuid, message, gemini_key, system_prompt } = req.body;

  if (!object_uuid || !message || !gemini_key) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const isSummary = object_uuid.startsWith("sum_");

  if (!isSummary) {
    pending[object_uuid] = {
      avatar_uuid: object_uuid,
      user_message: message,
      reply: null
    };
  }

  const systemInstruction = system_prompt
    ? system_prompt
    : "You are a helpful AI assistant in Second Life. Keep responses under 100 words.";

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${gemini_key}`,
      {
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [
          { role: "user", parts: [{ text: message }] }
        ]
      },
      { headers: { "content-type": "application/json" } }
    );

    const reply = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "I have nothing to say. Which is unusual.";
    const trimmed = reply.length > 1800 ? reply.substring(0, 1797) + "..." : reply;

    if (!isSummary && pending[object_uuid]) {
      pending[object_uuid].reply = trimmed;
    }

    res.json({ reply: trimmed });

  } catch (err) {
    const status = err.response?.status;
    const errMsg = err.response?.data?.error?.message || "Unknown error";

    let userMsg = "Something went wrong. Please try again.";
    if (status === 400) userMsg = "Bad request. Check your Gemini API key format.";
    if (status === 401 || status === 403) userMsg = "Invalid Gemini API key. Please check your API key notecard.";
    if (status === 429) userMsg = "Rate limit reached. Please wait a moment and try again.";

    if (!isSummary && pending[object_uuid]) {
      pending[object_uuid].reply = userMsg;
    }

    console.error("Gemini Light API error:", status, errMsg);
    res.json({ reply: userMsg });
  }
});

// ============================================================
// LIGHT LINE — The Engine — /groq-chat-engine
// Stateless. No Redis. Object limit enforced in-memory.
// ============================================================

app.post("/groq-chat-engine", async (req, res) => {
  const { avatar_uuid, object_uuid, message, groq_key, system_prompt } = req.body;

  if (!avatar_uuid || !object_uuid || !message || !groq_key) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  cleanExpiredEngines(avatar_uuid);

  if (!engineRegistry[avatar_uuid]) {
    engineRegistry[avatar_uuid] = {};
  }

  const reg = engineRegistry[avatar_uuid];
  const alreadyRegistered = reg.hasOwnProperty(object_uuid);
  const activeCount = Object.keys(reg).length;

  if (!alreadyRegistered && activeCount >= ENGINE_MAX_SCRIPTS) {
    return res.json({
      reply: "You already have 3 Engine scripts running. Please deactivate one before activating another. This keeps all your characters responsive and stable."
    });
  }

  reg[object_uuid] = Date.now();

  const systemInstruction = system_prompt
    ? system_prompt
    : "You are a helpful AI assistant in Second Life. Keep responses under 100 words.";

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        max_tokens: 300,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: message }
        ]
      },
      {
        headers: {
          "Authorization": `Bearer ${groq_key}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = response.data.choices?.[0]?.message?.content || "I have nothing to say. Which is unlike me.";
    const trimmed = reply.length > 1800 ? reply.substring(0, 1797) + "..." : reply;
    res.json({ reply: trimmed });

  } catch (err) {
    const status = err.response?.status;
    const errMsg = err.response?.data?.error?.message || "Unknown error";

    let userMsg = "Something went wrong. Please try again.";
    if (status === 401) userMsg = "Invalid Groq API key. Please check your API key notecard.";
    if (status === 429) userMsg = "Rate limit reached. Please wait a moment and try again.";

    console.error("Groq Engine API error:", status, errMsg);
    res.json({ reply: userMsg });
  }
});

// ============================================================
// ENGINE PING
// ============================================================

app.post("/engine-ping", (req, res) => {
  const { avatar_uuid, object_uuid } = req.body;

  if (!avatar_uuid || !object_uuid) {
    return res.json({ ok: false });
  }

  cleanExpiredEngines(avatar_uuid);

  if (engineRegistry[avatar_uuid] && engineRegistry[avatar_uuid].hasOwnProperty(object_uuid)) {
    engineRegistry[avatar_uuid][object_uuid] = Date.now();
  }

  res.json({ ok: true });
});

// ============================================================
// HANDOFF — all files served from relay filesystem
// Protected by owner UUID
// ============================================================

app.post("/sethandoff", (req, res) => {
  const { avatar_uuid, file } = req.body;

  if (!avatar_uuid || avatar_uuid !== OWNER_UUID) {
    return res.status(403).json({ error: "Unauthorized." });
  }

  if (!file || typeof file !== "string") {
    return res.status(400).json({ error: "Missing file name." });
  }

  const safeName = path.basename(file);
  if (!safeName.endsWith(".md")) {
    return res.status(400).json({ error: "Only .md files allowed." });
  }

  const filePath = path.join(__dirname, "handoffs", safeName);

  fs.readFile(filePath, "utf8", async (err, data) => {
    if (err) {
      return res.status(404).json({ error: "File not found: " + safeName });
    }

    await saveSystemPrompt(avatar_uuid, data);
    delete pending[avatar_uuid];

    pending[avatar_uuid] = {
      avatar_uuid,
      user_message: "handoff",
      reply: "Context loaded. Claude is ready."
    };

    res.json({ ok: true });
  });
});

app.get("/gethandoff", (req, res) => {
  const uuid = req.query.uuid;

  if (!uuid) return res.json({});

  if (pendingHandoffs[uuid]) {
    const content = pendingHandoffs[uuid];
    delete pendingHandoffs[uuid];
    return res.json({ content });
  }

  res.json({});
});

// ============================================================
// POLL
// ============================================================

app.get("/poll", async (req, res) => {
  const uuid = req.query.uuid;

  if (!uuid) return res.json({});

  const dark = await redis.get(KEY_DARKMODE(uuid));
  const chat = await redis.get(KEY_CHATMODE(uuid));

  if (pending[uuid]) {
    const data = pending[uuid];
    if (data.reply) {
      delete pending[uuid];
    }
    return res.json({ ...data, dark: dark === "1", chat_active: chat === "1" });
  }

  res.json({ dark: dark === "1", chat_active: chat === "1" });
});

// ============================================================
// HISTORY — returns last N display messages for webpage reload
// ============================================================

app.get("/history", async (req, res) => {
  const uuid = req.query.uuid;

  if (!uuid) return res.json({ messages: [] });

  const history = await getDisplayHistory(uuid);
  const darkmode = await redis.get(KEY_DARKMODE(uuid));

  res.json({
    messages: history,
    dark: darkmode === "1"
  });
});

// ============================================================
// DARK MODE — store preference per avatar
// ============================================================

app.post("/darkmode", async (req, res) => {
  const { avatar_uuid, dark } = req.body;

  if (!avatar_uuid) return res.json({ ok: false });

  await redis.setEx(KEY_DARKMODE(avatar_uuid), SESSION_TTL, dark ? "1" : "0");
  res.json({ ok: true });
});

// ============================================================
// CHAT MODE — store ON/OFF state per avatar
// HUD Pro posts 1 (ON) or 0 (OFF) when chat is toggled.
// Webpage reads this on every poll to show OFF screen or chat UI.
// ============================================================

app.post("/chatmode", async (req, res) => {
  const { avatar_uuid, active } = req.body;

  if (!avatar_uuid) return res.json({ ok: false });

  await redis.setEx(KEY_CHATMODE(avatar_uuid), SESSION_TTL, active ? "1" : "0");
  res.json({ ok: true });
});

// ============================================================
// PASTEBIN — export chat history to user's Pastebin account
// Uses Pastebin key stored in memory from first /chat call.
// Fetches display history from Redis, posts to Pastebin API,
// returns the paste URL to the webpage.
// ============================================================

app.post("/pastebin", async (req, res) => {
  const { avatar_uuid } = req.body;

  if (!avatar_uuid) return res.status(400).json({ error: "Missing avatar_uuid" });

  const pbKey = pastebinKeys[avatar_uuid];
  if (!pbKey) return res.status(400).json({ error: "No Pastebin key on file. Send a message first." });

  const history = await getDisplayHistory(avatar_uuid);
  if (!history || history.length === 0) return res.status(400).json({ error: "No history to export." });

  let content = "REALai HUD — Chat Export\n";
  content += "========================\n\n";
  history.forEach(msg => {
    const label = msg.role === "user" ? "You" : "REALai";
    content += label + ":\n" + msg.text + "\n\n";
  });

  try {
    const params = new URLSearchParams();
    params.append("api_dev_key", pbKey);
    params.append("api_option", "paste");
    params.append("api_paste_code", content);
    params.append("api_paste_name", "REALai HUD Chat Export");

    const pbRes = await axios.post("https://pastebin.com/api/api_post.php", params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    // Pastebin returns the URL as plain text on success
    const url = pbRes.data;
    if (url.startsWith("https://")) {
      return res.json({ url });
    } else {
      console.error("Pastebin error:", url);
      return res.status(500).json({ error: "Pastebin rejected the request: " + url });
    }

  } catch (err) {
    console.error("Pastebin post error:", err.message);
    return res.status(500).json({ error: "Failed to reach Pastebin." });
  }
});

// ============================================================
// CLEAR
// Deletes all three suffixed Pro session keys so Clear History
// works fully regardless of which endpoint was last used.
// ============================================================

app.post("/clear", async (req, res) => {
  const { avatar_uuid } = req.body;

  if (!avatar_uuid) return res.json({ ok: false });

  if (avatar_uuid === "all") {
    Object.keys(pending).forEach(k => delete pending[k]);
    Object.keys(pendingHandoffs).forEach(k => delete pendingHandoffs[k]);
    Object.keys(engineRegistry).forEach(k => delete engineRegistry[k]);
    Object.keys(pastebinKeys).forEach(k => delete pastebinKeys[k]);
  } else {
    delete pending[avatar_uuid];
    delete pendingHandoffs[avatar_uuid];
    delete engineRegistry[avatar_uuid];
    delete pastebinKeys[avatar_uuid];
    try {
      await redis.del(KEY_SESSION(avatar_uuid));
      await redis.del(KEY_GEMINI(avatar_uuid));
      await redis.del(KEY_GROQ(avatar_uuid));
      await redis.del(KEY_SYSPROMPT(avatar_uuid));
      await redis.del(KEY_HISTORY(avatar_uuid));
      await redis.del(KEY_CHATMODE(avatar_uuid));
    } catch (e) {
      console.error("Redis clear error:", e);
    }
  }

  res.json({ ok: true });
});

// ============================================================
// LATEST
// ============================================================

app.get("/latest", async (req, res) => {
  try {
    const uuid = await redis.get(KEY_LATEST);
    if (!uuid) return res.json({});
    res.json({ avatar_uuid: uuid });
  } catch (e) {
    res.json({});
  }
});

// ============================================================
// PRIVATE HANDOFF
// ============================================================

app.post("/handoff-private", (req, res) => {
  const { avatar_uuid, file } = req.body;

  if (!avatar_uuid || avatar_uuid !== OWNER_UUID) {
    return res.status(403).json({ error: "Unauthorized." });
  }

  if (!file || typeof file !== "string") {
    return res.status(400).json({ error: "Missing file name." });
  }

  const safeName = path.basename(file);
  if (!safeName.endsWith(".md")) {
    return res.status(400).json({ error: "Only .md files allowed." });
  }

  const filePath = path.join(__dirname, "handoffs", safeName);

  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      return res.status(404).json({ error: "File not found: " + safeName });
    }
    res.json({ content: data });
  });
});

// ============================================================
// PING
// ============================================================

app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`SL Claude relay running on port ${PORT}`);
});