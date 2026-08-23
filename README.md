# Pitwall — F.R.I.D.A.Y. AI Race Engineer 🏎️🤖

**Pitwall** is a live telemetry dashboard and AI-powered race engineer for sim racing (Forza Horizon/Motorsport). It captures real-time UDP telemetry data from the game and uses a highly optimized physics engine and lightweight AI models to give you dynamic, context-aware audio feedback via a custom "F.R.I.D.A.Y." persona.

![Pitwall Dashboard](docs/dashboard.png)

## Features

- **Live Telemetry HUD**: A beautiful, Iron Man / cyberpunk-themed dashboard with frosted glass UI, RPM rings, G-force meters, and dynamic wireframe rendering of the car's state.
- **F.R.I.D.A.Y. AI Engineer**: Connects to the Groq API (using ultra-fast models like `allam-2-7b`) and Edge-TTS for low-latency, clinical, hyper-efficient audio commentary.
- **Dynamic Physics Engine**: Infers car mass, kinetic energy dissipation during crashes, and detects tire blowouts, snaps, and drifts based solely on raw telemetry (speed, G-forces, slip angles).
- **Two-Way Comms**: Integrated continuous mic allows you to speak to F.R.I.D.A.Y. during the race, powered by Groq's Whisper API.
- **Standalone Windows Build**: Easily compiled into a single `.exe` file that starts a local Flask server and opens the dashboard in a lightweight PyWebView window.

## Architecture

- **Backend**: Python (Flask, Flask-SocketIO, Groq API, Edge-TTS)
- **Frontend**: HTML5 Canvas, Vanilla CSS, JS WebSockets
- **Optimization**: The UI rendering loop is highly optimized. The complex wireframe car chassis is rendered exactly *once* to an off-screen canvas buffer, reducing GPU/CPU load to near-zero while maintaining a dynamic 60FPS feel for rolling wheels and active suspension.

## Setup Instructions

1. Install Python 3.10+
2. Run `pip install -r requirements.txt`
3. Add your Groq API key in the dashboard settings menu (`/setup`).
4. **Forza Settings**: Go to HUD & Gameplay > Data Out. Set to `ON`, IP to `127.0.0.1`, and Port to `5300`.
5. Run `python app.py` or double-click the compiled `Pitwall_Live_Telemetry.exe`.

---
*Built for absolute performance and immersion on the virtual track.*
