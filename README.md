# Smart Pelican Crossing & Simulasi Simpang Panorama (Revisi Duplikat)

Versi revisi ini menyederhanakan arsitektur proyek:
1. **Simulasi visual 1-lajur lama (`simulasi.html`) telah dihapus**.
2. **Simulasi Geometri Simpang Panorama** dan **Deteksi Video CCTV AI** digabungkan menjadi satu antarmuka terpadu di [`index.html`](file:///C:/Users/LENOVO/OneDrive/Documents/MSTR2/pelican-crossing-dev/index.html).
3. **Logika AI** tetap terpusat di satu sumber kebenaran tunggal ([`ai-engine.js`](file:///C:/Users/LENOVO/OneDrive/Documents/MSTR2/pelican-crossing-dev/ai-engine.js)).

```
pelican-crossing-dev/
├── ai-engine.js            <- SATU-SATUNYA logika AI (Gap-Acceptance + Confidence Score)
├── index.html              <- PUSAT TERPADU: Simulasi Simpang Panorama + Deteksi Video CCTV & AI
├── video-deteksi.html      <- Sinkron dengan index.html
├── ai-testbed.html         <- Alat uji & validasi algoritma massal (100x test & Confusion Matrix)
├── Simulasi Lalu Lintas Panorama.html <- Referensi simulasi geometris terisolasi
└── assets/                 <- Rekaman video CCTV nyata (traffic-video-web.mp4, CCTV Pelindung, dll.)
```

---

## Fitur Antarmuka Terpadu (`index.html`)

1. **Panel Kiri: Simulasi Geometris Simpang Panorama (UPI - Setiabudi Bandung)**
   - Canvas 2D resolusi tinggi mereplikasi persimpangan Jl. Dr. Setiabudi, bukaan U-turn, dan mulut Jl. Panorama.
   - Mengendalikan 3 fase sinyal utama (Arteri Setiabudi, Arus Panorama, dan Fase 3 Pelican Crossing 14 detik) serta fase prioritas antrean Jalan B.
   - Tombol interaktif **Minta Menyeberang (Push Button)** yang langsung mengevaluasi celah aman via AI Engine.
   - Kontrol kecepatan (1x, 3x, 6x), mode siang/malam, audio penyeberang, dan reset simulasi.

2. **Panel Kanan: Pusat Deteksi Video CCTV & AI Gap-Acceptance**
   - **Kartu Keputusan AI:** Menampilkan status celah aman/tahan, skor keyakinan (Confidence Gauge %), $T_{\text{crit}}$ vs $T_{\text{gap}}$, kepadatan arus, serta penalaran logis (*AI reasoning log*).
   - **Pemantau Kamera CCTV:** Mendukung multi-kamera (Kamera 1 Zebra Cross Jalan A, Kamera 2 Arus Panorama, Kamera 3 Jalan B) dengan pemilih preset video cepat (`traffic-video-web.mp4`, CCTV Pelindung Bandung, atau upload file sendiri).
   - **Deteksi Objek:** Detektor ganda menggunakan TensorFlow.js COCO-SSD (Deep Learning) dengan *fallback* otomatis ke Motion Differencing ringan.
   - **Alat Kalibrasi:** Penanda Garis Henti (*Stop Line*), penanda Zona Tunggu (*Refuge Zone*), dan pengatur jarak jangkau kamera.
   - **Telemetri Real-time:** Menghitung jumlah objek terlacak, kendaraan mendekat, kecepatan rata-rata (km/jam), jarak rata-rata, dan estimasi waktu tiba (ETA).

---

## Cara Menjalankan

Buka browser di:
- **Dashboard Utama:** [http://localhost:8080/](http://localhost:8080/) atau [http://localhost:8080/index.html](http://localhost:8080/index.html)
- **AI Testbed:** [http://localhost:8080/ai-testbed.html](http://localhost:8080/ai-testbed.html)
