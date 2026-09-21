# Pocket AI — Voice-First Mobile AI Agent

> **Pocket AI** is a voice-first personal mobile AI assistant inspired by the interaction style of Siri.
> It goes beyond a conversational chatbot by executing real mobile actions through a closed-loop Agent/Tool architecture.

---

## 🌟 The Core Agent Loop

```
🎙️ Speak naturally (User Voice)
    ↓
🧠 Speech-to-Text & Intent Understanding (Web Speech API)
    ↓
🤖 AI Agent Reasoning & Tool Selection (OpenRouter LLM)
    ↓
🛡️ Parameter Validation & Confirmation Gates (ToolValidator)
    ↓
📱 Real Mobile Action Execution (Android Intents & Web APIs)
    ↓
🔄 Execution Result Loopback to Agent (Closed Feedback Cycle)
    ↓
💬 Natural Contextual Confirmation
    ↓
🔊 Voice Synthesis Output (OpenRouter deepgram/flux-tts:free, flux-cole-en)
```

---

## 🔧 Real Mobile Actions (Zero Fake Stubs)

Pocket AI avoids demo mockups and implements **real, functional capabilities**:

| Tool | Capability & Implementation | Android Intent / Hardware Integration |
| :--- | :--- | :--- |
| **`set_alarm`** | Schedules a real alarm with hour/minute validation | `android.intent.action.SET_ALARM` + Web Audio buzzer + Web Notification |
| **`start_timer`** | Starts an active countdown timer with ticking and audio alert | `android.intent.action.SET_TIMER` + in-app circular countdown timer |
| **`create_note`** | Persists notes to device storage and enables export | `android.intent.action.SEND` (Google Keep / Notes) + IndexedDB/LocalStorage |
| **`open_app`** | Launches installed mobile apps or deep links | Camera (`IMAGE_CAPTURE`), YouTube, Google Maps (`geo:`), Dialer (`tel:`), WhatsApp |
| **`get_weather`** | Retrieves real-time weather and temperature | Live REST API call to Open-Meteo with device GPS coordinates or city geocoding |
| **`get_information`** | Factual knowledge Q&A for informational queries | Direct contextual reasoning |

---

## 🎨 Siri-Inspired Experience

- **Fluid Waveform Canvas Orb**: An organic glowing orb that reacts in real time to speech levels, reasoning cycles, execution states, and audio playback.
- **Active Interactive Cards**: Live timers with pause/resume/reset, alarm badges, expandable notes, and weather reports.
- **User Confirmation Gate**: Sensitive operations (e.g. data deletion or messages) prompt for voice/touch confirmation before execution.
- **Multi-Input Fallback**: Seamless switch between natural voice and keyboard input when in quiet environments.

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js (v18+)
- npm or yarn

### 2. Clone & Install
```bash
git clone https://github.com/lunadadxx-del/PocketAI.git
cd PocketAI
npm install
```

### 3. Environment Configuration
Create a `.env.local` file in the root directory:
```env
VITE_OPENROUTER_API_KEY=your_openrouter_api_key
VITE_OPENROUTER_AGENT_MODEL=inclusionai/ling-3.0-flash-vl:free
VITE_OPENROUTER_TTS_MODEL=deepgram/flux-tts:free
VITE_OPENROUTER_TTS_VOICE=flux-cole-en
```

> **Security Note**: `.env.local` is included in `.gitignore` and is never committed. You can also configure or update your API key at runtime inside the in-app **Settings** modal.

### 4. Run Development Server
```bash
npm run dev -- --host
```
Open `http://localhost:3000` (or the network IP on your mobile phone browser on the same Wi-Fi).

### 5. Build for Production
```bash
npm run build
```

---

## 🔒 Security & Privacy
- **Client-Side Secret Storage**: API keys are stored solely in memory / local device storage and sent directly to OpenRouter via encrypted HTTPS.
- **Strict Git Exclusions**: All environment secrets and build artifacts are strictly excluded by `.gitignore`.

---

## 📄 License
MIT License
