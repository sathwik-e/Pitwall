# Pitwall Live Telemetry - Beginner's Setup Guide

Welcome to Pitwall! This guide will walk you through setting up the application so it can successfully connect to Forza Horizon 4, Forza Horizon 5, or Forza Motorsport (2023).

## Step 1: Initialize Pitwall
1. Double click `build.bat` if you have made any code changes to recompile the app.
2. Launch `Pitwall.exe`.
3. The Setup Wizard will automatically appear. Enter your API keys here.
4. **Important**: By default, the UDP Port is `5300`. Leave this as is unless you have a specific reason to change it.
5. Click **INITIALIZE SYSTEM** (or Skip Setup if you just want to test the telemetry first).

> Tip: You can always open this wizard again later by clicking the ⚙️ Gear icon in the top right corner of the dashboard! Any changes you make to the port will instantly restart the connection.

## Step 2: Fix Windows Sandbox (Xbox App Users Only)
If you play Forza via the Microsoft Store or Xbox App, Windows places the game in a secure sandbox. This sandbox completely blocks the game from sending telemetry to your own PC (`127.0.0.1`). 

**Good News:** As long as you run `Pitwall.exe` as Administrator, Pitwall now **automatically detects and fixes this for you** in the background! You do not need to run any scripts.

*(Note: If you play on Steam, this sandbox doesn't exist anyway).*

## Step 3: Configure Forza
Now that Pitwall is listening, you need to tell Forza to send the data.

1. Launch your Forza game.
2. Go to **Settings** -> **HUD and Gameplay**.
3. Scroll down to the bottom where you see the **Data Out** settings.
4. Turn **Data Out** to `ON`.
5. Set **Data Out IP Address** to `127.0.0.1`.
6. Set **Data Out IP Port** to `5300` (or the port you chose in Step 1).

## Step 4: Drive!
As soon as you unpause the game and start driving, you should instantly see the dashboard come to life. 

> Important: If it still says "Waiting for Forza telemetry...", ensure that Windows Defender Firewall is not blocking Python/Pitwall. You may need to click "Allow Access" if a firewall prompt appears.
