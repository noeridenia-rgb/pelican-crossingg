const fs = require('fs');

// Read video-deteksi.html to extract the simulation JS
const html = fs.readFileSync('video-deteksi.html', 'utf8');

// Extract script between <script src="ai-engine.js"></script> and </script>
const startToken = '<script src="ai-engine.js"></script>';
const endToken = '/* =========================================================================\n   BAGIAN 2: DETEKSI VIDEO CCTV';
const part1 = html.substring(html.indexOf(startToken), html.indexOf(endToken));
const jsCode = part1.substring(part1.indexOf('<script>') + 8);

// Mock browser objects
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

const fullCode = jsCode + `
globalThis.getCars = () => cars;
globalThis.simStep = step;
globalThis.simAt = at;
`;

// Run extracted JS in sandbox
const sandbox = {
    window, document, performance, requestAnimationFrame,
    console, Math, setTimeout, setInterval, clearTimeout, clearInterval
};
sandbox.globalThis = sandbox;
const vm = require('vm');
const context = vm.createContext(sandbox);

vm.runInContext(fullCode, context);

// Now simulate 10,000 steps (e.g. 500 seconds of real-time traffic)
console.log("Simulating 6000 frames (dt = 0.05s, 300 seconds)...");

let collisions = [];
let deadlocks = [];
let carStuckTime = {};

for (let frame = 0; frame < 6000; frame++) {
    context.simStep(0.05);

    const cars = context.getCars();
    // Check bounding box collisions between any pair of cars
    for (let i = 0; i < cars.length; i++) {
        const c1 = cars[i];
        const p1 = context.simAt(c1.p, c1.s);
        
        // Track stuck time
        if (c1.v < 1) {
            carStuckTime[c1.id] = (carStuckTime[c1.id] || 0) + 0.05;
            // Check if stuck at green light for > 15s
            if (carStuckTime[c1.id] > 20) {
                deadlocks.push({ frame, id: c1.id, k: c1.k, x: p1.x.toFixed(1), y: p1.y.toFixed(1), s: c1.s.toFixed(1), stuck: carStuckTime[c1.id].toFixed(1) });
                carStuckTime[c1.id] = 0; // log once every 20s
            }
        } else {
            carStuckTime[c1.id] = 0;
        }

        for (let j = i + 1; j < cars.length; j++) {
            const c2 = cars[j];
            const p2 = context.at(c2.p, c2.s);
            const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            
            // Physical bounding box overlap check:
            // Cars are 32 x 18.
            // If angle difference is small (parallel), lateral dist < 17 and longitudinal dist < 30 is overlapping!
            // In general, center-to-center dist < 24 px is ALWAYS an overlap regardless of angle!
            // And if dist < 30 and lateral distance is small, overlap!
            const diffA = Math.abs((c1.angle || p1.a) - (c2.angle || p2.a));
            const isParallel = Math.cos(diffA) > 0.7;
            
            // Check distance along c1 heading
            const cos1 = Math.cos(c1.angle || p1.a), sin1 = Math.sin(c1.angle || p1.a);
            const dx = p2.x - p1.x, dy = p2.y - p1.y;
            const f1 = Math.abs(dx * cos1 + dy * sin1);
            const l1 = Math.abs(-dx * sin1 + dy * cos1);

            let isOverlap = false;
            if (f1 < 30 && l1 < 17) {
                isOverlap = true;
            } else if (dist < 22) {
                isOverlap = true;
            }

            if (isOverlap) {
                collisions.push({
                    frame,
                    time: (frame * 0.05).toFixed(1),
                    c1: { id: c1.id, k: c1.k, x: p1.x.toFixed(1), y: p1.y.toFixed(1), v: c1.v.toFixed(1) },
                    c2: { id: c2.id, k: c2.k, x: p2.x.toFixed(1), y: p2.y.toFixed(1), v: c2.v.toFixed(1) },
                    dist: dist.toFixed(1), f: f1.toFixed(1), l: l1.toFixed(1)
                });
            }
        }
    }
}

console.log("Total collision/overlap events:", collisions.length);
if (collisions.length > 0) {
    console.log("Sample collisions (first 10):", JSON.stringify(collisions.slice(0, 10), null, 2));
}
console.log("Total deadlock events:", deadlocks.length);
if (deadlocks.length > 0) {
    console.log("Sample deadlocks:", JSON.stringify(deadlocks.slice(0, 10), null, 2));
}
