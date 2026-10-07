const fs = require('fs');

let html = fs.readFileSync('video-deteksi.html', 'utf8');
const startToken = '<script src="ai-engine.js"></script>';
const endToken = '/* =========================================================================\n   BAGIAN 2: DETEKSI VIDEO CCTV';
const part1 = html.substring(html.indexOf(startToken), html.indexOf(endToken));
let jsCode = part1.substring(part1.indexOf('<script>') + 8);

// Adjust Bpan to use BX_R so it turns into Panorama from the curb lane
jsCode = jsCode.replace(
    'const curveBpan = bezierCurve([BX_L, 435], [BX_L, 468], [460, 488], [500, 488], 24);',
    'const curveBpan = bezierCurve([BX_R, 440], [BX_R, 470], [470, 488], [500, 488], 24);'
).replace(
    'Bpan:  mk([[BX_L, -40], ...curveBpan, [760, 488]]),',
    'Bpan:  mk([[BX_R, -40], ...curveBpan, [760, 488]]),'
);

// We replace isFree, spawn, and step in the JS code string
// Let's write the improved functions:

const replacementFunctions = `
function isFree(path, x, y) {
    const samePathBlocked = cars.some(car => car.p === path && car.s < 75);
    if (samePathBlocked) return false;
    const physicalBlocked = cars.some(car => {
        const point = at(car.p, car.s);
        return Math.hypot(point.x - x, point.y - y) < 60;
    });
    return !physicalBlocked;
}

function spawn(key, color, tag) {
    const path = paths[key];
    if (!path) return;
    if (cars.length >= 10) return;
    const samePathCount = cars.filter(car => car.p === path).length;
    if (samePathCount >= 2) return;
    const queueAtStart = cars.filter(car => car.p === path && car.s < 180).length;
    if (queueAtStart >= 1) return;
    const point = at(path, 0);
    if (isFree(path, point.x, point.y)) {
        cars.push({
            p: path,
            s: 0,
            v: 50,
            col: color,
            tag,
            k: key,
            id: ++uid,
            angle: point.a
        });
    }
}

function step(dt) {
    phaseTime += dt;
    const pedestrianRequest = videoTrafficState.pedestrianRequested && videoTrafficState.pedestrianVerified;

    if (pedestrianRequest && [0, 2, 4].includes(phase)) {
        if (phaseTime >= 10) phaseTime = Math.max(phaseTime, phases[phase].d);
    }

    if (phases[phase].id === 'STATE_2' && countPanoramaCrossingVehicles() > 0 && phaseTime >= 12) {
        phaseTime = Math.max(phaseTime, phases[phase].d);
    }

    if (phaseTime >= phases[phase].d) {
        let nextPhase;
        const curId = phases[phase].id;

        if (curId === 'STATE_1') {
            nextPhase = 1;
        } else if (curId === 'TRANS_1') {
            nextPhase = 2;
        } else if (curId === 'STATE_2') {
            nextPhase = 3;
        } else if (curId === 'TRANS_2') {
            if (pedestrianRequest) {
                nextPhase = 6;
            } else {
                const panQueue = countPanoramaCrossingVehicles();
                if (panQueue === 0) {
                    const turnQueue = countTurnVehicles();
                    nextPhase = turnQueue > 0 ? 0 : 2;
                } else {
                    nextPhase = 4;
                }
            }
        } else if (curId === 'STATE_3') {
            nextPhase = 5;
        } else if (curId === 'TRANS_3') {
            if (pedestrianRequest) {
                nextPhase = 6;
            } else {
                const turnQueue = countTurnVehicles();
                nextPhase = turnQueue > 0 ? 0 : 2;
            }
        } else if (curId === 'PELICAN_WALK') {
            nextPhase = 7;
        } else if (curId === 'PELICAN_FLASH') {
            nextPhase = 8;
        } else if (curId === 'PELICAN_TRANS') {
            videoTrafficState.pedestrianRequested = false;
            videoTrafficState.pedestrianVerified = false;
            onPedestrianCrossingComplete();
            const turnQueue = countTurnVehicles();
            nextPhase = turnQueue > 0 ? 0 : 2;
        } else {
            nextPhase = 0;
        }

        enterPhase(nextPhase);
    }

    updateSignals();
    updateHUDPhase();
    updateTelemetryStats();
    pedestrianAudio(dt);

    timers.a -= dt; timers.b -= dt; timers.p -= dt; timers.v -= dt;

    if (timers.a <= 0) {
        timers.a = 5.0 + Math.random() * 3.5;
        const r = Math.random();
        if (r < .35) spawn(Math.random() < .5 ? 'Astr' : 'Astr2', '#7d8f78', 'Lurus Lembang');
        else if (r < .55) spawn('Avit', '#7d8f78', 'Vitasari');
        else if (r < .80) spawn('Aup', '#f59e0b', 'Jalan A → Panorama (via U-Turn Atas)');
        else spawn('Au', '#b0765a', 'Jalan A → Bandung (via U-Turn Atas)');
    }
    if (timers.b <= 0) {
        timers.b = 5.0 + Math.random() * 3.5;
        const r = Math.random();
        if (r < .35) spawn('Bpan', '#38bdf8', 'Belok Panorama');
        else if (r < .62) spawn('Bu', '#ec4899', 'U-Turn Bawah');
        else spawn(Math.random() < .5 ? 'Bdn' : 'Bdn2', '#6b7f8a', 'Lurus Bandung');
    }
    if (timers.p <= 0) {
        timers.p = 8.0 + Math.random() * 5.0;
        const r = Math.random();
        if (r < 0.35) {
            spawn('Pin', '#a855f7', 'Panorama → Jalan B (Bandung)');
        } else if (r < 0.68) {
            spawn('Pvit', '#c084fc', 'Panorama → Vitasari (Menyeberang)');
        } else {
            spawn('Pupi', '#e879f9', 'Panorama → Gerlong/UPI (Lembang)');
        }
    }
    if (timers.v <= 0) {
        timers.v = 12.0 + Math.random() * 8.0;
        spawn('VitA', '#34d399', 'Vitasari → Gerlong/UPI (Setiabudi Atas)');
    }

    stepPedestrians(dt);

    const brake = distance => Math.sqrt(2 * 180 * Math.max(distance, 0));
    const MIN_STOPPED_GAP = 20;
    const SAFE_FOLLOW_DIST = LEN + MIN_STOPPED_GAP; // 52px

    cars.forEach(car => {
        const point = at(car.p, car.s);

        // 1. Stabilisasi Sudut Kemudi
        if (car.angle === undefined) car.angle = point.a;
        let diff = point.a - car.angle;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        const turnRate = Math.max(7.0, (car.v / 50) * 11);
        const maxTurn = turnRate * dt;
        if (Math.abs(diff) <= maxTurn) car.angle = point.a;
        else car.angle += Math.sign(diff) * maxTurn;

        const cosine = Math.cos(car.angle), sine = Math.sin(car.angle);
        const front = car.s + LEN / 2;
        let limit = (car.k === 'Pin' || car.k === 'Pupi' || car.k === 'Pvit') ? 60 : 80;

        // 2. Regulasi Kecepatan Menikung
        const curCurv = getPathCurvature(car.p, car.s);
        const aheadCurv = getPathCurvature(car.p, car.s + 28);
        const maxCurv = Math.max(curCurv, aheadCurv);
        if (maxCurv > 0.0032) {
            const cornerLimit = Math.max(38, 80 - maxCurv * 2200);
            limit = Math.min(limit, cornerLimit);
        }

        // =========================================================================
        // YIELD RULES SEBELUM MASUK JALUR UTAMA (HAK UTAMA JALAN SETIABUDI)
        // =========================================================================

        // [A] Prioritas Vitasari keluar (VitA) -> Wajib mengalah ke Jalan A
        if (car.k === 'VitA' && car.s >= 180 && car.s <= 250) {
            const jalanABlocked = cars.some(other => {
                if (other === car || other.k === 'VitA') return false;
                const q = at(other.p, other.s);
                return q.x >= 260 && q.x <= 335 && q.y >= 300 && q.y <= 600;
            });
            if (jalanABlocked) {
                limit = 0;
                if (car.s >= 235) { car.s = 235; car.v = 0; }
            }
        }

        // [B] Prioritas U-Turn Atas (Au, Aup) -> Wajib mengalah ke Jalan B
        // Menahan di s=725 (x≈370, aman di dalam bukaan median, tidak menyenggol Jalan B)
        if ((car.k === 'Au' || car.k === 'Aup') && car.s >= 670 && car.s <= 740) {
            const jalanBBlocked = cars.some(other => {
                if (other === car || other.k === 'Au' || other.k === 'Aup') return false;
                const q = at(other.p, other.s);
                return q.x >= 400 && q.x <= 460 && q.y >= 150 && q.y <= 360;
            });
            if (jalanBBlocked) {
                limit = 0;
                if (car.s >= 725) { car.s = 725; car.v = 0; }
            }
        }

        // [B2] Prioritas Aup belok ke Panorama memotong lajur kanan Bdn2 (x=446)
        if (car.k === 'Aup' && car.s >= 910 && car.s <= 980) {
            const lane2Blocked = cars.some(other => {
                if (other === car) return false;
                if (other.k !== 'Bdn2') return false;
                const q = at(other.p, other.s);
                return q.y >= 400 && q.y <= 500 && Math.abs(q.x - 446) < 15;
            });
            if (lane2Blocked) {
                limit = 0;
                if (car.s >= 940) { car.s = 940; car.v = 0; }
            }
        }

        // [C] Prioritas U-Turn Bawah (Bu) -> Wajib mengalah ke Jalan A saat berbelok masuk
        // Menahan di s=610 (x≈339, aman di dalam median bukaan bawah, tidak menyenggol Jalan A)
        if (car.k === 'Bu' && car.s >= 580 && car.s <= 650) {
            const jalanABlocked = cars.some(other => {
                if (other === car || other.k === 'Bu') return false;
                const q = at(other.p, other.s);
                return q.x >= 260 && q.x <= 335 && q.y >= 430 && q.y <= 620;
            });
            if (jalanABlocked) {
                limit = 0;
                if (car.s >= 610) { car.s = 610; car.v = 0; }
            }
        }

        // [D] Prioritas Panorama keluar (Pin, Pupi, Pvit) -> Wajib mengalah jika Jalan B sedang melaju
        if ((car.k === 'Pin' || car.k === 'Pupi' || car.k === 'Pvit') && car.s >= 160 && car.s <= 240) {
            const jalanBBlocked = cars.some(other => {
                if (other === car) return false;
                if (!['Bdn', 'Bdn2', 'Bpan', 'Au', 'Aup'].includes(other.k)) return false;
                const q = at(other.p, other.s);
                return q.y >= 430 && q.y <= 620 && q.x >= 390 && q.x <= 465;
            });
            if (jalanBBlocked) {
                limit = 0;
                if (car.s >= 200) { car.s = 200; car.v = 0; }
            }
        }

        // =========================================================================
        // KEPATUHAN LAMPU MERAH & GARIS HENTI
        // =========================================================================
        car.p.stops.forEach(stop => {
            if (stop.s < front - 3) return;
            const distance = stop.s - front;
            if (!signals[stop.sig]) {
                limit = Math.min(limit, brake(distance));
                if (distance <= 0) {
                    car.s = Math.min(car.s, stop.s - LEN / 2);
                    car.v = 0;
                }
            }
        });

        // =========================================================================
        // CAR-FOLLOWING & ANTI-COLLISION ENGINE
        // =========================================================================
        let clearDistance = 999;

        cars.forEach(other => {
            if (other === car) return;
            const q = at(other.p, other.s);
            const dx = q.x - point.x;
            const dy = q.y - point.y;
            const f = dx * cosine + dy * sine;
            const l = Math.abs(-dx * sine + dy * cosine);
            const d = Math.hypot(dx, dy);

            const otherAngle = other.angle !== undefined ? other.angle : q.a;
            let diffA = otherAngle - car.angle;
            while (diffA < -Math.PI) diffA += 2 * Math.PI;
            while (diffA > Math.PI) diffA -= 2 * Math.PI;
            const alignCos = Math.cos(diffA);

            // KASUS 1: Berada di lintasan yang persis sama
            if (other.p === car.p) {
                const ds = other.s - car.s;
                if (ds > 0 && ds < 160) {
                    const freeGap = ds - SAFE_FOLLOW_DIST;
                    clearDistance = Math.min(clearDistance, brake(freeGap));
                    if (ds < SAFE_FOLLOW_DIST) {
                        car.s = other.s - SAFE_FOLLOW_DIST;
                        car.v = Math.min(car.v, Math.max(0, other.v));
                    }
                }
                return;
            }

            // KASUS 2: Mobil di lajur paralel berbeda (Jalan A atau Jalan B)
            // Jika arah hampir sama (alignCos > 0.65) dan jarak lateral >= 16px:
            // KEDUA MOBIL BERADA DI LAJUR BERBEDA! TIDAK SALING MENGGANGGU SAMA SEKALI!
            if (alignCos > 0.65 && l >= 16) {
                return;
            }

            // KASUS 2B: Mobil di lajur dua arah berlawanan (misal Jl. Panorama y=488 masuk vs y=530 keluar)
            // Jika arah berlawanan (alignCos < -0.5) dan jarak lateral >= 18px:
            // Mobil berpapasan aman di lajur berlawanan!
            if (alignCos < -0.5 && l >= 18) {
                return;
            }

            // KASUS 3: Berada di koridor lajur yang sama (meski beda objek path, misal Bdn & Bpan, atau setelah merge)
            if (alignCos > 0.65 && l < 16) {
                if (f > 0 && f < 160) {
                    const freeGap = f - SAFE_FOLLOW_DIST;
                    clearDistance = Math.min(clearDistance, brake(freeGap));
                    if (f < SAFE_FOLLOW_DIST) {
                        limit = 0;
                        car.v = 0;
                        car.s = Math.max(0, car.s - (SAFE_FOLLOW_DIST - f));
                    }
                }
                return;
            }

            // KASUS 3B: Ada mobil / halangan tepat di depan moncong kendaraan (f > 0 dan l < 22)
            // Terlepas dari prioritas jalan, kendaraan TIDAK BOLEH menabrak mobil yang ada di depannya!
            if (f > 0 && f < 140 && l < 22) {
                const freeGap = f - SAFE_FOLLOW_DIST;
                clearDistance = Math.min(clearDistance, brake(freeGap));
                if (f < SAFE_FOLLOW_DIST) {
                    limit = 0;
                    car.v = 0;
                    car.s = Math.max(0, car.s - (SAFE_FOLLOW_DIST - f));
                }
                return;
            }

            // KASUS 4: Persimpangan / Sudut Berpotongan / Menyeberang
            // Cek collision bubble untuk persilangan lintasan
            if (d < 52) {
                const isMainJalanB = (c, p) => (['Bdn', 'Bdn2'].includes(c.k) || (c.k === 'Bpan' && p.y <= 440) || (['Au', 'Aup'].includes(c.k) && p.y >= 330));
                const isMainJalanA = (c, p) => (['Astr', 'Astr2'].includes(c.k) || (['Avit', 'Au', 'Aup'].includes(c.k) && p.y >= 320) || (c.k === 'Bu' && p.y <= 420) || (c.k === 'VitA' && p.y <= 310));
                const isMainRoad = (c, p) => isMainJalanB(c, p) || isMainJalanA(c, p);

                const carMain = isMainRoad(car, point);
                const otherMain = isMainRoad(other, q);

                const carIsTurningPocket = ((car.k === 'Au' || car.k === 'Aup') && car.s < 800) ||
                                          (car.k === 'Bu' && car.s < 680) ||
                                          (car.k === 'VitA' && car.s < 260);
                const otherIsTurningPocket = ((other.k === 'Au' || other.k === 'Aup') && other.s < 800) ||
                                            (other.k === 'Bu' && other.s < 680) ||
                                            (other.k === 'VitA' && other.s < 260);

                let yieldToOther = false;
                if (carIsTurningPocket && !otherIsTurningPocket) {
                    yieldToOther = true;
                } else if (!carIsTurningPocket && otherIsTurningPocket) {
                    yieldToOther = false;
                } else if (!carMain && otherMain) {
                    yieldToOther = true;
                } else if (carMain && !otherMain) {
                    yieldToOther = false;
                } else {
                    if (f > 2) {
                        yieldToOther = true;
                    } else if (Math.abs(f) <= 2) {
                        yieldToOther = car.id > other.id;
                    }
                }

                if (yieldToOther) {
                    const safeDist = d - 44;
                    clearDistance = Math.min(clearDistance, safeDist > 0 ? brake(safeDist) : 0);
                    if (d < 44) {
                        limit = 0;
                        car.v = 0;
                    }
                }
            }
        });

        limit = Math.min(limit, clearDistance);

        // Integrasi kecepatan & posisi
        if (car.v < limit) {
            car.v = Math.min(limit, car.v + 130 * dt);
        } else {
            const decelRate = clearDistance < 15 ? 350 : 200;
            car.v = Math.max(limit, car.v - decelRate * dt);
        }
        car.s += car.v * dt;
    });

    cars = cars.filter(car => car.s < car.p.L);
}
`;

// Replace functions in jsCode
// We can locate "function isFree" to "function rr"
const startReplace = jsCode.indexOf('// isFree: pastikan jarak aman');
const endReplace = jsCode.indexOf('function rr(x, y, w, h, r)');

const updatedJsCode = jsCode.substring(0, startReplace) + replacementFunctions + jsCode.substring(endReplace);

const fullCode = updatedJsCode + `
globalThis.getCars = () => cars;
globalThis.simStep = step;
globalThis.simAt = at;
globalThis.simSignals = signals;
`;

const window = {
    AudioContext: function() {},
    webkitAudioContext: function() {},
    PanoramaSim: {}
};
const document = {
    getElementById: () => ({
        getContext: () => ({
            beginPath() {}, roundRect() {}, fill() {}, stroke() {},
            arc() {}, fillRect() {}, strokeRect() {}, save() {}, restore() {},
            translate() {}, rotate() {}, measureText: () => ({ width: 20 }),
            fillText() {}, setLineDash() {}, ellipse() {}, bezierCurveTo() {},
            drawImage() {}, createRadialGradient: () => ({ addColorStop() {} }), scale() {}
        }),
        querySelectorAll: () => [],
        classList: { toggle() {} },
        style: {}
    }),
    querySelectorAll: () => [],
    createElement: () => ({
        getContext: () => ({
            fillRect() {}, beginPath() {}, arc() {}, fill() {}, translate() {},
            scale() {}, createRadialGradient: () => ({ addColorStop() {} })
        }),
        width: 720, height: 900
    }),
    addEventListener: () => {}
};
const performance = { now: () => Date.now() };
let animFrameCallback = null;
function requestAnimationFrame(cb) { animFrameCallback = cb; }

const sandbox = {
    window, document, performance, requestAnimationFrame,
    console, Math, setTimeout, setInterval, clearTimeout, clearInterval
};
sandbox.globalThis = sandbox;
const vm = require('vm');
const context = vm.createContext(sandbox);

vm.runInContext(fullCode, context);

console.log("Simulating 6000 frames (dt = 0.05s, 300 seconds) with NEW LOGIC...");

let collisions = [];
let deadlocks = [];
let carStuckTime = {};

// Exact 2D Oriented Bounding Box (OBB) Intersection using Separating Axis Theorem
function checkOBBOverlap(c1, p1, c2, p2) {
    const a1 = c1.angle !== undefined ? c1.angle : p1.a;
    const a2 = c2.angle !== undefined ? c2.angle : p2.a;

    // Get 4 corners of car 1 (32 x 18)
    const getCorners = (p, a) => {
        const cos = Math.cos(a), sin = Math.sin(a);
        const hL = 16, hW = 9; // half length, half width
        return [
            { x: p.x + (-hL * cos - -hW * sin), y: p.y + (-hL * sin + -hW * cos) },
            { x: p.x + ( hL * cos - -hW * sin), y: p.y + ( hL * sin + -hW * cos) },
            { x: p.x + ( hL * cos -  hW * sin), y: p.y + ( hL * sin +  hW * cos) },
            { x: p.x + (-hL * cos -  hW * sin), y: p.y + (-hL * sin +  hW * cos) }
        ];
    };

    const poly1 = getCorners(p1, a1);
    const poly2 = getCorners(p2, a2);

    // SAT test on all 4 axes (2 from each box)
    const axes = [
        { x: Math.cos(a1), y: Math.sin(a1) },
        { x: -Math.sin(a1), y: Math.cos(a1) },
        { x: Math.cos(a2), y: Math.sin(a2) },
        { x: -Math.sin(a2), y: Math.cos(a2) }
    ];

    for (const axis of axes) {
        let min1 = Infinity, max1 = -Infinity;
        for (const pt of poly1) {
            const proj = pt.x * axis.x + pt.y * axis.y;
            min1 = Math.min(min1, proj); max1 = Math.max(max1, proj);
        }
        let min2 = Infinity, max2 = -Infinity;
        for (const pt of poly2) {
            const proj = pt.x * axis.x + pt.y * axis.y;
            min2 = Math.min(min2, proj); max2 = Math.max(max2, proj);
        }
        // Separation test: if no overlap on this axis, they do NOT intersect
        if (max1 < min2 || max2 < min1) return false;
    }
    return true; // Overlap on all axes -> true collision!
}

for (let frame = 0; frame < 6000; frame++) {
    context.simStep(0.05);

    const cars = context.getCars();
    for (let i = 0; i < cars.length; i++) {
        const c1 = cars[i];
        const p1 = context.simAt(c1.p, c1.s);
        
        if (c1.v < 1) {
            carStuckTime[c1.id] = (carStuckTime[c1.id] || 0) + 0.05;
            if (carStuckTime[c1.id] > 20) {
                const front = c1.s + 16;
                const waitingAtRed = c1.p.stops.some(stop => {
                    const dStop = stop.s - front;
                    return dStop >= -10 && dStop <= 45 && !context.simSignals[stop.sig];
                });
                if (!waitingAtRed) {
                    deadlocks.push({
                        frame,
                        time: (frame * 0.05).toFixed(1),
                        id: c1.id,
                        k: c1.k,
                        x: p1.x.toFixed(1),
                        y: p1.y.toFixed(1),
                        s: c1.s.toFixed(1),
                        stuck: carStuckTime[c1.id].toFixed(1)
                    });
                }
                carStuckTime[c1.id] = 0;
            }
        } else {
            carStuckTime[c1.id] = 0;
        }

        for (let j = i + 1; j < cars.length; j++) {
            const c2 = cars[j];
            const p2 = context.simAt(c2.p, c2.s);
            const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            
            // Quick reject circle test: 2 * R = 36.7px
            if (dist < 38) {
                if (checkOBBOverlap(c1, p1, c2, p2)) {
                    collisions.push({
                        frame,
                        time: (frame * 0.05).toFixed(1),
                        c1: { id: c1.id, k: c1.k, x: p1.x.toFixed(1), y: p1.y.toFixed(1), v: c1.v.toFixed(1) },
                        c2: { id: c2.id, k: c2.k, x: p2.x.toFixed(1), y: p2.y.toFixed(1), v: c2.v.toFixed(1) },
                        dist: dist.toFixed(1)
                    });
                }
            }
        }
    }
}

console.log("=== RESULTS WITH NEW LOGIC ===");
console.log("Total collision/overlap events:", collisions.length);
if (collisions.length > 0) {
    console.log("Sample collisions (first 5):", JSON.stringify(collisions.slice(0, 5), null, 2));
}
console.log("Total deadlock events (>25s stuck):", deadlocks.length);
if (deadlocks.length > 0) {
    console.log("Sample deadlocks:", JSON.stringify(deadlocks.slice(0, 5), null, 2));
}
