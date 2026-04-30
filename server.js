const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const sessions = {};
const pending = {};

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

  if (sessions[avatar_uuid].length > 20) {
    sessions[avatar_uuid] = sessions[avatar_uuid].slice(-20);
  }

  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        system: `You are a helpful AI assistant accessible from inside Second Life. The user's avatar name is ${avatar_name}. Keep responses concise, under 200 words, as they display on a small HUD screen.`,
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

    const reply = response.data.content[0].text;

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
    if (status === 401) userMsg = "Invalid API key. Please check your Claude_Settings notecard.";
    if (status === 429) userMsg = "Rate limit reached. Please wait a moment and try again.";

    if (pending[avatar_uuid]) {
      pending[avatar_uuid].reply = userMsg;
    }

    console.error("API error:", errMsg);
    res.json({ reply: userMsg });
  }
});

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

app.post("/clear", (req, res) => {
  const { avatar_uuid } = req.body;
  if (avatar_uuid) {
    delete sessions[avatar_uuid];
    delete pending[avatar_uuid];
  }
  res.json({ ok: true });
});

app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`SL Claude relay running on port ${PORT}`);
});