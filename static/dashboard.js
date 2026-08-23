// Establish WebSocket connection
const socket = io();

// UI Connection Status Handlers
socket.on('connect', () => {
    console.log("WebSocket connection established!");
    const statusText = document.getElementById('connStatus');
    const statusDot = document.getElementById('connDot');
    
    if (statusText) statusText.innerText = "LIVE CONNECTION ESTABLISHED";
    if (statusDot) statusDot.style.backgroundColor = "#00ff00"; // Green
});

socket.on('disconnect', () => {
    console.log("WebSocket disconnected.");
    const statusText = document.getElementById('connStatus');
    const statusDot = document.getElementById('connDot');
    
    if (statusText) statusText.innerText = "DISCONNECTED FROM TELEMETRY";
    if (statusDot) statusDot.style.backgroundColor = "red";
});


let telemetryReceived = false;
let audioUnlocked = false;

document.getElementById('commToggle').addEventListener('change', (e) => {
    if (e.target.checked) {
        // Unlock Audio Context on Windows when AI is enabled
        const audioEl = document.getElementById('aiAudio');
        if (audioEl && !audioUnlocked) {
            audioEl.play().catch(err => {}); // Silent play to unlock
            audioEl.pause();
            audioUnlocked = true;
        }
    }
});

document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    const key = document.getElementById('groqKeyInput').value;
    fetch('/api/settings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({groq_key: key})
    }).then(() => {
        document.getElementById('settingsModal').style.display = 'none';
        document.getElementById('groqKeyInput').value = '';
    });
});

// Telemetry Listener
socket.on('telemetry_update', (data) => {
    if (!data) return;

    if (!telemetryReceived) {
        telemetryReceived = true;
        const overlay = document.getElementById('connectionOverlay');
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.style.display = 'none', 500);
        }
    }

    // 1. Core Vehicle Stats
    const speedEl = document.getElementById('speedVal');
    const rpmEl = document.getElementById('rpmVal');
    const gearEl = document.getElementById('gearVal');
    
    if (speedEl) speedEl.innerText = data.speed ?? 0;
    if (rpmEl) rpmEl.innerText = data.rpm ?? 0;
    if (gearEl) gearEl.innerText = data.gear ?? 'N';
    
    // Mirror RPM to right-side display
    const rpmRight = document.getElementById('rpmValRight');
    if (rpmRight) rpmRight.innerText = data.rpm ?? 0;
    
    // Update G-force text display
    const gForceText = document.getElementById('gForceVal');
    if (gForceText && data.g_lat !== undefined) {
        gForceText.innerHTML = `${Math.abs(data.g_lat).toFixed(1)}G <span class="val-dim">(LAT)</span>`;
    }
    
    // Update track position label
    const trackPos = document.getElementById('trackPosLabel');
    if (trackPos && data.lap !== undefined) {
        trackPos.innerText = `LAP ${data.lap}`;
    }

    // 2. Session Info
    const lapEl = document.getElementById('lapVal');
    const posEl = document.getElementById('posVal');
    const bgPosEl = document.getElementById('bgPosVal');
    
    if (lapEl && data.lap !== undefined) lapEl.innerText = data.lap;
    if (posEl && data.pos !== undefined) {
        posEl.innerText = data.pos > 0 ? data.pos : '-';
        if (data.pos === 1) posEl.style.color = '#ffd700'; // Gold
        else if (data.pos === 2) posEl.style.color = '#c0c0c0'; // Silver
        else if (data.pos === 3) posEl.style.color = '#cd7f32'; // Bronze
        else posEl.style.color = '#00f3ff'; // Cyan
    }
    
    if (bgPosEl && data.pos !== undefined) {
        bgPosEl.innerText = (data.pos === 0 || data.pos === 255) ? "" : "P" + data.pos;
        if (data.pos === 1) bgPosEl.style.color = 'rgba(255, 215, 0, 0.25)';
        else if (data.pos === 2) bgPosEl.style.color = 'rgba(192, 192, 192, 0.25)';
        else if (data.pos === 3) bgPosEl.style.color = 'rgba(205, 127, 50, 0.25)';
        else bgPosEl.style.color = 'rgba(0, 243, 255, 0.08)';
    }

    // 3. Pedal telemetry
    const throttleEl = document.getElementById('throttleFill');
    const brakeEl = document.getElementById('brakeFill');
    if (throttleEl && data.throttle_pct !== undefined) throttleEl.style.width = `${data.throttle_pct}%`;
    if (brakeEl && data.brake_pct !== undefined) brakeEl.style.width = `${data.brake_pct}%`;
    
    // Steering visualizer (-128 to 127)
    const steer = data.steer || 0;
    const steerFill = document.getElementById('steerFill');
    if (steerFill) {
        if (steer < 0) {
            const pct = (Math.abs(steer) / 128) * 50;
            steerFill.style.width = pct + '%';
            steerFill.style.left = (50 - pct) + '%';
        } else if (steer > 0) {
            const pct = (steer / 127) * 50;
            steerFill.style.width = pct + '%';
            steerFill.style.left = '50%';
        } else {
            steerFill.style.width = '0%';
            steerFill.style.left = '50%';
        }
    }

    // 4. Mini Stats
    const powerEl = document.getElementById('powerVal');
    const fuelEl = document.getElementById('fuelVal');
    const massEl = document.getElementById('massVal');
    if (powerEl && data.power_hp !== undefined) powerEl.innerText = `${data.power_hp} HP`;
    if (fuelEl && data.fuel_pct !== undefined) fuelEl.innerText = `${data.fuel_pct}%`;
    const boostEl = document.getElementById('boostVal');
    if (boostEl && data.boost_psi !== undefined) boostEl.innerText = `${data.boost_psi.toFixed(1)} PSI`;
    if (massEl && window.inferredMass !== undefined) {
        if (window.inferredMass > 0) {
            massEl.innerHTML = `${Math.round(window.inferredMass)} <small>KG</small>`;
        }
    }

    // 5. Tyre Temperatures & Suspension Travel
    if (data.game_id) {
        const gid = document.getElementById('gameIdDisplay');
        if (gid) gid.innerText = data.game_id.toUpperCase();
    }



    if (data.susp) {
        ['FL', 'FR', 'RL', 'RR'].forEach((pos, idx) => {
            const val = document.getElementById('val' + pos);
            if (val) {
                const comp = data.susp[idx];
                val.innerText = Math.round(comp * 100) + '%';
            }
        });
        // Update suspension status labels
        const suspF = document.getElementById('suspFrontStatus');
        const suspR = document.getElementById('suspRearStatus');
        const avgFront = ((data.susp[0] || 0) + (data.susp[1] || 0)) / 2;
        const avgRear = ((data.susp[2] || 0) + (data.susp[3] || 0)) / 2;
        if (suspF) suspF.innerText = avgFront > 0.7 ? 'STRESSED' : 'OPTIMAL';
        if (suspR) suspR.innerText = avgRear > 0.7 ? 'STRESSED' : 'ACTIVE';
    }

    if (data.tyres) {
        const updateTire = (idBase, tData) => {
            if (!tData) return;
            const block = document.getElementById('tyre' + idBase);
            if (!block) return;
            
            const t = block.querySelector('.temp');
            if (t) {
                t.innerText = tData.temp + " °C";
                if (tData.temp < 70) t.style.color = '#0ea5e9'; // Cold Blue
                else if (tData.temp > 105) t.style.color = '#ff3366'; // Hot Red
                else t.style.color = '#10b981'; // Optimal Green
            }
            
            // Tyre slip text
            const slipEl = document.getElementById('slip' + idBase);
            if (slipEl) {
                const slipVal = tData.slip ? tData.slip.toFixed(2) : '0.00';
                slipEl.innerText = 'SLIP: ' + slipVal;
                if (tData.slip > 1.5) slipEl.style.color = '#ff3366';
                else if (tData.slip > 0.5) slipEl.style.color = '#ffb800';
                else slipEl.style.color = '#3d6b7a';
            }
            
            // Tyre wear text
            const wearEl = document.getElementById('wear' + idBase);
            if (wearEl) {
                const wearVal = tData.wear ? tData.wear.toFixed(0) + '%' : '--';
                wearEl.innerText = wearVal;
                if (tData.wear > 70) wearEl.style.color = '#ff3366';
                else if (tData.wear > 40) wearEl.style.color = '#ffb800';
            }
        };

        updateTire('FL', data.tyres.FL);
        updateTire('FR', data.tyres.FR);
        updateTire('RL', data.tyres.RL);
        updateTire('RR', data.tyres.RR);
    }
    // Lap Times formatting
    function formatLapTime(seconds) {
        if (!seconds || seconds <= 0) return "--:--.---";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }

    const bestLapEl = document.getElementById('bestLapVal');
    const lastLapEl = document.getElementById('lastLapVal');
    const currentLapEl = document.getElementById('currentLapVal');
    
    if (bestLapEl && data.best_lap !== undefined) bestLapEl.innerText = formatLapTime(data.best_lap);
    if (lastLapEl && data.last_lap !== undefined) lastLapEl.innerText = formatLapTime(data.last_lap);
    if (currentLapEl && data.current_lap !== undefined) currentLapEl.innerText = formatLapTime(data.current_lap);

    // 6. G-Force Dot Mapping
    const gDot = document.getElementById('gDot');
    if (gDot && data.g_lat !== undefined && data.g_lon !== undefined) {
        let dotX = Math.max(-40, Math.min(40, data.g_lat * 20));
        let dotY = Math.max(-40, Math.min(40, -data.g_lon * 20));
        gDot.style.transform = `translate(${dotX}px, ${dotY}px)`;
    }

    // 6b. Longitudinal G display
    const gLonEl = document.getElementById('gLonVal');
    if (gLonEl && data.g_lon !== undefined) {
        gLonEl.innerText = Math.abs(data.g_lon).toFixed(1) + 'G';
    }

    // 6c. Max RPM display
    const maxRpmEl = document.getElementById('maxRpmVal');
    if (maxRpmEl && data.max_rpm) maxRpmEl.innerText = Math.round(data.max_rpm).toLocaleString();

    // 6d. Yaw angle
    const yawEl = document.getElementById('yawVal');
    if (yawEl && data.yaw !== undefined) yawEl.innerText = (data.yaw * (180 / Math.PI)).toFixed(1) + '°';

    // 6e. Car ordinal
    const carOrdEl = document.getElementById('carOrdinal');
    if (carOrdEl && data.car_ordinal !== undefined) carOrdEl.innerText = data.car_ordinal || '--';

    // 6f. World position
    const worldXEl = document.getElementById('worldX');
    const worldZEl = document.getElementById('worldZ');
    if (worldXEl && data.pos_x !== undefined) worldXEl.innerText = data.pos_x.toFixed(1);
    if (worldZEl && data.pos_z !== undefined) worldZEl.innerText = data.pos_z.toFixed(1);

    // 6g. Race status
    const raceStatusEl = document.getElementById('raceStatusVal');
    if (raceStatusEl && data.is_race_on !== undefined) {
        raceStatusEl.innerText = data.is_race_on === 1 ? 'LIVE' : 'PAUSED';
        raceStatusEl.style.color = data.is_race_on === 1 ? '#00ffaa' : '#ffb800';
    }

    // 7. RPM Circular Arc Math & Blink
    const rpmFill = document.getElementById('rpmFill');
    if (rpmFill && data.max_rpm) {
        let maxOffset = 1555;
        let rpmPercent = (data.rpm || 0) / Math.max(data.max_rpm, 1);
        let offset = maxOffset - (maxOffset * rpmPercent);
        rpmFill.style.strokeDasharray = maxOffset + ' 2073';
        rpmFill.style.strokeDashoffset = offset;
        // Blink red when shifting is optimal (e.g. >95% max RPM)
        const rpmReadout = document.getElementById('rpmVal');
        if (rpmPercent > 0.95) {
            rpmFill.classList.add('rpm-blink');
            if (rpmReadout) rpmReadout.classList.add('rpm-text-blink');
        } else {
            rpmFill.classList.remove('rpm-blink');
            if (rpmReadout) rpmReadout.classList.remove('rpm-text-blink');
        }
    }

    // ============================================================================
    //   THIRD PERSON VIEW & CRASH DETECTION
    // ============================================================================
    if (data.speed !== undefined) {
        currentTelemetry = data;
        
        // Delegate all physics to the engine
        physics.update(data);
    }
});

// ============================================================================
//   2D VECTOR HUD CAR (CANVAS 2D)
// ============================================================================
const canvas = document.getElementById('trackMap');
const ctx = canvas.getContext('2d');
let currentTelemetry = null;
const physics = new PhysicsEngine();

function resizeCanvas() {
    if (!canvas) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
}
window.addEventListener('resize', resizeCanvas);
// Call once initially but delay slightly to ensure layout is done
setTimeout(resizeCanvas, 100);

// Crash Warning UI
const crashText = document.getElementById('headerAlerts');

let trailParticles = [];
let lastFrameTime = performance.now();
let gridOffsetY = 0;
let wheelOffset = 0;

function drawVectorCar() {
    requestAnimationFrame(drawVectorCar);
    if (!canvas) return;

    let now = performance.now();
    let dt = (now - lastFrameTime) / 1000;
    if (dt > 0.1) dt = 0.1;
    lastFrameTime = now;

    const width = canvas.width / window.devicePixelRatio;
    const height = canvas.height / window.devicePixelRatio;
    
    ctx.clearRect(0, 0, width, height);

    const speed = currentTelemetry ? currentTelemetry.speed : 0;
    const gLat = currentTelemetry ? currentTelemetry.g_lat : 0;
    const speedMs = speed / 3.6;
    const displayYaw = gLat * 0.12;

    let forwardSpeedPx = speedMs * 15;
    if (currentTelemetry && currentTelemetry.gear === 'R') {
        forwardSpeedPx = -forwardSpeedPx;
    }

    gridOffsetY = (gridOffsetY + forwardSpeedPx * dt) % 40;
    wheelOffset = (wheelOffset + forwardSpeedPx * dt * 2) % 10;

    const cx = width / 2;
    const cy = height / 2;
    
    // Read physics state FIRST
    let pState = physics.getState();
    let isCrashed = pState.isCrashed;
    
    let primaryColor = '#00f3ff';
    let chassisColor = 'rgba(0, 243, 255, 0.06)';
    let glowColor = 'rgba(0, 243, 255, 0.3)';
    
    if (pState.damageSeverity >= 2 || pState.criticalDamageCount >= 3 || pState.engineDamage >= 2) {
        primaryColor = '#ff3366';
        chassisColor = 'rgba(255, 51, 102, 0.08)';
        glowColor = 'rgba(255, 51, 102, 0.3)';
    } else if (pState.damageSeverity === 1 || pState.engineDamage === 1) {
        primaryColor = '#ffb800';
        chassisColor = 'rgba(255, 184, 0, 0.06)';
        glowColor = 'rgba(255, 184, 0, 0.3)';
    }
    
    if (isCrashed && pState.damageSeverity < 1) {
        primaryColor = '#ff3366';
        glowColor = 'rgba(255, 51, 102, 0.3)';
    }

    // Damage indicator text
    if (isCrashed) {
        if (pState.damageSeverity >= 2) {
            crashText.innerText = "CATASTROPHIC DAMAGE: CAR IS TOTALED";
            crashText.style.color = '#ff3366';
        } else if (pState.damageSeverity > 0) {
            crashText.innerText = "YOU'RE DAMAGING THE CAR, BE CAREFUL";
            crashText.style.color = '#ffcc00';
        } else {
            crashText.innerText = "SPUN OUT! REGAIN CONTROL";
            crashText.style.color = '#ff3366';
        }
        crashText.style.visibility = 'visible';
    } else if (pState.driftState !== 'NONE') {
        crashText.innerText = "DRIFTING";
        crashText.style.color = '#00f3ff';
        crashText.style.visibility = 'visible';
    } else {
        crashText.style.visibility = 'hidden';
    }

    if (isCrashed || pState.driftState !== 'NONE') {
        crashText.style.opacity = (Math.floor(performance.now() / 500) % 2 === 0) ? '1' : '0.2';
    } else {
        crashText.style.opacity = '1';
    }

    // ── ISOMETRIC GROUND GRID ──
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 0.5);
    ctx.rotate(-Math.PI * 0.75);
    ctx.rotate(-displayYaw);
    if (isCrashed) ctx.translate((Math.random()-0.5)*10, (Math.random()-0.5)*10);

    ctx.strokeStyle = 'rgba(0, 243, 255, 0.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const gSize = 800;
    for (let i = -gSize; i < gSize; i += 40) {
        ctx.moveTo(i, -gSize + gridOffsetY); ctx.lineTo(i, gSize + gridOffsetY);
        ctx.moveTo(-gSize, i); ctx.lineTo(gSize, i);
    }
    ctx.stroke();
    ctx.restore();

    // ── GT3 WIREFRAME CAR (3/4 Isometric View) ──
    ctx.save();
    ctx.translate(cx, cy);

    // Apply isometric projection for the car too
    ctx.scale(1, 0.55);
    ctx.rotate(-Math.PI * 0.19); // Slight angle for 3/4 view
    
    ctx.rotate(displayYaw);
    if (isCrashed) ctx.translate((Math.random()-0.5)*8, (Math.random()-0.5)*8);

    // Scale the car up
    const S = 2.2;
    ctx.scale(S, S);

    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 0.8;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // ── CACHED CHASSIS RENDERING (Off-Screen Canvas) ──
    // Invalidate cache if color changed (damage state shift)
    if (window.cachedCarColor && window.cachedCarColor !== primaryColor) {
        window.cachedCarCanvas = null;
    }
    
    if (!window.cachedCarCanvas) {
        const oc = document.createElement('canvas');
        oc.width = 120;
        oc.height = 320;
        const octx = oc.getContext('2d');
        octx.translate(60, 160); // Center the drawing
        
        octx.strokeStyle = primaryColor;
        octx.lineJoin = 'round';
        octx.lineCap = 'round';

        // ── GT3 BODY OUTLINE ──
        octx.lineWidth = 1.0;
        octx.beginPath();
        octx.moveTo(-10, -72);
        octx.quadraticCurveTo(-4, -76, 0, -78);
        octx.quadraticCurveTo(4, -76, 10, -72);
        octx.bezierCurveTo(14, -68, 18, -62, 20, -55);
        octx.lineTo(21, -42);
        octx.bezierCurveTo(22, -30, 22, -15, 23, -5);
        octx.bezierCurveTo(24, 8, 28, 18, 32, 28);
        octx.bezierCurveTo(34, 35, 33, 42, 31, 48);
        octx.lineTo(20, 55);
        octx.lineTo(-20, 55);
        octx.lineTo(-31, 48);
        octx.bezierCurveTo(-33, 42, -34, 35, -32, 28);
        octx.bezierCurveTo(-28, 18, -24, 8, -23, -5);
        octx.bezierCurveTo(-22, -15, -22, -30, -21, -42);
        octx.lineTo(-20, -55);
        octx.bezierCurveTo(-18, -62, -14, -68, -10, -72);
        octx.closePath();
        octx.fillStyle = chassisColor;
        octx.fill();
        octx.stroke();

        // ── FRONT SPLITTER ──
        octx.lineWidth = 0.7;
        octx.beginPath();
        octx.moveTo(-18, -70); octx.lineTo(18, -70);
        octx.moveTo(-22, -67); octx.lineTo(22, -67);
        octx.moveTo(-20, -69); octx.lineTo(-24, -64);
        octx.moveTo(20, -69); octx.lineTo(24, -64);
        octx.stroke();

        // ── DOOR PANEL LINES ──
        octx.globalAlpha = 0.4;
        octx.beginPath();
        octx.moveTo(16, -42); octx.bezierCurveTo(17, -20, 18, 0, 22, 15);
        octx.moveTo(-16, -42); octx.bezierCurveTo(-17, -20, -18, 0, -22, 15);
        octx.stroke();
        octx.globalAlpha = 1.0;

        // ── SIDE AIR INTAKES ──
        octx.lineWidth = 0.6;
        octx.beginPath();
        octx.moveTo(23, 5); octx.lineTo(27, 10); octx.lineTo(27, 20); octx.lineTo(24, 18);
        octx.moveTo(-23, 5); octx.lineTo(-27, 10); octx.lineTo(-27, 20); octx.lineTo(-24, 18);
        octx.stroke();

        // ── SIDE MIRRORS ──
        octx.lineWidth = 0.8;
        octx.beginPath();
        octx.moveTo(20, -38); octx.lineTo(26, -40);
        octx.moveTo(25, -42); octx.lineTo(27, -42); octx.lineTo(27, -38); octx.lineTo(25, -38); octx.closePath();
        octx.stroke();
        octx.beginPath();
        octx.moveTo(-20, -38); octx.lineTo(-26, -40);
        octx.moveTo(-25, -42); octx.lineTo(-27, -42); octx.lineTo(-27, -38); octx.lineTo(-25, -38); octx.closePath();
        octx.stroke();

        // ── WINDSHIELD / CANOPY ──
        octx.lineWidth = 0.8;
        octx.beginPath();
        octx.moveTo(-12, -32);
        octx.quadraticCurveTo(-6, -46, 0, -48);
        octx.quadraticCurveTo(6, -46, 12, -32);
        octx.lineTo(11, 0);
        octx.quadraticCurveTo(0, 4, -11, 0);
        octx.closePath();
        octx.fillStyle = 'rgba(0, 243, 255, 0.03)';
        octx.fill();
        octx.stroke();

        // ── ROLL CAGE / INTERNAL SKELETON ──
        octx.strokeStyle = primaryColor;
        octx.globalAlpha = 0.2;
        octx.lineWidth = 0.5;
        octx.beginPath();
        octx.moveTo(0, -72); octx.lineTo(0, 55);
        octx.moveTo(-15, -55); octx.lineTo(15, -55);
        octx.moveTo(-17, -35); octx.lineTo(17, -35);
        octx.moveTo(-20, -5); octx.lineTo(20, -5);
        octx.moveTo(-28, 38); octx.lineTo(28, 38);
        octx.moveTo(-12, -35); octx.lineTo(-20, -5);
        octx.moveTo(12, -35); octx.lineTo(20, -5);
        octx.moveTo(-20, -5); octx.lineTo(-28, 38);
        octx.moveTo(20, -5); octx.lineTo(28, 38);
        octx.moveTo(-20, 15); octx.lineTo(20, 38);
        octx.moveTo(20, 15); octx.lineTo(-20, 38);
        octx.stroke();
        octx.globalAlpha = 1.0;

        // ── REAR WING ──
        octx.strokeStyle = primaryColor;
        octx.lineWidth = 1.2;
        octx.beginPath();
        octx.moveTo(-28, 58); octx.lineTo(-28, 65);
        octx.moveTo(28, 58); octx.lineTo(28, 65);
        octx.moveTo(-28, 62); octx.lineTo(28, 62);
        octx.moveTo(-26, 59); octx.lineTo(26, 59);
        octx.moveTo(-15, 55); octx.lineTo(-15, 62);
        octx.moveTo(15, 55); octx.lineTo(15, 62);
        octx.stroke();

        // ── REAR DIFFUSER VENTS ──
        octx.lineWidth = 0.5;
        octx.globalAlpha = 0.35;
        octx.beginPath();
        octx.moveTo(-15, 55); octx.lineTo(-15, 52);
        octx.moveTo(-8, 55); octx.lineTo(-8, 52);
        octx.moveTo(0, 55); octx.lineTo(0, 52);
        octx.moveTo(8, 55); octx.lineTo(8, 52);
        octx.moveTo(15, 55); octx.lineTo(15, 52);
        octx.stroke();
        octx.globalAlpha = 1.0;

        // ── EXHAUST OUTLETS ──
        octx.lineWidth = 0.7;
        octx.beginPath();
        octx.arc(-8, 56, 2.5, 0, Math.PI * 2);
        octx.arc(8, 56, 2.5, 0, Math.PI * 2);
        octx.stroke();

        // ── TAILLIGHTS ──
        octx.fillStyle = '#ff3366';
        octx.globalAlpha = 0.6;
        octx.beginPath();
        octx.moveTo(-22, 54); octx.lineTo(-12, 54); octx.lineTo(-12, 55); octx.lineTo(-22, 55); octx.closePath();
        octx.moveTo(22, 54); octx.lineTo(12, 54); octx.lineTo(12, 55); octx.lineTo(22, 55); octx.closePath();
        octx.fill();
        octx.globalAlpha = 1.0;

        // ── HEADLIGHTS ──
        octx.fillStyle = primaryColor;
        octx.globalAlpha = 0.8;
        octx.beginPath();
        octx.arc(-8, -66, 2, 0, Math.PI*2);
        octx.arc(8, -66, 2, 0, Math.PI*2);
        octx.fill();
        
        // Headlight Beams
        octx.fillStyle = 'rgba(0, 243, 255, 0.08)';
        octx.beginPath();
        octx.moveTo(-9, -67); octx.lineTo(-25, -140); octx.lineTo(-2, -140); octx.lineTo(-7, -67);
        octx.moveTo(9, -67); octx.lineTo(25, -140); octx.lineTo(2, -140); octx.lineTo(7, -67);
        octx.fill();
        octx.globalAlpha = 1.0;
        
        window.cachedCarCanvas = oc;
        window.cachedCarColor = primaryColor;
    }
    
    // Draw the static cached car chassis
    ctx.drawImage(window.cachedCarCanvas, -60, -160);

    // ── ROLLING WHEELS ──
    const drawWheel = (x, y, w, h, steer, isFront) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(steer);
        
        const r = 2;
        ctx.fillStyle = 'rgba(10, 12, 15, 0.95)';
        ctx.strokeStyle = 'rgba(0, 243, 255, 0.4)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(-w/2 + r, -h/2);
        ctx.lineTo(w/2 - r, -h/2);
        ctx.quadraticCurveTo(w/2, -h/2, w/2, -h/2 + r);
        ctx.lineTo(w/2, h/2 - r);
        ctx.quadraticCurveTo(w/2, h/2, w/2 - r, h/2);
        ctx.lineTo(-w/2 + r, h/2);
        ctx.quadraticCurveTo(-w/2, h/2, -w/2, h/2 - r);
        ctx.lineTo(-w/2, -h/2 + r);
        ctx.quadraticCurveTo(-w/2, -h/2, -w/2 + r, -h/2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Brake Caliper
        ctx.fillStyle = isFront ? '#ff3366' : '#ffb800';
        ctx.beginPath();
        ctx.rect(-w/2 + 1, -h/4, 3, h/2);
        ctx.fill();

        // Inner Rim
        ctx.fillStyle = 'rgba(30, 35, 40, 0.8)';
        ctx.strokeStyle = 'rgba(0, 243, 255, 0.2)';
        ctx.beginPath();
        ctx.rect(-w/2 + 2, -h/2 + 3, w - 4, h - 6);
        ctx.fill();
        ctx.stroke();
        
        // Rolling tread lines
        ctx.strokeStyle = primaryColor;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        let speedMult = currentTelemetry ? (currentTelemetry.speed / 50) : 1;
        let activeOffset = wheelOffset * speedMult;
        for (let ty = -h/2 + 3 + (activeOffset % 6); ty < h/2 - 3; ty += 6) {
            ctx.moveTo(-w/2 + 3, ty);
            ctx.lineTo(w/2 - 3, ty);
        }
        ctx.stroke();
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = 0.8;
        
        ctx.restore();
    };

    const steerAngle = currentTelemetry ? (currentTelemetry.steer / 128) * (Math.PI / 5) : 0;
    
    drawWheel(-22, -45, 11, 24, steerAngle, true);
    drawWheel(22, -45, 11, 24, steerAngle, true);
    drawWheel(-24, 38, 13, 26, 0, false);
    drawWheel(24, 38, 13, 26, 0, false);

    // ── SUSPENSION TRAVEL BARS ──
    const susp = currentTelemetry ? currentTelemetry.susp : [0.5, 0.5, 0.5, 0.5];
    const drawSuspBar = (x, y, travel) => {
        const barH = 18;
        const fillH = travel * barH;
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(x - 1.5, y - barH/2, 3, barH);
        const color = travel > 0.7 ? '#ff3366' : travel > 0.4 ? '#ffb800' : '#00ffaa';
        ctx.fillStyle = color;
        ctx.fillRect(x - 1.5, y + barH/2 - fillH, 3, fillH);
        ctx.strokeStyle = 'rgba(0,243,255,0.2)';
        ctx.strokeRect(x - 1.5, y - barH/2, 3, barH);
    };
    
    drawSuspBar(-34, -45, susp[0]);
    drawSuspBar(34, -45, susp[1]);
    drawSuspBar(-42, 38, susp[2]);
    drawSuspBar(42, 38, susp[3]);

    // ── BRAKE LIGHTS (Lightweight — no shadowBlur) ──
    if (currentTelemetry && (currentTelemetry.brake_pct > 10 || isCrashed)) {
        ctx.fillStyle = '#ff3333';
        ctx.globalAlpha = 0.9;
        ctx.fillRect(-16, 53, 10, 2);
        ctx.fillRect(6, 53, 10, 2);
        ctx.globalAlpha = 1.0;
    }


    // ── MOTION STREAKS (when car is moving fast) ──
    if (speed > 80) {
        ctx.strokeStyle = `rgba(0, 243, 255, ${Math.min((speed - 80) / 200, 0.25)})`;
        ctx.lineWidth = 0.5;
        const streakLen = Math.min(speed / 3, 60);
        ctx.beginPath();
        ctx.moveTo(-35, 55); ctx.lineTo(-35 - streakLen * 0.3, 55 + streakLen);
        ctx.moveTo(-20, 58); ctx.lineTo(-20 - streakLen * 0.2, 58 + streakLen);
        ctx.moveTo(0, 60); ctx.lineTo(0, 60 + streakLen);
        ctx.moveTo(20, 58); ctx.lineTo(20 + streakLen * 0.2, 58 + streakLen);
        ctx.moveTo(35, 55); ctx.lineTo(35 + streakLen * 0.3, 55 + streakLen);
        ctx.stroke();
    }

    ctx.restore();
}

requestAnimationFrame(drawVectorCar);


// ============================================================================
//   AI RACE ENGINEER (GEMINI + EDGE-TTS)
// ============================================================================
let isCommEnabled = true;

document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('commToggle');
    if (toggle) {
        isCommEnabled = toggle.checked;
        toggle.addEventListener('change', () => {
            isCommEnabled = toggle.checked;
            if (isCommEnabled) {
                const audioEl = document.getElementById('aiAudio');
                if (audioEl) {
                    audioEl.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
                    audioEl.play().catch(e => console.log("Audio unlock failed: ", e));
                }
                // Request immediate test from server so the user knows it's working instantly
                socket.emit('request_ai_test');
            }
        });
    }

    const micToggle = document.getElementById('micToggle');
    const micStatusLabel = document.getElementById('micStatusLabel');
    let mediaRecorder;
    let audioChunks = [];
    let listenInterval = null;
    let micEnabled = false; // Default off

    if (micToggle) {
        micToggle.checked = micEnabled;
        
        micToggle.addEventListener('change', () => {
            micEnabled = micToggle.checked;
            updateListenState();
        });

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            if (micStatusLabel) {
                micStatusLabel.innerText = 'UNSUPPORTED';
                micStatusLabel.style.color = '#ff3366';
            }
        } else {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = false;
            recognition.lang = 'en-US';

            recognition.onresult = (event) => {
                const finalTranscript = event.results[event.results.length - 1][0].transcript;
                if (finalTranscript.trim().length > 0) {
                    socket.emit('client_text', { text: finalTranscript.trim() });
                }
            };

            recognition.onerror = (event) => {
                console.error("Speech Recognition Error:", event.error);
                if (event.error === 'not-allowed' && micStatusLabel) {
                    micStatusLabel.innerText = 'MIC DENIED';
                    micStatusLabel.style.color = '#ff3366';
                    micEnabled = false;
                    micToggle.checked = false;
                }
            };

            recognition.onend = () => {
                if (micEnabled) {
                    try { recognition.start(); } catch(e) {}
                }
            };

            function updateListenState() {
                if (micEnabled) {
                    try { recognition.start(); } catch(e) {}
                    if (micStatusLabel) {
                        micStatusLabel.innerText = 'MIC ACTIVE';
                        micStatusLabel.style.color = '#ff3366';
                        micStatusLabel.style.fontWeight = 'bold';
                    }
                } else {
                    recognition.stop();
                    if (micStatusLabel) {
                        micStatusLabel.innerText = 'MICROPHONE';
                        micStatusLabel.style.color = 'var(--text-dim)';
                        micStatusLabel.style.fontWeight = 'normal';
                    }
                }
            }

            if (toggle) {
                toggle.addEventListener('change', () => {});
            }
            updateListenState();
        }
    }
});

const subtitleContainer = document.createElement('div');
subtitleContainer.style.position = 'fixed';
subtitleContainer.style.bottom = '40px';
subtitleContainer.style.left = '50%';
subtitleContainer.style.transform = 'translateX(-50%)';
subtitleContainer.style.width = '80%';
subtitleContainer.style.maxWidth = '1000px';
subtitleContainer.style.background = 'rgba(15, 23, 42, 0.7)';
subtitleContainer.style.backdropFilter = 'blur(24px)';
subtitleContainer.style.webkitBackdropFilter = 'blur(24px)';
subtitleContainer.style.border = '1px solid rgba(14, 165, 233, 0.3)';
subtitleContainer.style.borderRadius = '12px';
subtitleContainer.style.padding = '20px 30px';
subtitleContainer.style.color = '#fff';
subtitleContainer.style.fontFamily = "'Inter', sans-serif";
subtitleContainer.style.fontSize = '24px';
subtitleContainer.style.fontWeight = '600';
subtitleContainer.style.textAlign = 'center';
subtitleContainer.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.5), inset 0 0 20px rgba(14, 165, 233, 0.1)';
subtitleContainer.style.display = 'none';
subtitleContainer.style.zIndex = '9999';
document.body.appendChild(subtitleContainer);

let subtitleTimeout;

socket.on('play_audio', (payload) => {
    const text = payload.text || "";
    if (text) {
        subtitleContainer.innerText = text;
        subtitleContainer.style.display = 'block';
    }

    if (subtitleTimeout) clearTimeout(subtitleTimeout);
    
    let readTimeMs = Math.max(3000, text.split(' ').length * 350);
    subtitleTimeout = setTimeout(() => {
        subtitleContainer.style.display = 'none';
    }, readTimeMs);

    if (!isCommEnabled) {
        return;
    }
    
    const audioEl = document.getElementById('aiAudio');
    if (audioEl) {
        const mimeType = payload.mime || 'audio/mp3';
        audioEl.src = `data:${mimeType};base64,` + payload.audio;
        audioEl.play().catch(e => console.error("Audio playback blocked by browser:", e));
        
        audioEl.onended = () => {
            subtitleContainer.style.display = 'none';
            if (subtitleTimeout) clearTimeout(subtitleTimeout);
        };
    }
});

socket.on('stop_audio', () => {
    const audioEl = document.getElementById('aiAudio');
    if (audioEl) {
        audioEl.pause();
        audioEl.currentTime = 0;
    }
    
    subtitleContainer.style.display = 'none';
    if (subtitleTimeout) clearTimeout(subtitleTimeout);
});socket.on('header_alert', data => alert(data.msg));
