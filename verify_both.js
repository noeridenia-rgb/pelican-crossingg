const fs = require('fs');

function testHtmlFile(filename) {
    const html = fs.readFileSync(filename, 'utf8');
    const startToken = '<script src="ai-engine.js"></script>';
    const endToken = 'BAGIAN 2: DETEKSI VIDEO CCTV';
    const endIdx = html.indexOf(endToken);
    const commentStart = html.lastIndexOf('/*', endIdx);
    const part1 = html.substring(html.indexOf(startToken), commentStart);
    const jsCode = part1.substring(part1.indexOf('<script>') + 8);

    const fullCode = jsCode + `
    globalThis.getCars = () => cars;
    globalThis.simStep = step;
    globalThis.simAt = at;
    globalThis.simSignals = signals;
    `;

    const window = {
        AudioContext: function() {},
        webkitAudioContext: function() {},
        PanoramaSim: {},
        addEventListener: () => {}
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
        querySelector: () => ({ clientWidth: 800, clientHeight: 700 }),
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

    let collisions = 0;
    let sampleCollisions = [];
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
                    if (sampleCollisions.length < 5) {
                        sampleCollisions.push({
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
    console.log(`[${filename}] 5000 frames simulated. Real Collisions/Overlaps: ${collisions}`);
    if (sampleCollisions.length > 0) {
        console.log("Samples:", JSON.stringify(sampleCollisions, null, 2));
    }
}

testHtmlFile('video-deteksi.html');
testHtmlFile('index.html');
