# Pitwall — F.R.I.D.A.Y. AI Race Engineer

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

### 1. Prerequisites
- Install **Python 3.10+**. Ensure you check the box to "Add Python to PATH" during installation.
- Get a free API Key from [Groq](https://console.groq.com/keys) (required for the F.R.I.D.A.Y. AI).

### 2. Installation
Clone this repository to your local machine:
```bash
git clone https://github.com/sathwik-e/Pitwall.git
cd Pitwall
```
Install the required dependencies:
```bash
pip install -r requirements.txt
```

### 3. Running the App
Start the telemetry server and UI:
```bash
python3 app.py
```
*(Alternatively, Windows users can double-click `build.bat` to compile everything into a standalone `Pitwall_Live_Telemetry.exe` that runs without a terminal).*

### 4. Application Configuration
1. Once the app launches, click the **⚙️ Gear Icon** in the top right of the dashboard.
2. Enter your **Groq API Key** and save.

### 5. Forza Game Configuration
You must tell Forza to broadcast telemetry data to Pitwall.
1. Launch Forza Horizon 4, 5, or Forza Motorsport.
2. Go to **Settings -> HUD and Gameplay**.
3. Scroll down to **Data Out** and turn it **ON**.
4. Set **Data Out IP Address** to `127.0.0.1`.
5. Set **Data Out IP Port** to `5300`.

*As soon as you unpause the game and start driving, the dashboard will come to life!*

---
*Built for absolute performance and immersion on the virtual track.*
