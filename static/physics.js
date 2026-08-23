class PhysicsEngine {
    constructor() {
        this.lastCarOrdinal = 0;
        this.lastDamageTime = 0;
        
        this.isPulling = false;
        this.pullStartTime = 0;
        
        // Inferred Kinematics
        this.inferredMass = 0; // kg
        
        // Output states
        this.isCrashed = false;
        this.driftState = 'NONE'; // 'NONE', 'DRIFTING', 'SPUN_OUT'
        this.hasBlowout = false;
        
        // Detailed Damage (from backend)
        this.damage_drivetrain = false;
        this.damage_suspension = false;
        this.damage_aero = false;
        this.damage_totaled = false;
    }



    update(data) {
        if (data.speed === undefined || data.is_race_on !== 1) return;
        
        let now = Date.now();
        let speedMps = data.speed / 3.6; // m/s
        // 0. CAR SWAP RESET
        if (data.car_ordinal !== undefined && data.car_ordinal !== 0) {
            if (this.lastCarOrdinal !== 0 && this.lastCarOrdinal !== data.car_ordinal) {
                this.isCrashed = false;
                this.hasBlowout = false;
                this.damage_drivetrain = false;
                this.damage_suspension = false;
                this.damage_aero = false;
                this.damage_totaled = false;
                this.inferredMass = 0;
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
        
        this.isCrashed = data.is_crash || false;
        this.damage_drivetrain = data.damage_drivetrain || false;
        this.damage_suspension = data.damage_suspension || false;
        this.damage_aero = data.damage_aero || false;
        this.damage_totaled = data.damage_totaled || false;

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
                }
            }
        }
    }

    getState() {
        return {
            isCrashed: this.isCrashed || this.hasBlowout,
            damage_drivetrain: this.damage_drivetrain,
            damage_suspension: this.damage_suspension,
            damage_aero: this.damage_aero,
            damage_totaled: this.damage_totaled,
            driftState: this.driftState,
            hasBlowout: this.hasBlowout
        };
    }
}
