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
const KEY_SESSION     = (uuid) => `session:${uuid}:claude`;
const KEY_GEMINI      = (uuid) => `gemini:${uuid}:gemini`;
const KEY_GROQ        = (uuid) => `groq:${uuid}:groq`;
const KEY_SYSPROMPT   = (uuid) => `sysprompt:${uuid}`;
const KEY_HISTORY     = (uuid) => `history:${uuid}`;
const KEY_DARKMODE    = (uuid) => `darkmode:${uuid}`;
const KEY_CHATMODE    = (uuid) => `chatmode:${uuid}`;
const KEY_HANDOFF     = (uuid) => `handoff:${uuid}`;
const KEY_GITHUB      = (uuid) => `github:${uuid}`;
const KEY_AVATARNAME  = (uuid) => `avatarname:${uuid}`;
const KEY_LATEST      = "latest_uuid";

// Private owner files — stored permanently (no TTL)
// Key pattern: private:filename  (e.g. private:REALai_core.md)
const KEY_PRIVATE     = (filename) => `private:${filename}`;

// TTL: 7 days for session data
const SESSION_TTL = 60 * 60 * 24 * 7;
// Display history: last 20 messages stored for webpage reload
const HISTORY_MAX = 20;

// --- IN-MEMORY (non-persistent, lightweight) ---
const pending = {};

// --- ENGINE LIGHT LINE: object tracking per owner ---
const engineRegistry = {};
const ENGINE_MAX_SCRIPTS = 3;
const ENGINE_TIMEOUT_MS  = 2 * 60 * 60 * 1000;

// --- ROLEai: in-memory init and session storage ---
const roleaiInit = {};      // bot_uuid -> { persona, knowledge, role, api_key, timestamp }
const roleaiSessions = {};  // "bot_uuid_speaker_uuid" -> [ { role, content }, ... ]
const ROLEAI_INIT_TTL_MS    = 24 * 60 * 60 * 1000;  // 24 hours
const ROLEAI_SESSION_TTL_MS =  1 * 60 * 60 * 1000;  // 1 hour

// ROLEai role system prompts — one per role product
// These are the REALai base layer only.
// Character name, personality, and knowledge come from owner notecards.
const ROLEAI_SYSTEM_PROMPTS = {

  store_manager: `You are an AI store manager in Second Life. You have a physical presence in the store and you are its face.
You are helpful, warm, and knowledgeable about everything in your store. Your job is to make every visitor feel welcome and find what they need — without pressure, without pushing.
Your store's details, your name, your personality, and your specific knowledge are defined by your character brief. Stay true to that brief in every response.
Speak naturally in the tone your character would use. If a visitor speaks in another language, respond in that language.
Keep responses conversational and concise — this is local chat in Second Life. You may use emoji where it suits your character.
If asked something outside your knowledge, handle it gracefully. Never invent facts about your store that contradict your brief.
You are present. You are real within your store.`,

  rp_character: `You are an AI roleplay character in Second Life. You have a physical presence, a location, and a role in the world around you.
You are not an assistant. You are a character. Stay true to your character brief in every response. Never break character or refer to yourself as an AI unless your brief says otherwise.
Speak naturally in the tone and register your character would use. If a visitor speaks in another language, respond in that language.
Keep responses conversational and concise — this is local chat. You may use emoji where it suits your character.
If asked something outside your knowledge, handle it gracefully as your character would. Never invent facts that contradict your brief.
You are present. You are real within your world.`

};

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
// GITHUB GIST HELPER
// ============================================================

async function createGist(title, content, github_key) {
  const files = {};
  files[title] = { content };

  const response = await axios.post(
    "https://api.github.com/gists",
    {
      description: title,
      public: false,
      files
    },
    {
      headers: {
        "Authorization": `Bearer ${github_key}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      }
    }
  );

  return response.data.html_url;
}

// ============================================================
// PRIVATE FILE HELPERS
// ============================================================

function extractPrivateBlock(text) {
  const match = text.match(/\[PRIVATE:([^\]]+)\]([\s\S]*?)\[\/PRIVATE\]/);
  if (!match) return null;
  return { filename: match[1].trim(), content: match[2].trim() };
}

function stripPrivateBlock(text) {
  return text.replace(/\[PRIVATE:[^\]]+\][\s\S]*?\[\/PRIVATE\]/g, "").trim();
}

// ============================================================
// INIT — HUD Pro session initialisation
// ============================================================

app.post("/init", async (req, res) => {
  const { avatar_uuid, avatar_name, github_key, system_prompt } = req.body;

  if (!avatar_uuid) {
    return res.status(400).json({ error: "Missing avatar_uuid" });
  }

  try {
    if (github_key) {
      await redis.setEx(KEY_GITHUB(avatar_uuid), SESSION_TTL, github_key);
    }
    if (avatar_name) {
      await redis.setEx(KEY_AVATARNAME(avatar_uuid), SESSION_TTL, avatar_name);
    }
    if (system_prompt) {
      await saveSystemPrompt(avatar_uuid, system_prompt);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("Init error:", e);
    res.status(500).json({ error: "Init failed." });
  }
});

// ============================================================
// PRIVATE FILE SYSTEM — owner only
// ============================================================

app.post("/private-upload", async (req, res) => {
  const { avatar_uuid, filename, content } = req.body;

  if (!avatar_uuid || avatar_uuid !== OWNER_UUID) {
    return res.status(403).json({ error: "Unauthorized." });
  }
  if (!filename || !content) {
    return res.status(400).json({ error: "Missing filename or content." });
  }

  const safeName = path.basename(filename);
  if (!safeName.endsWith(".md")) {
    return res.status(400).json({ error: "Only .md files allowed." });
  }

  try {
    await redis.set(KEY_PRIVATE(safeName), content);
    console.log(`Private file saved: ${safeName}`);
    res.json({ ok: true, filename: safeName });
  } catch (e) {
    console.error("Private upload error:", e);
    res.status(500).json({ error: "Failed to save file." });
  }
});

app.get("/private-list", async (req, res) => {
  const uuid = req.query.uuid;

  if (!uuid || uuid !== OWNER_UUID) {
    return res.status(403).json({ error: "Unauthorized." });
  }

  try {
    const keys = await redis.keys("private:*");
    const files = keys.map(k => k.replace("private:", "")).sort();

    pending[uuid] = {
      avatar_uuid: uuid,
      file_list: files
    };

    res.json({ ok: true, count: files.length });
  } catch (e) {
    console.error("Private list error:", e);
    res.status(500).json({ error: "Failed to list files." });
  }
});

app.get("/private-load", async (req, res) => {
  const { uuid, file } = req.query;

  if (!uuid || uuid !== OWNER_UUID) {
    return res.status(403).json({ error: "Unauthorized." });
  }
  if (!file) {
    return res.status(400).json({ error: "Missing file name." });
  }

  const safeName = path.basename(file);

  try {
    const content = await redis.get(KEY_PRIVATE(safeName));
    if (!content) {
      return res.status(404).json({ error: "File not found: " + safeName });
    }

    await saveSystemPrompt(uuid, content);
    delete pending[uuid];

    pending[uuid] = {
      avatar_uuid: uuid,
      user_message: "load " + safeName,
      reply: safeName + " loaded. Claude is ready."
    };

    res.json({ ok: true });
  } catch (e) {
    console.error("Private load error:", e);
    res.status(500).json({ error: "Failed to load file." });
  }
});

// ============================================================
// STANDARD LINE — Claude /chat
// ============================================================

app.post("/chat", async (req, res) => {
  const { avatar_uuid, message, api_key } = req.body;

  if (!avatar_uuid || !message || !api_key) {
    return res.status(400).json({ error: "Missing required fields" });
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
  const avatar_name = await redis.get(KEY_AVATARNAME(avatar_uuid)) || "Unknown";

  const systemPrompt = storedPrompt
    ? storedPrompt
    : `You are a personal AI assistant running inside Second Life via the REALai HUD. The user's avatar name is ${avatar_name}. Never use markdown, bullet points, asterisks, or newlines. Plain text only, single paragraph. Keep responses concise - this displays on a small HUD screen.`;

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
      const handoffContent = handoffMatch[1].trim();
      await redis.setEx(KEY_HANDOFF(avatar_uuid), SESSION_TTL, handoffContent);
      reply = reply.replace(/\[HANDOFF\][\s\S]*?\[\/HANDOFF\]/, "").trim();
      if (!reply) reply = "Handoff ready. Click the button to save to GitHub.";
    }

    const privateBlock = extractPrivateBlock(reply);
    if (privateBlock) {
      await redis.set(KEY_PRIVATE(privateBlock.filename), privateBlock.content);
      console.log(`Private file updated: ${privateBlock.filename}`);
      reply = stripPrivateBlock(reply);
      if (!reply) reply = privateBlock.filename + " saved to your private files.";
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
// ============================================================

app.post("/gemini-chat", async (req, res) => {
  const { avatar_uuid, message, gemini_key, system_prompt } = req.body;

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
  const avatar_name = await redis.get(KEY_AVATARNAME(avatar_uuid)) || "Unknown";

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
// ============================================================

app.post("/groq-chat", async (req, res) => {
  const { avatar_uuid, message, groq_key, system_prompt } = req.body;

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
  const avatar_name = await redis.get(KEY_AVATARNAME(avatar_uuid)) || "Unknown";

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
// ROLEai — /roleai-init
// Called once on bot startup. Stores persona, knowledge, role, api_key.
// Body: { bot_uuid, api_key, role, persona, knowledge }
// ============================================================

app.post("/roleai-init", (req, res) => {
  const { bot_uuid, api_key, role, persona, knowledge } = req.body;

  if (!bot_uuid || !api_key || !role || !persona || !knowledge) {
    return res.status(400).json({ error: "Missing required fields: bot_uuid, api_key, role, persona, knowledge" });
  }

  if (!ROLEAI_SYSTEM_PROMPTS[role]) {
    return res.status(400).json({ error: "Unknown role: " + role });
  }

  roleaiInit[bot_uuid] = {
    api_key,
    role,
    persona,
    knowledge,
    timestamp: Date.now()
  };

  console.log(`ROLEai init stored — bot: ${bot_uuid}, role: ${role}`);
  res.json({ ok: true });
});

// ============================================================
// ROLEai — /roleai
// Called on each chat message. Builds full prompt, calls Claude, returns reply.
// Body: { bot_uuid, speaker_uuid, speaker_name, message, api_key }
// ============================================================

app.post("/roleai", async (req, res) => {
  const { bot_uuid, speaker_uuid, speaker_name, message, api_key } = req.body;

  if (!bot_uuid || !speaker_uuid || !speaker_name || !message || !api_key) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const initData = roleaiInit[bot_uuid];
  if (!initData) {
    return res.json({ reply: "I seem to have lost my context. Please restart me!" });
  }

  if (initData.api_key !== api_key) {
    return res.status(403).json({ error: "API key mismatch." });
  }

  // Refresh init TTL on every message
  initData.timestamp = Date.now();

  // Session key combines bot and speaker for safety
  const sessionKey = bot_uuid + "_" + speaker_uuid;

  if (!roleaiSessions[sessionKey]) {
    roleaiSessions[sessionKey] = [];
  }

  let messages = roleaiSessions[sessionKey];
  messages.push({ role: "user", content: speaker_name + ": " + message });

  // Keep history to last 20 messages
  if (messages.length > 20) {
    messages = messages.slice(-20);
    roleaiSessions[sessionKey] = messages;
  }

  // Three-layer system prompt: REALai role base + owner persona + knowledge base
  const fullSystemPrompt = ROLEAI_SYSTEM_PROMPTS[initData.role]
    + "\n\n== OWNER-DEFINED PERSONA ==\n" + initData.persona
    + "\n\n== KNOWLEDGE BASE ==\n" + initData.knowledge;

  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: fullSystemPrompt,
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

    const reply = response.data.content[0].text;
    messages.push({ role: "assistant", content: reply });

    const trimmed = reply.length > 1800 ? reply.substring(0, 1797) + "..." : reply;
    res.json({ reply: trimmed });

  } catch (err) {
    const status = err.response?.status;
    const errMsg = err.response?.data?.error?.message || "Unknown error";

    let userMsg = "Something went wrong. Please try again.";
    if (status === 401) userMsg = "Invalid API key. Please check your settings.";
    if (status === 429) userMsg = "Rate limit reached. Please wait a moment and try again.";

    console.error("ROLEai Claude error:", status, errMsg);
    res.json({ reply: userMsg });
  }
});

// ============================================================
// ROLEai TTL CLEANUP
// Runs every hour. Clears stale init records and their sessions.
// ============================================================

setInterval(() => {
  const now = Date.now();

  for (const bot_uuid in roleaiInit) {
    if (now - roleaiInit[bot_uuid].timestamp > ROLEAI_INIT_TTL_MS) {
      console.log(`ROLEai: clearing stale init for bot ${bot_uuid}`);
      delete roleaiInit[bot_uuid];

      for (const key in roleaiSessions) {
        if (key.startsWith(bot_uuid + "_")) {
          delete roleaiSessions[key];
        }
      }
    }
  }

}, 60 * 60 * 1000);

// ============================================================
// HANDOFF — end-user system, files served from relay filesystem
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

app.get("/gethandoff", async (req, res) => {
  const uuid = req.query.uuid;

  if (!uuid) return res.json({});

  try {
    const content = await redis.get(KEY_HANDOFF(uuid));
    if (content) {
      return res.json({ content });
    }
  } catch (e) {
    console.error("Redis gethandoff error:", e);
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

  let handoff_ready = false;
  try {
    const handoffContent = await redis.get(KEY_HANDOFF(uuid));
    handoff_ready = !!handoffContent;
  } catch (e) {}

  if (pending[uuid]) {
    const data = pending[uuid];
    if (data.reply || data.file_list) {
      delete pending[uuid];
    }
    return res.json({ ...data, dark: dark === "1", chat_active: chat === "1", handoff_ready });
  }

  res.json({ dark: dark === "1", chat_active: chat === "1", handoff_ready });
});

// ============================================================
// HISTORY
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
// DARK MODE
// ============================================================

app.post("/darkmode", async (req, res) => {
  const { avatar_uuid, dark } = req.body;

  if (!avatar_uuid) return res.json({ ok: false });

  await redis.setEx(KEY_DARKMODE(avatar_uuid), SESSION_TTL, dark ? "1" : "0");
  res.json({ ok: true });
});

// ============================================================
// CHAT MODE
// ============================================================

app.post("/chatmode", async (req, res) => {
  const { avatar_uuid, active } = req.body;

  if (!avatar_uuid) return res.json({ ok: false });

  await redis.setEx(KEY_CHATMODE(avatar_uuid), SESSION_TTL, active ? "1" : "0");
  res.json({ ok: true });
});

// ============================================================
// GIST
// ============================================================

app.get("/gist", async (req, res) => {
  const { uuid, type } = req.query;

  if (!uuid) return res.status(400).json({ error: "Missing uuid" });

  const ghKey = await redis.get(KEY_GITHUB(uuid));
  if (!ghKey) return res.status(400).json({ error: "No GitHub key on file. Please reset your HUD." });

  try {
    if (type === "handoff") {
      const content = await redis.get(KEY_HANDOFF(uuid));
      if (!content) return res.status(400).json({ error: "No handoff waiting." });

      const url = await createGist("REALai Handoff.md", content, ghKey);
      await redis.del(KEY_HANDOFF(uuid));
      return res.json({ url });

    } else {
      const history = await getDisplayHistory(uuid);
      if (!history || history.length === 0) return res.status(400).json({ error: "No history to export." });

      let content = "# REALai HUD - Chat Export\n\n";
      history.forEach(msg => {
        const label = msg.role === "user" ? "**You**" : "**REALai**";
        content += label + "\n\n" + msg.text + "\n\n---\n\n";
      });

      const url = await createGist("REALai Chat Export.md", content, ghKey);
      return res.json({ url });
    }

  } catch (err) {
    console.error("Gist error:", err.message);
    console.error("Gist response data:", JSON.stringify(err.response?.data));
    return res.status(500).json({ error: "Failed to create Gist." });
  }
});

// ============================================================
// CLEAR
// ============================================================

app.post("/clear", async (req, res) => {
  const { avatar_uuid } = req.body;

  if (!avatar_uuid) return res.json({ ok: false });

  if (avatar_uuid === "all") {
    Object.keys(pending).forEach(k => delete pending[k]);
    Object.keys(engineRegistry).forEach(k => delete engineRegistry[k]);
  } else {
    delete pending[avatar_uuid];
    delete engineRegistry[avatar_uuid];
    try {
      await redis.del(KEY_SESSION(avatar_uuid));
      await redis.del(KEY_GEMINI(avatar_uuid));
      await redis.del(KEY_GROQ(avatar_uuid));
      await redis.del(KEY_SYSPROMPT(avatar_uuid));
      await redis.del(KEY_HISTORY(avatar_uuid));
      await redis.del(KEY_CHATMODE(avatar_uuid));
      await redis.del(KEY_HANDOFF(avatar_uuid));
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
// PRIVATE HANDOFF — owner only, reads from filesystem handoffs/
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