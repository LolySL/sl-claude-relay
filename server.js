const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

// In-memory conversation history per avatar UUID
const sessions = {};

app.post("/chat", async (req, res) => {
  const { avatar_uuid, avatar_name, message, api_key } = req.body;

  if (!avatar_uuid || !message || !api_key) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Initialize session if new
  if (!sessions[avatar_uuid]) {
    sessions[avatar_uuid] = [];
  }

  // Add user message to history
  sessions[avatar_uuid].push({
    role: "user",
    content: message
  });

  // Keep only last 20 messages to stay within token limits
  if (sessions[avatar_uuid].length > 20) {
    sessions[avatar_uuid] = sessions[avatar_uuid].slice(-20);
  }

  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        system: `You are a helpful AI assistant accessible from inside Second Life. The user's avatar name is ${avatar_name}. Keep responses concise — under 200 words — as they display on a small HUD screen.`,
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

    // Add assistant reply to history
    sessions[avatar_uuid].push({
      role: "assistant",
      content: reply
    });

    // Trim reply to 1800 chars to stay within LSL's 2048 byte limit
    const trimmed = reply.length > 1800 ? reply.substring(0, 1797) + "..." : reply;

    res.json({ reply: trimmed });

  } catch (err) {
    const status = err.response?.status;
    const errMsg = err.response?.data?.error?.message || "Unknown error";

    if (status === 401) {
      return res.json({ reply: "Invalid API key. Please check your Claude_Settings notecard." });
    }
    if (status === 429) {
      return res.json({ reply: "Rate limit reached. Please wait a moment and try again." });
    }

    console.error("API error:", errMsg);
    res.json({ reply: "Something went wrong. Please try again." });
  }
});

// Clear session history for an avatar
app.post("/clear", (req, res) => {
  const { avatar_uuid } = req.body;
  if (avatar_uuid && sessions[avatar_uuid]) {
    delete sessions[avatar_uuid];
  }
  res.json({ ok: true });
});

// Health check — Render uses this to keep the service alive
app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`SL Claude relay running on port ${PORT}`);
});