class PhysicsEngine {
    constructor() {
        this.damageSeverity = 0;
        this.engineDamage = 0;
        this.criticalDamageCount = 0;
        this.lastDamageTime = 0;
        this.lastCarOrdinal = 0;
        
        this.speedHistory = [];
        this.keHistory = [];
        this.gHistory = [];
        
        this.isPulling = false;
        this.pullStartTime = 0;
        
        // Inferred Kinematics
        this.inferredMass = 0; // kg
        
        // Output states
        this.isCrashed = false;
        this.crashTimer = null;
        this.driftState = 'NONE'; // 'NONE', 'DRIFTING', 'SPUN_OUT'
        this.hasBlowout = false;
    }

    triggerCrashGlitch(durationMs = 7000) {
        if (!this.isCrashed) {
            this.isCrashed = true;
            if (this.crashTimer) clearTimeout(this.crashTimer);
            this.crashTimer = setTimeout(() => { this.isCrashed = false; }, durationMs);
        }
    }

    update(data) {
        if (data.speed === undefined || data.is_race_on !== 1) return;
        
        let now = Date.now();
        let speedMps = data.speed / 3.6; // m/s
        // 0. CAR SWAP RESET
        if (data.car_ordinal !== undefined && data.car_ordinal !== 0) {
            if (this.lastCarOrdinal !== 0 && this.lastCarOrdinal !== data.car_ordinal) {
                this.damageSeverity = 0;
                this.engineDamage = 0;
                this.criticalDamageCount = 0;
                this.isCrashed = false;
                this.hasBlowout = false;
                this.inferredMass = 0; // reset mass inference
            }
            this.lastCarOrdinal = data.car_ordinal;
        }

        let throttle = data.throttle_pct || 0;
        let brake = data.brake_pct || 0;
        let gLon = data.g_lon || 0;
        let powerWatts = (data.power_hp || 0) * 745.7;

        // 1. DYNAMIC MASS INFERENCE (Newton's 2nd Law)
        // If accelerating hard in a straight line, infer the car's mass
        if (throttle > 90 && brake < 5 && speedMps > 10 && gLon > 0.2) {
            // F = P / v
            let forceWheels = powerWatts / speedMps;
            // a = g * 9.8
            let accel = gLon * 9.8;
            // m = F / a
            let instantMass = forceWheels / accel;
            
            if (instantMass > 500 && instantMass < 5000) { // Sane limits (500kg to 5000kg)
                if (this.inferredMass === 0) {
                    this.inferredMass = instantMass;
                } else {
                    // Exponential moving average to smooth it out
                    this.inferredMass = (this.inferredMass * 0.95) + (instantMass * 0.05);
                }
                window.inferredMass = this.inferredMass;
            }
        }
        
        // 2. KINETIC ENERGY CRASH MODEL
        // KE = 1/2 * m * v^2
        let currentMass = this.inferredMass > 0 ? this.inferredMass : 1500; // Fallback to 1500kg if unknown
        let currentKE = 0.5 * currentMass * (speedMps * speedMps); // Joules
        
        this.keHistory.push({ time: now, ke: currentKE });
        this.keHistory = this.keHistory.filter(k => now - k.time <= 400); // 400ms window

        if (this.keHistory.length > 0 && (now - this.lastDamageTime > 5000)) {
            let maxKeInWindow = Math.max(...this.keHistory.map(k => k.ke));
            let keDissipated = maxKeInWindow - currentKE; // Joules dissipated in impact
            
            let suspBottomed = data.susp && data.susp.some(s => s > 0.95);
            
            let severeImpact = false;
            let criticalImpact = false;
            
            // 1 MJ (Megajoule) dissipation is roughly a 1500kg car dropping from 100km/h to 0 instantly.
            if (keDissipated > 1000000 || (maxKeInWindow > 500000 && currentKE < 5000 && keDissipated > 500000)) {
                criticalImpact = true;
            } else if (keDissipated > 400000) {
                severeImpact = true;
            } else if (suspBottomed && keDissipated > 200000) {
                severeImpact = true;
            } else if (Math.abs(data.g_lat) > 4.0 || Math.abs(gLon) > 4.0) {
                severeImpact = true;
            }
            
            if (brake > 5 && keDissipated < 600000 && Math.abs(gLon) < 8.0) {
                // Hard braking, not a wall hit
                severeImpact = false;
                criticalImpact = false;
            }
            
            if (criticalImpact) {
                this.damageSeverity = 2;
                this.criticalDamageCount++;
                this.lastDamageTime = now;
                this.triggerCrashGlitch(7000); // 7 second alert
            } else if (severeImpact) {
                this.damageSeverity = Math.min(2, this.damageSeverity + 1);
                this.lastDamageTime = now;
                this.triggerCrashGlitch(7000);
            }
        }

        // 3. DRIFT DETECTION & TIRE BLOWOUT
        this.driftState = 'NONE';
        this.hasBlowout = false;
        
        let speed = data.speed || 0;
        let gLat = data.g_lat || 0;
        let steer = data.steer || 0; // -128 to 127
        
        if (speed > 20) {
            let steerNormalized = steer / 127.0; // -1 to 1
            // If cornering hard (high lateral G) and counter-steering
            let isCounterSteering = (gLat * steerNormalized) > 0.15; 
            
            if (Math.abs(gLat) > 0.5 && data.tyres) {
                let rearSlip = (data.tyres.RL.slip + data.tyres.RR.slip) / 2.0;
                
                if (isCounterSteering && rearSlip > 0.8) {
                    this.driftState = 'DRIFTING';
                } else if (Math.abs(gLat) > 1.2) {
                    // Snap oversteer / spin out check
                    if (rearSlip > 1.5) {
                        this.driftState = 'SPUN_OUT';
                    }
                }
            }
            
            // Blowout check: high temp + drifting/pulling
            if (data.tyres) {
                let maxFrontTemp = Math.max(data.tyres.FL.temp, data.tyres.FR.temp);
                if (maxFrontTemp > 120 && Math.abs(gLat) > 0.4 && isCounterSteering) {
                    this.hasBlowout = true;
                    this.triggerCrashGlitch(7000);
                }
            }
        }
    }

    getState() {
        return {
            isCrashed: this.isCrashed || this.hasBlowout,
            damageSeverity: this.hasBlowout ? 2 : this.damageSeverity,
            criticalDamageCount: this.criticalDamageCount,
            engineDamage: this.engineDamage,
            driftState: this.driftState
        };
    }
}
