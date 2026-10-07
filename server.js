const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const PORT = 8080;
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4'
};

const server = http.createServer((req, res) => {
    let safeUrl = decodeURIComponent(req.url.split('?')[0]);
    if (safeUrl === '/' || safeUrl === '') safeUrl = '/video-deteksi.html';
    const filePath = path.join(__dirname, safeUrl);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found: ' + safeUrl);
        return;
    }

    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const range = req.headers.range;

    if (range && ext === '.mp4') {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': (end - start) + 1,
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*'
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
        res.writeHead(200, {
            'Content-Length': stat.size,
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*'
        });
        fs.createReadStream(filePath).pipe(res);
    }
});

server.listen(PORT, '0.0.0.0', () => {
    const localUrl = `http://localhost:${PORT}/video-deteksi.html`;
    const nets = os.networkInterfaces();
    const networkIps = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                networkIps.push({ name, ip: net.address });
            }
        }
    }

    console.log(`\n========================================================`);
    console.log(`🚀 Server Simulasi Pelican Crossing Aktif!`);
    console.log(`--------------------------------------------------------`);
    console.log(`💻 Akses di Komputer ini (Localhost):`);
    console.log(`   ${localUrl}`);
    if (networkIps.length > 0) {
        console.log(`\n📱 Akses untuk Orang Lain (HP / Laptop di Wi-Fi yang sama):`);
        networkIps.forEach(net => {
            console.log(`   http://${net.ip}:${PORT}/video-deteksi.html  [Jaringan: ${net.name}]`);
        });
    }
    console.log(`--------------------------------------------------------`);
    console.log(`✨ Siap dibuka oleh perangkat lain di jaringan Wi-Fi yang sama.`);
    console.log(`Tekan Ctrl+C untuk menghentikan server.`);
    console.log(`========================================================\n`);

    // Otomatis buka di browser bawaan jika tidak ada flag --no-open
    if (!process.argv.includes('--no-open')) {
        const startCmd = process.platform === 'win32' ? `start ${localUrl}` : `open ${localUrl}`;
        exec(startCmd);
    }
});
