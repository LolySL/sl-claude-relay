const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const fs = require("fs");

// --- PRIVATE ENDPOINT OWNER ---
const OWNER_UUID = "de2acd52-0c3c-4a84-af23-b5f865245c12";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- STANDARD LINE SESSION STORAGE ---
const sessions = {};
const geminiSessions = {};
const groqSessions = {};
const pending = {};
const systemPrompts = {};
const pendingHandoffs = {};

// --- ENGINE LIGHT LINE: object tracking per owner ---
// Structure: engineRegistry[avatar_uuid] = { object_uuid: lastSeenTimestamp }
const engineRegistry = {};
const ENGINE_MAX_SCRIPTS  = 3;
const ENGINE_TIMEOUT_MS   = 2 * 60 * 60 * 1000; // 2 hours

const HANDOFF_URLS = {
  HUD: "https://raw.githubusercontent.com/LolySL/sl-claude-relay/main/handoffs/HUD.md",
  Cielomar: "https://raw.githubusercontent.com/LolySL/sl-claude-relay/main/handoffs/Cielomar.md",
  Flake: "https://raw.githubusercontent.com/LolySL/sl-claude-relay/main/handoffs/Flake.md",
  Inventory: "https://raw.githubusercontent.com/LolySL/sl-claude-relay/main/handoffs/Inventory.md",
  Roles: "https://raw.githubusercontent.com/LolySL/sl-claude-relay/main/handoffs/Roles.md"
};

// ============================================================
// HELPER — clean expired Engine registrations for one owner
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
// STANDARD LINE — Claude /chat
// ============================================================

app.post("/chat", async (req, res) => {
  const { avatar_uuid, avatar_name, message, api_key } = req.body;

  if (!avatar_uuid || !message || !api_key) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!sessions[avatar_uuid]) {
    sessions[avatar_uuid] = [];
  }

  pending[avatar_uuid] = {
    avatar_uuid,
    user_message: message,
    reply: null
  };

  sessions[avatar_uuid].push({ role: "user", content: message });

  if (sessions[avatar_uuid].length > 50) {
    sessions[avatar_uuid] = sessions[avatar_uuid].slice(-20);
  }

  const systemPrompt = req.body.system_prompt
    ? req.body.system_prompt
    : systemPrompts[avatar_uuid]
    ? systemPrompts[avatar_uuid]
    : `You are a helpful AI assistant accessible from inside Second Life. The user's avatar name is ${avatar_name}. Keep responses concise, under 200 words, as they display on a small HUD screen.`;

  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: systemPrompt,
        messages: sessions[avatar_uuid]
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

    sessions[avatar_uuid].push({ role: "assistant", content: reply });

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
  const { avatar_uuid, avatar_name, message, gemini_key, system_prompt } = req.body;

  if (!avatar_uuid || !message || !gemini_key) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!geminiSessions[avatar_uuid]) {
    geminiSessions[avatar_uuid] = [];
  }

  pending[avatar_uuid] = {
    avatar_uuid,
    user_message: message,
    reply: null
  };

  geminiSessions[avatar_uuid].push({
    role: "user",
    parts: [{ text: message }]
  });

  if (geminiSessions[avatar_uuid].length > 50) {
    geminiSessions[avatar_uuid] = geminiSessions[avatar_uuid].slice(-20);
  }

  const systemInstruction = system_prompt
    ? system_prompt
    : systemPrompts[avatar_uuid]
    ? systemPrompts[avatar_uuid]
    : `You are a helpful AI assistant accessible from inside Second Life. The user's avatar name is ${avatar_name}. Keep responses concise, under 200 words.`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${gemini_key}`,
      {
        system_instruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: geminiSessions[avatar_uuid]
      },
      {
        headers: {
          "content-type": "application/json"
        }
      }
    );

    const reply = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "I couldn't think of anything to say. Which is unusual.";

    geminiSessions[avatar_uuid].push({
      role: "model",
      parts: [{ text: reply }]
    });

    if (pending[avatar_uuid]) {
      pending[avatar_uuid].reply = reply;
    }

    const trimmed = reply.length > 1800 ? reply.substring(0, 1797) + "..." : reply;
    res.json({ reply: trimmed });

  } catch (err) {
    const status = err.response?.status;
    const errMsg = err.response?.data?.error?.message || "Unknown error";

    let userMsg = "Something went wrong. Please try again.";
    if (status === 400) userMsg = "Bad request. Check your Gemini API key format.";
    if (status === 401 || status === 403) userMsg = "Invalid Gemini API key. Please re-enter it via the settings menu.";
    if (status === 429) userMsg = "Rate limit reached. Please wait a moment and try again.";

    if (pending[avatar_uuid]) {
      pending[avatar_uuid].reply = userMsg;
    }

    console.error("Gemini API error:", status, errMsg);
    res.json({ reply: userMsg });
  }
});

// ============================================================
// STANDARD LINE — Groq /groq-chat
// ============================================================

app.post("/groq-chat", async (req, res) => {
  const { avatar_uuid, avatar_name, message, groq_key, system_prompt } = req.body;

  if (!avatar_uuid || !message || !groq_key) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!groqSessions[avatar_uuid]) {
    groqSessions[avatar_uuid] = [];
  }

  pending[avatar_uuid] = {
    avatar_uuid,
    user_message: message,
    reply: null
  };

  groqSessions[avatar_uuid].push({ role: "user", content: message });

  if (groqSessions[avatar_uuid].length > 50) {
    groqSessions[avatar_uuid] = groqSessions[avatar_uuid].slice(-20);
  }

  const systemInstruction = system_prompt
    ? system_prompt
    : systemPrompts[avatar_uuid]
    ? systemPrompts[avatar_uuid]
    : `You are a helpful AI assistant in Second Life. The user's avatar name is ${avatar_name}. Keep responses under 100 words.`;

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        max_tokens: 200,
        messages: [
          { role: "system", content: systemInstruction },
          ...groqSessions[avatar_uuid]
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

    groqSessions[avatar_uuid].push({ role: "assistant", content: reply });

    if (pending[avatar_uuid]) {
      pending[avatar_uuid].reply = reply;
    }

    const trimmed = reply.length > 1800 ? reply.substring(0, 1797) + "..." : reply;
    res.json({ reply: trimmed });

  } catch (err) {
    const status = err.response?.status;
    const errMsg = err.response?.data?.error?.message || "Unknown error";

    let userMsg = "Something went wrong. Please try again.";
    if (status === 401) userMsg = "Invalid Groq API key. Please re-enter it via the settings menu.";
    if (status === 429) userMsg = "Rate limit reached. Please wait a moment and try again.";

    if (pending[avatar_uuid]) {
      pending[avatar_uuid].reply = userMsg;
    }

    console.error("Groq API error:", status, errMsg);
    res.json({ reply: userMsg });
  }
});

// ============================================================
// LIGHT LINE — Marvin / Flowers — /groq-chat-light
// Stateless. No session storage. Object UUID only.
// ============================================================

app.post("/groq-chat-light", async (req, res) => {
  const { object_uuid, message, groq_key, system_prompt } = req.body;

  if (!object_uuid || !message || !groq_key) {
    return res.status(400).json({ error: "Missing required fields" });
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
    res.json({ reply: trimmed });

  } catch (err) {
    const status = err.response?.status;
    const errMsg = err.response?.data?.error?.message || "Unknown error";

    let userMsg = "Something went wrong. Please try again.";
    if (status === 401) userMsg = "Invalid Groq API key. Please check your API key notecard.";
    if (status === 429) userMsg = "Rate limit reached. Please wait a moment and try again.";

    console.error("Groq Light API error:", status, errMsg);
    res.json({ reply: userMsg });
  }
});

// ============================================================
// LIGHT LINE — The Engine — /groq-chat-engine
// Stateless. Tracks active object UUIDs per owner (max 3).
// Ping refreshes registration timestamp.
// ============================================================

app.post("/groq-chat-engine", async (req, res) => {
  const { avatar_uuid, object_uuid, message, groq_key, system_prompt } = req.body;

  if (!avatar_uuid || !object_uuid || !message || !groq_key) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Clean expired registrations for this owner
  cleanExpiredEngines(avatar_uuid);

  if (!engineRegistry[avatar_uuid]) {
    engineRegistry[avatar_uuid] = {};
  }

  const reg = engineRegistry[avatar_uuid];
  const alreadyRegistered = reg.hasOwnProperty(object_uuid);
  const activeCount = Object.keys(reg).length;

  // If not registered and already at limit — deny
  if (!alreadyRegistered && activeCount >= ENGINE_MAX_SCRIPTS) {
    return res.json({
      reply: "You already have 3 Engine scripts running. Please deactivate one before activating another. This keeps all your characters responsive and stable."
    });
  }

  // Register or refresh timestamp
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
// ENGINE PING — refreshes object registration timestamp
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
// HANDOFF
// ============================================================

app.post("/sethandoff", async (req, res) => {
  const { avatar_uuid, project } = req.body;

  if (!avatar_uuid || !project) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const url = HANDOFF_URLS[project];
  if (!url) {
    return res.status(400).json({ error: "Unknown project: " + project });
  }

  try {
    const response = await axios.get(url);
    const content = response.data;

    systemPrompts[avatar_uuid] = content;
    sessions[avatar_uuid] = [];
    delete pending[avatar_uuid];

    const confirmMsg = "Context loaded. Claude is ready.";
    pending[avatar_uuid] = {
      avatar_uuid,
      user_message: "handoff",
      reply: confirmMsg
    };

    res.json({ ok: true });

  } catch (err) {
    console.error("Handoff fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch handoff file" });
  }
});

app.get("/gethandoff", (req, res) => {
  const uuid = req.query.uuid;

  if (!uuid) {
    return res.json({});
  }

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

app.get("/poll", (req, res) => {
  const uuid = req.query.uuid;

  if (!uuid) {
    return res.json({});
  }

  if (pending[uuid]) {
    const data = pending[uuid];
    if (data.reply) {
      delete pending[uuid];
    }
    return res.json(data);
  }

  res.json({});
});

// ============================================================
// CLEAR — fixed to actually clear all sessions when "all"
// ============================================================

app.post("/clear", (req, res) => {
  const { avatar_uuid } = req.body;

  if (!avatar_uuid) {
    return res.json({ ok: false });
  }

  if (avatar_uuid === "all") {
    // Clear everything
    Object.keys(sessions).forEach(k => delete sessions[k]);
    Object.keys(geminiSessions).forEach(k => delete geminiSessions[k]);
    Object.keys(groqSessions).forEach(k => delete groqSessions[k]);
    Object.keys(pending).forEach(k => delete pending[k]);
    Object.keys(systemPrompts).forEach(k => delete systemPrompts[k]);
    Object.keys(pendingHandoffs).forEach(k => delete pendingHandoffs[k]);
    Object.keys(engineRegistry).forEach(k => delete engineRegistry[k]);
  } else {
    delete sessions[avatar_uuid];
    delete geminiSessions[avatar_uuid];
    delete groqSessions[avatar_uuid];
    delete pending[avatar_uuid];
    delete systemPrompts[avatar_uuid];
    delete pendingHandoffs[avatar_uuid];
    delete engineRegistry[avatar_uuid];
  }

  res.json({ ok: true });
});

// ============================================================
// MISC
// ============================================================

app.get("/latest", (req, res) => {
  const uuids = Object.keys(sessions);
  if (uuids.length === 0) return res.json({});
  res.json({ avatar_uuid: uuids[uuids.length - 1] });
});

// ============================================================
// PRIVATE HANDOFF — Loly's personal files
// Serves .md files from handoffs/ folder directly from relay
// Protected by owner UUID — rejects all other requests
// Not affected by /clear or any other general endpoint
// ============================================================

app.post("/handoff-private", (req, res) => {
  const { avatar_uuid, file } = req.body;

  if (!avatar_uuid || avatar_uuid !== OWNER_UUID) {
    return res.status(403).json({ error: "Unauthorized." });
  }

  if (!file || typeof file !== "string") {
    return res.status(400).json({ error: "Missing file name." });
  }

  // Sanitize — only allow simple filenames, no path traversal
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

app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`SL Claude relay running on port ${PORT}`);
});