import socket
import struct
import re
import math
import asyncio
import sys
import threading
import time
import os
import json
import logging
import tempfile
from io import BytesIO
import base64

import certifi
import requests
import edge_tts
from gtts import gTTS
from flask import Flask, render_template, request, redirect, url_for
from flask_socketio import SocketIO

# Fix aiohttp SSL certificate issues in PyInstaller for edge-tts
os.environ['SSL_CERT_FILE'] = certifi.where()
os.environ['SSL_CERT_DIR'] = certifi.where()

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Configuration Management
if getattr(sys, 'frozen', False):
    application_path = os.path.dirname(sys.executable)
else:
    application_path = os.path.dirname(os.path.abspath(__file__))
    
CONFIG_FILE = os.path.join(application_path, "config.json")
APP_CONFIG = {
    "groq_key": "",
    "cartesia_key": "",
    "cartesia_voice": "",
    "elevenlabs_key": "",
    "elevenlabs_voice": "",
    "udp_port": "5300"
}

def load_config():
    global APP_CONFIG
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r") as f:
            try:
                loaded = json.load(f)
                APP_CONFIG.update(loaded)
            except Exception as e:
                print(f"Error loading config: {e}")

def save_config():
    with open(CONFIG_FILE, "w") as f:
        json.dump(APP_CONFIG, f, indent=4)

load_config()
AI_VOICE = "en-GB-RyanNeural" # Default Edge-TTS voice

if getattr(sys, 'frozen', False):
    template_folder = os.path.join(sys._MEIPASS, 'templates')
    static_folder = os.path.join(sys._MEIPASS, 'static')
    app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)
else:
    app = Flask(__name__)
# Silence Werkzeug HTTP spam
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

@app.route('/api/settings', methods=['POST'])
def update_settings():
    try:
        data = request.json
        if 'groq_key' in data:
            APP_CONFIG['groq_key'] = data['groq_key']
            save_config()
            return {"status": "success"}
        return {"status": "error", "message": "Missing key"}, 400
    except Exception as e:
        return {"status": "error", "message": str(e)}, 500

# Keep Forza UDP completely separate from the Web UI port
UDP_IP = "0.0.0.0"
UDP_PORT = int(APP_CONFIG.get('udp_port', 5300))
WEB_PORT = 6900


def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

chat_history = []

def generate_ai_commentary(prompt, interrupt=False, emotion='neutral'):
    global chat_history
    text = ""
    try:
        if interrupt:
            socketio.emit('stop_audio')
            
        system_prompt = (
            "You are F.R.I.D.A.Y., Tony Stark's advanced AI race engineer. "
            "You speak in short, hyper-efficient, clinical sentences. "
            "Address me STRICTLY as 'Boss'. NEVER use the word 'driver'. "
            "CRITICAL DIRECTIVE: DO NOT recite raw telemetry data (speed, gear, etc.) unless explicitly asked. "
            "CRITICAL DIRECTIVE: Your response MUST be under 15 words. Be extremely brief and tactical. "
            "No emojis. No robotic narrations."
        )
        
        temp_messages = chat_history + [{"role": "user", "content": prompt}]
        messages = [{"role": "system", "content": system_prompt}] + temp_messages
        
        if APP_CONFIG.get('groq_key', '') == "":
            text = "AI Strategy is offline. Please configure your API key in the settings."
        else:
            url = "https://api.groq.com/openai/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {APP_CONFIG['groq_key']}",
                "Content-Type": "application/json"
            }
            models_to_try = [
                "llama3-8b-8192",
                "mixtral-8x7b-32768",
                "llama-3.1-8b-instant"
            ]
            last_error = "unknown"
            for model_id in models_to_try:
                payload = {
                    "model": model_id,
                    "messages": messages,
                    "max_tokens": 50,
                    "temperature": 0.8
                }
                
                try:
                    response = requests.post(url, headers=headers, json=payload, timeout=10)
                    if response.status_code == 200:
                        text = response.json()["choices"][0]["message"]["content"].strip()
                        if not text:
                            # Model returned empty text (maybe used all tokens thinking). Try next.
                            last_error = "empty response"
                            print(f"[AI] Model {model_id} returned empty text.")
                            continue
                            
                        chat_history = temp_messages + [{"role": "assistant", "content": text}]
                        if len(chat_history) > 8:
                            chat_history = chat_history[-8:]
                        print(f"[AI] Successfully generated with model: {model_id}")
                        break
                    else:
                        last_error = str(response.status_code)
                        print(f"[AI] Model {model_id} failed: {response.text}")
                except Exception as e:
                    last_error = "timeout or connection drop"
                    print(f"[AI] Model {model_id} request error: {e}")
                    
    except Exception as e:
        print(f"[Audio] AI Generation Error: {e}")
        return
        
    if not text:
        print("[Audio] AI Cloud endpoint failed to generate text after trying all models.")
        text = f"I'm having trouble connecting to the cloud. My telemetry is offline. Error code {last_error}."
            
    # Strip <think>...</think> blocks entirely (often generated by reasoning models)
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
    
    text = text.replace('*', '').strip()
    text = re.sub(r'[^\w\s,\.\!\?\'\"-]', '', text)
    # Collapse elongated words: 'juuuust' -> 'just', 'soooo' -> 'so'
    text = re.sub(r'(.)\1{2,}', r'\1', text)
    tts_text = text.replace(" Gs", " Gees").replace(" G's", " Gees")
    # Expand abbreviations using word-boundary regex to avoid matching inside words
    tts_text = tts_text.replace("km/h", "kilometers per hour").replace("KM/H", "kilometers per hour")
    tts_text = re.sub(r'\bRPM\b', 'R P M', tts_text, flags=re.IGNORECASE)
    tts_text = re.sub(r'\bPSI\b', 'P S I', tts_text, flags=re.IGNORECASE)
    tts_text = re.sub(r'\bHP\b', 'horsepower', tts_text)
    tts_text = re.sub(r'\bhp\b', 'horsepower', tts_text)
    tts_text = re.sub(r'\bF1\b', 'Formula One', tts_text)
    tts_text = re.sub(r'\bP1\b', 'position one', tts_text)
    tts_text = re.sub(r'\bP2\b', 'position two', tts_text)
    tts_text = re.sub(r'\bP3\b', 'position three', tts_text)
    tts_text = re.sub(r'\bDRS\b', 'D R S', tts_text)
    tts_text = re.sub(r'\bERS\b', 'E R S', tts_text)
    tts_text = re.sub(r'\bAI\b', 'A I', tts_text)
    tts_text = tts_text.replace("%", " percent")
    tts_text = tts_text.replace("°C", " degrees celsius")
    tts_text = tts_text.replace("°", " degrees")
    
    print(f"[Audio] AI Engineer: {text}")
    
    def synthesize():
        nonlocal tts_text
        
        # ── TIER 1: Edge TTS (Best quality — Irish female neural voice) ──
        try:
            temp_path = os.path.join(tempfile.gettempdir(), f"friday_edge_{int(time.time()*1000)}.mp3")
            
            async def _edge_speak():
                communicate = edge_tts.Communicate(tts_text, "en-IE-EmilyNeural")
                await communicate.save(temp_path)
            
            # Create a fresh event loop for this thread (Flask's main loop blocks async)
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(_edge_speak())
            loop.close()
            
            with open(temp_path, 'rb') as f:
                audio_data = f.read()
            b64_audio = base64.b64encode(audio_data).decode('utf-8')
            socketio.emit('play_audio', {'audio': b64_audio, 'text': text, 'emotion': emotion, 'mime': 'audio/mp3'})
            print("[Audio] Edge TTS (en-IE-EmilyNeural) — Success")
            try:
                os.remove(temp_path)
            except:
                pass
            return  # Done! Skip fallbacks.
        except Exception as e:
            print(f"[Audio] Edge TTS failed ({e}), trying gTTS...")
        
        # ── TIER 2: gTTS (Good quality — Irish accent via tld='ie') ──
        try:
            fp = BytesIO()
            tts = gTTS(text=tts_text, lang='en', tld='ie', slow=False)
            tts.write_to_fp(fp)
            fp.seek(0)
            audio_data = fp.read()
            b64_audio = base64.b64encode(audio_data).decode('utf-8')
            socketio.emit('play_audio', {'audio': b64_audio, 'text': text, 'emotion': emotion, 'mime': 'audio/mp3'})
            print("[Audio] gTTS (Irish) — Success")
            return  # Done!
        except Exception as e:
            print(f"[Audio] gTTS failed ({e}), trying pyttsx3...")
        
        # ── TIER 3: pyttsx3 (Offline fallback — robotic but always works) ──
        try:
            import pyttsx3
            temp_path = os.path.join(tempfile.gettempdir(), f"friday_tts_{int(time.time()*1000)}.wav")
            engine = pyttsx3.init()
            engine.setProperty('rate', 150)  # Slow down for clarity
            voices = engine.getProperty('voices')
            for voice in voices:
                if 'female' in voice.name.lower() or 'zira' in voice.name.lower():
                    engine.setProperty('voice', voice.id)
                    break
            engine.save_to_file(tts_text, temp_path)
            engine.runAndWait()
            with open(temp_path, 'rb') as f:
                audio_data = f.read()
            b64_audio = base64.b64encode(audio_data).decode('utf-8')
            socketio.emit('play_audio', {'audio': b64_audio, 'text': text, 'emotion': emotion, 'mime': 'audio/wav'})
            print("[Audio] pyttsx3 — Success (offline fallback)")
            try:
                os.remove(temp_path)
            except:
                pass
        except Exception as e2:
            print(f"[Audio] ALL TTS ENGINES FAILED: {e2}")
            
    threading.Thread(target=synthesize, daemon=True).start()

@socketio.on('request_ai_test')
def handle_ai_test():
    if APP_CONFIG.get('groq_key', '') == "":
        prompt = "System test. Please say: AI Strategy is offline. Please configure your API key in the settings."
    else:
        prompt = "System test. Say exactly: AI Strategy is online and connected. I am ready to monitor telemetry."
    threading.Thread(target=generate_ai_commentary, args=(prompt, True, 'neutral'), daemon=True).start()

# AI State Tracking
last_ai_time = 0
last_speed = 0
last_pos = -1
was_crashed = False
last_yaw = 0
last_time = time.time()
last_joke_time = 0
current_telemetry = {}

@socketio.on('client_audio')
def handle_client_audio(data):
    try:
        b64_audio = data.get('audio')
        mime_type = data.get('mimeType', 'audio/webm')
        if not b64_audio: return
        
        # Determine extension from mimeType
        ext = 'mp4' if 'mp4' in mime_type else ('ogg' if 'ogg' in mime_type else 'webm')
        temp_file = f"temp_voice.{ext}"
        
        # Pad base64 if needed
        b64_audio += "=" * ((4 - len(b64_audio) % 4) % 4)
        audio_bytes = base64.b64decode(b64_audio)
        
        with open(temp_file, "wb") as f:
            f.write(audio_bytes)
            
        # Transcribe with Groq Whisper
        url = "https://api.groq.com/openai/v1/audio/transcriptions"
        headers = { "Authorization": f"Bearer {APP_CONFIG['groq_key']}" }
        with open(temp_file, "rb") as f:
            files = { 'file': (temp_file, f, mime_type) }
            payload = { 'model': 'whisper-large-v3', 'response_format': 'json' }
            response = requests.post(url, headers=headers, files=files, data=payload, timeout=10)
            
            if response.status_code == 200:
                transcript = response.json().get('text', '').strip()
                # Ignore empty transcripts or Whisper's common silence hallucinations
                ignore_list = ["", "you", "silence.", "silence", "thanks for watching.", "thanks for watching", "bye.", "."]
                if transcript and transcript.lower() not in ignore_list and len(transcript) > 2:
                    print(f"[Voice] Boss: {transcript}")
                    car_context = f"[Game: {current_telemetry.get('game_id', 'Unknown')} | Speed: {current_telemetry.get('speed', 0)} km/h, Gear: {current_telemetry.get('gear', 'N')}, Throttle: {current_telemetry.get('throttle_pct', 0):.0f}%]"
                    prompt = f"[User asked over radio]: {transcript}\n\n{car_context}"
                    threading.Thread(target=generate_ai_commentary, args=(prompt, False, 'neutral'), daemon=True).start()
            else:
                print(f"[Audio] Whisper Error: {response.status_code} - {response.text}")
                socketio.emit('header_alert', {'msg': f"Mic Error: {response.status_code}"})
            
    except Exception as e:
        print(f"[Audio] Client Audio Processing Error: {e}")
        socketio.emit('header_alert', {'msg': "Audio Processing Error"})
last_race_pos = -1
last_pos_time = 0
rev_limit_start_time = 0
bogging_start_time = 0
bad_launch_start_time = 0
last_rev_limit_joke = 0
last_bogging_joke = 0
last_gear = 0

# Damage Inference Tracking
baseline_max_speed = 0
baseline_max_g_lat = 0
last_crash_time = 0
damage_inferred = False
last_damage_report_time = 0
accel_start_time = 0
is_accelerating = False
best_0_100_time = 999.0

last_car_ordinal = 0

def check_ai_trigger(speed, pos, lap, g_lat, brake, g_lon, yaw, race_finished, throttle, rpm, is_race_on, gear, max_rpm, steer, is_jumping, car_ordinal):
    global last_ai_time, last_speed, last_pos, was_crashed, last_yaw, last_time, last_joke_time, last_race_pos, last_pos_time
    global rev_limit_start_time, bogging_start_time, bad_launch_start_time, last_rev_limit_joke, last_bogging_joke, last_gear
    global baseline_max_speed, baseline_max_g_lat, last_crash_time, damage_inferred, last_damage_report_time
    global accel_start_time, is_accelerating, best_0_100_time, last_car_ordinal
    
    now = time.time()
    dt = now - last_time
    if dt == 0: dt = 0.001
    
    yaw_rate = abs(yaw - last_yaw) / dt
    if yaw_rate > (3.14 / dt):
        yaw_rate = 0 
        
    speed_drop = last_speed - speed # calculate before updating last_speed
    last_speed = speed # update immediately to prevent delta accumulation across AI cooldowns
    last_time = now
    last_yaw = yaw
    
    # ----------------------------------------------------
    # HIGH PRIORITY INTERRUPTS (Ignores all cooldowns)
    # ----------------------------------------------------
    if race_finished:
        final_pos = pos if pos > 0 else last_pos
        prompt = None
        if final_pos == 1:
            prompt = "The Boss just WON the race in P1! Scream with absolute joy, swear excitedly, and celebrate this massive victory!"
        elif final_pos in [2, 3]:
            prompt = f"The Boss just finished the race on the podium in P{final_pos}! React with huge excitement and congratulate them on a great podium finish!"
        elif final_pos > 3:
            prompt = f"The Boss finished the race in P{final_pos}. Give them an encouraging message and tell them you'll get 'em next time."
            
        if prompt:
            threading.Thread(target=generate_ai_commentary, args=(prompt, True, 'happy'), daemon=True).start()
            last_ai_time = now
        return

    # ----------------------------------------------------
    # MID PRIORITY (30s Cooldown) - Position Tracking
    # ----------------------------------------------------
    if is_race_on and pos > 0:
        if last_race_pos > 0 and pos != last_race_pos:
            if now - last_pos_time > 30: # 30s cooldown for overtakes to avoid spam
                prompt = None
                emotion = 'neutral'
                if pos < last_race_pos:
                    prompt = f"The Boss just overtook an opponent and moved up into P{pos}. Calmly confirm the overtake and instruct them to maintain pace."
                    emotion = 'happy'
                else:
                    prompt = f"The Boss just got overtaken and dropped down to P{pos}. Calmly instruct them to stay focused and manage the gap."
                    emotion = 'angry'
                
                threading.Thread(target=generate_ai_commentary, args=(prompt, False, emotion), daemon=True).start()
                last_pos_time = now
                last_ai_time = now
        last_race_pos = pos
    else:
        last_race_pos = -1

    # ----------------------------------------------------
    # CAR SWAP DETECTION
    # ----------------------------------------------------
    if car_ordinal != last_car_ordinal and last_car_ordinal != 0 and car_ordinal != 0:
        if speed < 10: # Only trigger when stationary/in garage
            prompt = "The Boss just hopped into a new car. Acknowledge the switch and hype them up for the next session."
            threading.Thread(target=generate_ai_commentary, args=(prompt, False, 'happy'), daemon=True).start()
            last_ai_time = now
    
    if car_ordinal != 0:
        last_car_ordinal = car_ordinal

    decel = (speed_drop / 3.6) / dt
    is_crash = decel > 58.8 and not race_finished
    
    # ----------------------------------------------------
    # INFERRED DAMAGE PIPELINE
    # ----------------------------------------------------
    if not was_crashed and not damage_inferred:
        if speed > baseline_max_speed: baseline_max_speed = speed
        if abs(g_lat) > baseline_max_g_lat: baseline_max_g_lat = abs(g_lat)
        
    # Acceleration Tracking (0-100 km/h)
    if speed < 5 and throttle > 90 and not is_accelerating:
        is_accelerating = True
        accel_start_time = now
    elif speed >= 100 and is_accelerating:
        time_taken = now - accel_start_time
        is_accelerating = False
        
        # Record baseline 0-100 time if healthy
        if time_taken < best_0_100_time and not was_crashed:
            best_0_100_time = time_taken
            
        # Check for damage if they crashed and have a baseline
        if was_crashed and best_0_100_time < 900:
            if time_taken > (best_0_100_time * 1.3): # 30% slower 0-100
                if not damage_inferred or (now - last_damage_report_time > 120):
                    prompt = f"The car's 0-100 time was {time_taken:.1f}s, normally it's {best_0_100_time:.1f}s. Instruct the Boss to box due to severe drivetrain damage."
                    emotion = 'angry'
                    damage_inferred = True
                    last_damage_report_time = now
                    threading.Thread(target=generate_ai_commentary, args=(prompt, False, emotion), daemon=True).start()
                    last_ai_time = now
                    
    elif speed > 10 and throttle < 50 and is_accelerating:
        is_accelerating = False # Aborted launch
        
    # Steering Damage Tracking
    if was_crashed and speed > 60 and throttle > 50:
        if abs(steer) < 5 and abs(g_lat) > 0.4:
            if not damage_inferred or (now - last_damage_report_time > 120):
                prompt = "The Boss is steering straight but the car is pulling heavily. The suspension is completely destroyed! Tell them to box."
                emotion = 'shocked'
                damage_inferred = True
                last_damage_report_time = now
                threading.Thread(target=generate_ai_commentary, args=(prompt, False, emotion), daemon=True).start()
                last_ai_time = now
        
    if is_crash:
        was_crashed = True
        last_crash_time = now
        
    if was_crashed and (now - last_crash_time > 15) and baseline_max_speed > 100:
        if throttle > 90 and gear >= 3 and speed > 50:
            if speed < (baseline_max_speed * 0.85):
                if not damage_inferred or (now - last_damage_report_time > 120):
                    prompt = "The car took heavy damage, top speed is significantly down. Instruct the Boss to box for repairs immediately."
                    emotion = 'angry' # using the alert/angry face
                    damage_inferred = True
                    last_damage_report_time = now
                    threading.Thread(target=generate_ai_commentary, args=(prompt, False, emotion), daemon=True).start()
                    last_ai_time = now
    is_ramming = speed_drop > 20 and speed_drop <= 50 and brake < 10 and speed > 30 and not race_finished
    is_spin = yaw_rate > 3.0 and speed > 40 and not is_crash and not race_finished
    is_drifting = yaw_rate > 1.0 and yaw_rate <= 3.0 and speed > 50 and not is_crash and brake < 50 and not race_finished
    is_turning = abs(g_lat) > 1.2 and yaw_rate > 0.2 and yaw_rate <= 1.0 and speed > 60 and not race_finished
    is_donut = yaw_rate > 2.0 and speed < 40 and throttle > 50 and not is_crash and not race_finished
    
    # ----------------------------------------------------
    # MANUAL TRANSMISSION TRACKING
    # ----------------------------------------------------
    is_bouncing_limiter = False
    is_bogging = False
    is_money_shift = False
    is_bad_launch = False
    
    if max_rpm > 1000: # Ensure valid telemetry
        # Money shift logic (RPM spiked past redline while decelerating or downshifting)
        if rpm > max_rpm * 0.99 and speed_drop > 0.5 and gear < 5:
            is_money_shift = True
                
        # Rev Limiter logic
        if rpm > (max_rpm * 0.97) and throttle > 80:
            if rev_limit_start_time == 0:
                rev_limit_start_time = now
            elif now - rev_limit_start_time > 1.0:
                is_bouncing_limiter = True
        else:
            rev_limit_start_time = 0
            
        # Bogging logic
        if rpm < (max_rpm * 0.35) and throttle > 80 and gear >= 3 and speed > 20:
            if bogging_start_time == 0:
                bogging_start_time = now
            elif now - bogging_start_time > 1.0:
                is_bogging = True
        else:
            bogging_start_time = 0
            
        # Bad Launch (Starting in wrong gear)
        if speed < 15 and gear >= 2 and throttle > 80:
            if bad_launch_start_time == 0:
                bad_launch_start_time = now
            elif now - bad_launch_start_time > 1.0:
                is_bad_launch = True
        else:
            bad_launch_start_time = 0
    
    # SMART COOLDOWN TIERS
    is_critical = is_crash or is_ramming or is_jumping
    is_warning = is_spin or is_bouncing_limiter or is_bogging or is_money_shift or is_bad_launch
    is_chatter = is_drifting or is_donut or is_turning

    cooldown_passed = False
    if is_critical and (now - last_ai_time >= 30): cooldown_passed = True
    elif is_warning and (now - last_ai_time >= 60): cooldown_passed = True
    elif is_chatter and (now - last_ai_time >= 120): cooldown_passed = True
    elif not (is_critical or is_warning or is_chatter) and (now - last_ai_time >= 90): cooldown_passed = True
    
    if not cooldown_passed:
        last_speed = speed
        if pos > 0: last_pos = pos
        if gear > 0: last_gear = gear
        return
            
    prompt = None
    emotion = 'neutral'
    
    if is_jumping:
        prompt = f"Car is airborne at {speed} km/h! React with excitement about the massive jump."
        emotion = 'happy'
    elif is_money_shift:
        prompt = f"Money shift ({last_gear} to {gear}). Warn about critical engine stress."
        emotion = 'angry'
    elif is_bad_launch and now - last_bogging_joke > 45:
        prompt = f"Launching in gear {gear}. Remind to use 1st gear."
        last_bogging_joke = now
        emotion = 'angry'
    elif is_bouncing_limiter and now - last_rev_limit_joke > 45:
        prompt = "Bouncing off rev limiter. Tell them to upshift."
        last_rev_limit_joke = now
        emotion = 'angry'
    elif is_bogging and now - last_bogging_joke > 45:
        prompt = f"Bogging engine in gear {gear}. Tell them to downshift."
        last_bogging_joke = now
        emotion = 'angry'
    elif is_crash:
        was_crashed = True
        emotion = 'shocked'
        prompt = f"Crashed heavily at {last_speed} km/h. Sarcastic tip about braking."
    elif is_ramming:
        prompt = f"Rammed something. Warn to preserve aero."
        emotion = 'angry'
    elif is_spin:
        emotion = 'shocked'
        prompt = f"Spun out. Professional tip on throttle control."
    elif is_donut:
        prompt = f"Doing donuts. Advise to stop wasting tires."
    elif is_drifting:
        prompt = f"Drifting at {speed} km/h. Keep it tidy."
        emotion = 'happy'
    elif is_turning:
        prompt = f"Sharp turn, {abs(g_lat):.1f} Gs. Analytical apex tip."
        emotion = 'shocked'
    elif speed >= 300 and last_speed < 300:
        prompt = f"Crossed 300 km/h!"
        emotion = 'shocked'
    elif last_pos > 0 and pos > 0 and pos < last_pos:
        prompt = f"Overtook into P{pos}!"
        emotion = 'happy'
    elif last_pos > 0 and pos > 0 and pos > last_pos:
        prompt = f"Dropped to P{pos}. Express disappointment."
        emotion = 'angry'
    elif abs(g_lat) > 2.5:
        prompt = f"Massive {abs(g_lat):.1f} lateral Gs in corner."
        emotion = 'shocked'
    # last_speed was moved to the top of the function

    if pos > 0: last_pos = pos
    if gear > 0: last_gear = gear
    
    if prompt:
        last_ai_time = now
        threading.Thread(target=generate_ai_commentary, args=(prompt, False, emotion), daemon=True).start()

def telemetry_loop():
    global sock
    while True:
        try:
            current_port = int(APP_CONFIG.get('udp_port', 5300))
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.bind((UDP_IP, current_port))
            print(f"\n>>> SUCCESS: FORZA LISTENER ACTIVE ON UDP PORT {current_port} <<<\n")
        except Exception as e:
            print(f"\n>>> CRITICAL ERROR BINDING PORT: {e} <<<\n")
            socketio.sleep(5)
            continue

        last_race_on = 0
        last_ui_update = 0

        while sock is not None:
            try:
                data, addr = sock.recvfrom(1024)
                
                if len(data) < 232:
                    continue

                is_race_on = struct.unpack_from('<i', data, 0)[0]
                
                pos = 0
                if len(data) >= 315:
                    pos = struct.unpack_from('<B', data, 314)[0]
                    
                race_finished = (is_race_on == 0 and last_race_on == 1)
                last_race_on = is_race_on

                max_rpm = struct.unpack_from('<f', data, 8)[0]
                current_rpm = struct.unpack_from('<f', data, 16)[0]
                accel_x, accel_y, accel_z = struct.unpack_from('<fff', data, 20)
                vx, vy, vz = struct.unpack_from('<fff', data, 32)
                
                speed_kmh = int(math.sqrt(vx**2 + vy**2 + vz**2) * 3.6)

                power_hp = 0; fuel_pct = 0; boost_psi = 0.0; gear = 0
                throttle_pct = 0; brake_pct = 0; lap_no = 0
                pos_x = 0.0; pos_y = 0.0; pos_z = 0.0
                best_lap = 0.0; last_lap = 0.0; current_lap = 0.0
                yaw = struct.unpack_from('<f', data, 56)[0]
                tyres = {'FL': 0, 'FR': 0, 'RL': 0, 'RR': 0}

                game_id = "Unknown"
                if len(data) == 232: game_id = "Forza Horizon 3"
                elif len(data) == 311: game_id = "Forza Motorsport 7"
                elif len(data) == 324: game_id = "Forza Horizon 4/5"
                elif len(data) == 331: game_id = "Forza Motorsport (2023)"
                elif len(data) > 300: game_id = "Forza Engine"

                # Tire Slip Ratios and Angles (Standard V1/V2 offsets)
                slip_fl, slip_fr, slip_rl, slip_rr = struct.unpack_from('<ffff', data, 116)
                slip_angle_fl, slip_angle_fr, slip_angle_rl, slip_angle_rr = struct.unpack_from('<ffff', data, 132)
            
                # Tire Wear (Only in FM2023 331-byte packet)
                wear_fl = wear_fr = wear_rl = wear_rr = 0.0
                if len(data) >= 331:
                    wear_fl, wear_fr, wear_rl, wear_rr = struct.unpack_from('<ffff', data, 315) # Example offset, usually at the end of the extended Dash packet

                if len(data) >= 311:
                    # Forza Horizon 4 added 12 bytes of coordinates starting at offset 232
                    pos_x, pos_y, pos_z = struct.unpack_from('<fff', data, 232)
                
                    power_hp = int(struct.unpack_from('<f', data, 260)[0] / 745.7)
                    tyre_temps = struct.unpack_from('<ffff', data, 268)
                    boost_psi = round(struct.unpack_from('<f', data, 284)[0], 1)
                    fuel_pct = int(struct.unpack_from('<f', data, 288)[0] * 100)
                    car_ordinal = struct.unpack_from('<i', data, 212)[0] # Often at 212 in V1
                    if car_ordinal == 0 and len(data) >= 252:
                        car_ordinal = struct.unpack_from('<i', data, 248)[0] # Fallback to 248 for V2

                    # Lap Times
                    best_lap = struct.unpack_from('<f', data, 296)[0]
                    last_lap = struct.unpack_from('<f', data, 300)[0]
                    current_lap = struct.unpack_from('<f', data, 304)[0]

                    lap_no = struct.unpack_from('<H', data, 312)[0] 
                    pos = struct.unpack_from('<B', data, 314)[0] 
                    throttle_pct = (struct.unpack_from('<B', data, 315)[0] / 255.0) * 100
                    brake_pct = (struct.unpack_from('<B', data, 316)[0] / 255.0) * 100
                    gear = struct.unpack_from('<B', data, 319)[0]
                    steer = 0
                    if len(data) >= 321:
                        steer = struct.unpack_from('<b', data, 320)[0]

                    tyres = {
                        'FL': {'temp': int((tyre_temps[0] - 32) * 5/9), 'slip': abs(slip_fl) + abs(slip_angle_fl), 'wear': wear_fl * 100},
                        'FR': {'temp': int((tyre_temps[1] - 32) * 5/9), 'slip': abs(slip_fr) + abs(slip_angle_fr), 'wear': wear_fr * 100},
                        'RL': {'temp': int((tyre_temps[2] - 32) * 5/9), 'slip': abs(slip_rl) + abs(slip_angle_rl), 'wear': wear_rl * 100},
                        'RR': {'temp': int((tyre_temps[3] - 32) * 5/9), 'slip': abs(slip_rr) + abs(slip_angle_rr), 'wear': wear_rr * 100}
                    }

                # Suspension Travel (0.0 = max stretch/airborne, 1.0 = max compression)
                susp_fl, susp_fr, susp_rl, susp_rr = struct.unpack_from('<ffff', data, 68)
                is_jumping = (susp_fl <= 0.05 and susp_fr <= 0.05 and susp_rl <= 0.05 and susp_rr <= 0.05 and speed_kmh > 50)

                def safe_int(val):
                    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
                        return 0
                    return int(val)

                payload = {
                    'game_id': game_id,
                    'speed': speed_kmh, 'rpm': safe_int(current_rpm), 'max_rpm': safe_int(max_rpm),
                    'gear': 'R' if gear == 0 else gear, 'throttle_pct': throttle_pct,
                    'brake_pct': brake_pct, 'power_hp': safe_int(power_hp), 'fuel_pct': safe_int(fuel_pct),
                    'boost_psi': boost_psi if not (isinstance(boost_psi, float) and math.isnan(boost_psi)) else 0.0, 
                    'lap': lap_no, 'pos': pos, 'tyres': tyres,
                    'g_lat': (accel_x / 9.8) if not math.isnan(accel_x) else 0.0, 
                    'g_lon': (accel_z / 9.8) if not math.isnan(accel_z) else 0.0,
                    'pos_x': pos_x, 'pos_z': pos_z, 'yaw': yaw,
                    'best_lap': best_lap, 'last_lap': last_lap, 'current_lap': current_lap,
                    'steer': steer if 'steer' in locals() else 0,
                    'car_ordinal': car_ordinal if 'car_ordinal' in locals() else 0,
                    'susp': [susp_fl, susp_fr, susp_rl, susp_rr],
                    'is_race_on': is_race_on
                }
            
                global current_telemetry
                current_telemetry = payload

                check_ai_trigger(speed_kmh, pos, lap_no, payload['g_lat'], brake_pct, payload['g_lon'], yaw, race_finished, throttle_pct, current_rpm, is_race_on, gear, max_rpm, steer if 'steer' in locals() else 0, is_jumping, car_ordinal if 'car_ordinal' in locals() else 0)

                # Optimisation: Throttle UI updates to 30 FPS to prevent browser lag
                loop_time = time.time()
                if loop_time - last_ui_update >= 0.033:
                    socketio.emit('telemetry_update', payload)
                    last_ui_update = loop_time

                socketio.sleep(0) # Yield control without adding artificial delay

            except Exception as e:
                # Only print actual crashes, not every single loop
                print(f"\n[ERROR IN TELEMETRY LOOP]: {e}")
                socketio.sleep(0.1)

@app.route('/')
def index():
    if not APP_CONFIG.get("groq_key") and not APP_CONFIG.get("setup_skipped"):
        return redirect(url_for('setup'))
    needs_setup = not bool(APP_CONFIG.get("groq_key"))
    
    # Detect mobile devices to serve the horizontally-optimized mobile UI
    user_agent = request.headers.get('User-Agent', '').lower()
    is_mobile = any(mobile_token in user_agent for mobile_token in ['mobi', 'android', 'iphone', 'ipad', 'webos'])
    
    template = 'mobile.html' if is_mobile else 'index.html'
    return render_template(template, udp_port=UDP_PORT, local_ip=get_local_ip(), needs_setup=needs_setup)

@app.route('/skip_setup')
def skip_setup():
    APP_CONFIG['setup_skipped'] = True
    save_config()
    return redirect(url_for('index'))

@app.route('/setup', methods=['GET', 'POST'])
def setup():
    if request.method == 'POST':
        old_port = APP_CONFIG.get('udp_port', '5300')
        APP_CONFIG['groq_key'] = request.form.get('groq_key', '')
        APP_CONFIG['cartesia_key'] = request.form.get('cartesia_key', '')
        APP_CONFIG['cartesia_voice'] = request.form.get('cartesia_voice', '')
        APP_CONFIG['elevenlabs_key'] = request.form.get('elevenlabs_key', '')
        APP_CONFIG['elevenlabs_voice'] = request.form.get('elevenlabs_voice', '')
        APP_CONFIG['tts_engine'] = request.form.get('tts_engine', 'edge')
        
        new_port = request.form.get('udp_port', '5300')
        APP_CONFIG['udp_port'] = new_port
        save_config()
        
        if str(old_port) != str(new_port):
            global sock
            if sock:
                try:
                    sock.close()
                except:
                    pass
                sock = None
                
        return redirect(url_for('index'))
    return render_template('setup.html', local_ip=get_local_ip(), config=APP_CONFIG)

@socketio.on('driver_radio')
def handle_driver_radio(data):
    text = data.get('text', '')
    if text:
        prompt = f"The Boss (Shanks) says over the radio: '{text}'. Respond as their race engineer."
        threading.Thread(target=generate_ai_commentary, args=(prompt,), daemon=True).start()

import webview
import subprocess

if __name__ == '__main__':
    print("[Desktop] Applying Windows UWP Loopback Exemptions for Forza...")
    packages = [
        "Microsoft.SunriseBaseGame_8wekyb3d8bbwe", # FH4
        "Microsoft.624F8BCE56223_8wekyb3d8bbwe",   # FH5
        "Microsoft.ApolloBaseGame_8wekyb3d8bbwe"   # FM7
    ]
    for pkg in packages:
        try:
            subprocess.run(f"CheckNetIsolation.exe LoopbackExempt -a -n={pkg}", shell=True, capture_output=True)
        except Exception:
            pass

    # Start the telemetry listening loop in the background
    socketio.start_background_task(target=telemetry_loop)
    
    # Run the Flask server in a daemon thread so the main thread can be used by PyWebView
    def run_server():
        socketio.run(app, host='0.0.0.0', port=WEB_PORT, allow_unsafe_werkzeug=True)
        
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    
    # Wait a tiny bit for the server to bind before creating the window
    time.sleep(0.5)
    
    # Create the standalone desktop window
    print("[Desktop] Starting Native Desktop Window...")
    window = webview.create_window(
        title='Pitwall Live Telemetry',
        url=f'http://127.0.0.1:{WEB_PORT}',
        width=1400,
        height=900,
        resizable=True,
        min_size=(1000, 700),
        background_color='#0f172a' # Match our dark slate background
    )
    
    # Start the native window event loop
    webview.start()