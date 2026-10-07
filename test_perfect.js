const fs = require('fs');

let html = fs.readFileSync('video-deteksi.html', 'utf8');
const startToken = '<script src="ai-engine.js"></script>';
const endToken = 'BAGIAN 2: DETEKSI VIDEO CCTV';
const endIdx = html.indexOf(endToken);
const commentStart = html.lastIndexOf('/*', endIdx);
const part1 = html.substring(html.indexOf(startToken), commentStart);
let jsCode = part1.substring(part1.indexOf('<script>') + 8);

// Add curveAup and fix paths.Aup and paths.Bpan
jsCode = jsCode.replace(
    'const curveBpan = bezierCurve([BX_R, 440], [BX_R, 470], [470, 488], [500, 488], 24);',
    'const curveBpan = bezierCurve([BX_R, 440], [BX_R, 470], [470, 488], [500, 488], 24);\nconst curveAup = bezierCurve([BX_L, 435], [BX_L, 468], [470, 488], [500, 488], 24);'
).replace(
    'Aup:   mk([[AX_R, 930], ...arcUAtas, ...curveBpan, [760, 488]]),',
    'Aup:   mk([[AX_R, 930], ...arcUAtas, [BX_L, 435], ...curveAup, [760, 488]]),'
).replace(
    `if (other.k !== 'Bdn2') return false;`,
    `if (!['Bdn2', 'Bpan'].includes(other.k)) return false;`
).replace(
    `        // [D] Prioritas Panorama keluar (Pin, Pupi, Pvit) -> Wajib mengalah jika Jalan B sedang melaju`,
    `        // [D1] Prioritas Pupi masuk Jalan A (x=314) -> Wajib mengalah ke Jalan A
        if (car.k === 'Pupi' && car.s >= 240 && car.s <= 330) {
            const jalanABlocked = cars.some(other => {
                if (other === car || other.k === 'Pupi') return false;
                const q = at(other.p, other.s);
                return q.x >= 280 && q.x <= 335 && q.y >= 440 && q.y <= 580;
            });
            if (jalanABlocked) {
                limit = 0;
                if (car.s >= 275) { car.s = 275; car.v = 0; }
            }
        }

        // [D] Prioritas Panorama keluar (Pin, Pupi, Pvit) -> Wajib mengalah jika Jalan B sedang melaju`
);

// Add non-penetration clamp to KASUS 3 and 3B in jsCode
jsCode = jsCode.replace(
    `            // KASUS 3: Berada di koridor lajur yang sama (meski beda objek path, misal Bdn & Bpan, atau setelah merge)
            if (alignCos > 0.65 && l < 16) {
                if (f > 0 && f < 160) {
                    const freeGap = f - SAFE_FOLLOW_DIST;
                    clearDistance = Math.min(clearDistance, brake(freeGap));
                    if (f < SAFE_FOLLOW_DIST) {
                        car.v = Math.min(car.v, Math.max(0, other.v));
                    }
                }
                return;
            }

            // KASUS 3B: Ada mobil / rintangan tepat di depan moncong kendaraan (f > 0 dan l < 22)
            // Terlepas dari prioritas jalan, kendaraan TIDAK BOLEH menabrak mobil yang ada di depannya!
            if (f > 0 && f < 140 && l < 22) {
                const freeGap = f - SAFE_FOLLOW_DIST;
                clearDistance = Math.min(clearDistance, brake(freeGap));
                if (f < SAFE_FOLLOW_DIST) {
                    limit = 0;
                    car.v = Math.min(car.v, Math.max(0, other.v));
                }
                return;
            }`,
    `            // KASUS 3: Berada di koridor lajur yang sama (meski beda objek path, misal Bdn & Bpan, atau setelah merge)
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

            // KASUS 3B: Ada mobil / rintangan tepat di depan moncong kendaraan (f > 0 dan l < 22)
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
            }`
);

const fullCode = jsCode + `
globalThis.getCars = () => cars;
globalThis.simStep = step;
globalThis.simAt = at;
globalThis.simSignals = signals;
`;

const window = { AudioContext: function() {}, webkitAudioContext: function() {}, PanoramaSim: {} };
const document = {
    getElementById: () => ({
        getContext: () => ({
            beginPath() {}, roundRect() {}, fill() {}, stroke() {}, arc() {}, fillRect() {}, strokeRect() {},
            save() {}, restore() {}, translate() {}, rotate() {}, measureText: () => ({ width: 20 }),
            fillText() {}, setLineDash() {}, ellipse() {}, bezierCurveTo() {}, drawImage() {},
            createRadialGradient: () => ({ addColorStop() {} }), scale() {}
        }),
        querySelectorAll: () => [], classList: { toggle() {} }, style: {}
    }),
    querySelectorAll: () => [],
    createElement: () => ({
        getContext: () => ({ fillRect() {}, beginPath() {}, arc() {}, fill() {}, translate() {}, scale() {}, createRadialGradient: () => ({ addColorStop() {} }) }),
        width: 720, height: 900
    }),
    addEventListener: () => {}
};
const performance = { now: () => Date.now() };
function requestAnimationFrame() {}

const sandbox = {
    window, document, performance, requestAnimationFrame,
    console: { log() {}, warn() {}, error() {} }, Math, setTimeout, setInterval, clearTimeout, clearInterval,
    onPedestrianCrossingComplete: () => {}
};
sandbox.globalThis = sandbox;
const vm = require('vm');
const context = vm.createContext(sandbox);

vm.runInContext(fullCode, context);

function checkOBBOverlap(c1, p1, c2, p2) {
    const a1 = c1.angle !== undefined ? c1.angle : p1.a;
    const a2 = c2.angle !== undefined ? c2.angle : p2.a;

    const getCorners = (p, a) => {
        const cos = Math.cos(a), sin = Math.sin(a);
        const hL = 16, hW = 9;
        return [
            { x: p.x + (-hL * cos - -hW * sin), y: p.y + (-hL * sin + -hW * cos) },
            { x: p.x + ( hL * cos - -hW * sin), y: p.y + ( hL * sin + -hW * cos) },
            { x: p.x + ( hL * cos -  hW * sin), y: p.y + ( hL * sin +  hW * cos) },
            { x: p.x + (-hL * cos -  hW * sin), y: p.y + (-hL * sin +  hW * cos) }
        ];
    };

    const poly1 = getCorners(p1, a1);
    const poly2 = getCorners(p2, a2);

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
        if (max1 < min2 || max2 < min1) return false;
    }
    return true;
}

console.log("Simulating 10,000 frames (500s of traffic)...");
let collisions = 0;
let samples = [];

for (let frame = 0; frame < 10000; frame++) {
    context.simStep(0.05);
    const cars = context.getCars();
    for (let i = 0; i < cars.length; i++) {
        const c1 = cars[i], p1 = context.simAt(c1.p, c1.s);
        for (let j = i + 1; j < cars.length; j++) {
            const c2 = cars[j], p2 = context.simAt(c2.p, c2.s);
            const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            if (dist < 38 && checkOBBOverlap(c1, p1, c2, p2)) {
                collisions++;
                if (samples.length < 5) {
                    samples.push({
                        frame,
                        c1: { id: c1.id, k: c1.k, x: p1.x.toFixed(1), y: p1.y.toFixed(1) },
                        c2: { id: c2.id, k: c2.k, x: p2.x.toFixed(1), y: p2.y.toFixed(1) },
                        dist: dist.toFixed(1)
                    });
                }
            }
        }
    }
}

console.log("Result: 10,000 frames simulated.");
console.log("Real Physical Overlaps:", collisions);
if (samples.length > 0) console.log("Samples:", JSON.stringify(samples, null, 2));
