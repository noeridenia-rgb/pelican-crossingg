/* =============================================================
   AI ENGINE v1 — Smart Pelican Crossing
   Algoritma Gap-Acceptance dengan Skor Kepercayaan (Confidence Score)

   Ini SATU-SATUNYA tempat logika AI didefinisikan. Dipakai oleh:
     - simulasi.html      (simulasi visual, mobil bergerak otomatis)
     - ai-testbed.html    (pengujian & validasi algoritma, skenario acak)
     - video-deteksi.html (deteksi kendaraan dari video nyata)

   Kalau mau mengubah cara AI mengambil keputusan (mis. ganti rumus
   celah kritis, bobot confidence, dsb), CUKUP ubah file ini saja.
   Ketiga halaman otomatis memakai versi yang sama karena mereka
   memuatnya lewat:
       <script src="ai-engine.js"></script>
   ============================================================= */

const AIEngine = (function () {
  let latestSensorSnapshot = null;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function finiteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function variance(arr) {
    if (arr.length === 0) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  }

  function computeTrafficDensity(vehicles, observationLengthM = 20, avgSpeedMps = 0) {
    const lengthM = Math.max(1, Number(observationLengthM) || 20);
    const count = Array.isArray(vehicles) ? vehicles.length : 0;
    const vehiclesPer100m = (count * 100) / lengthM;
    const vehiclesPerKm = vehiclesPer100m * 10;
    
    let level = 'Renggang';
    if (vehiclesPer100m >= 35) level = 'Macet Kritis';
    else if (vehiclesPer100m >= 20) level = 'Padat';
    else if (vehiclesPer100m >= 8) level = 'Sedang';

    const spaceHeadway_m = count > 0 ? Number((lengthM / count).toFixed(2)) : Infinity;
    let spacingLevel = 'Bebas';
    if (count > 0) {
      if (spaceHeadway_m < 5) spacingLevel = 'Sangat Rapat';
      else if (spaceHeadway_m < 10) spacingLevel = 'Rapat';
      else if (spaceHeadway_m < 20) spacingLevel = 'Sedang';
      else spacingLevel = 'Longgar';
    }

    const speed = avgSpeedMps > 0 ? avgSpeedMps : 8.33;
    const timeHeadway_s = count > 0 && isFinite(spaceHeadway_m) ? Number((spaceHeadway_m / speed).toFixed(2)) : null;

    const breakdown = { cars: 0, motorcycles: 0, trucks: 0, others: 0, total: count };
    if (Array.isArray(vehicles)) {
      vehicles.forEach(v => {
        const cls = (v.class || v.type || v.category || '').toLowerCase();
        if (cls.includes('motor') || cls.includes('bike')) breakdown.motorcycles++;
        else if (cls.includes('truck') || cls.includes('bus') || cls.includes('truk')) breakdown.trucks++;
        else if (cls.includes('car') || cls.includes('mobil') || cls.includes('van') || cls.includes('suv')) breakdown.cars++;
        else breakdown.others++;
      });
    }

    return {
      count,
      observationLengthM: lengthM,
      vehiclesPer100m: Number(vehiclesPer100m.toFixed(2)),
      vehiclesPerKm: Number(vehiclesPerKm.toFixed(1)),
      level,
      spaceHeadway_m,
      spacingLevel,
      timeHeadway_s,
      breakdown
    };
  }

  function normalizeVehicle(vehicle, camera) {
    const distance = finiteNumber(vehicle.distance_m);
    const speed = finiteNumber(vehicle.speed_mps);
    return {
      ...vehicle,
      camera: vehicle.camera || camera,
      distance_m: distance,
      speed_mps: speed,
      speed_kmh: speed === null ? null : Number((speed * 3.6).toFixed(2)),
      arrivalTime_s: distance !== null && speed > 0 ? Number((distance / speed).toFixed(2)) : null
    };
  }

  function summarizeCamera(vehicles, calibrationM) {
    const approaching = vehicles.filter(vehicle => vehicle.distance_m > 0 && vehicle.speed_mps > 0 && vehicle.approaching !== false);
    const queued = vehicles.filter(vehicle => vehicle.observedSeconds >= 1.2 && vehicle.speed_mps !== null && vehicle.speed_mps <= 1.5);
    const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const averageSpeed = average(approaching.map(vehicle => vehicle.speed_mps));
    const averageDistance = average(approaching.map(vehicle => vehicle.distance_m));
    const averageArrival = average(approaching
      .filter(vehicle => vehicle.arrivalTime_s !== null)
      .map(vehicle => vehicle.arrivalTime_s));

    return {
      vehicleCount: vehicles.length,
      approachingCount: approaching.length,
      averageDistance_m: Number(averageDistance.toFixed(2)),
      averageSpeed_mps: Number(averageSpeed.toFixed(2)),
      averageSpeed_kmh: Number((averageSpeed * 3.6).toFixed(1)),
      averageArrivalTime_s: Number(averageArrival.toFixed(2)),
      trafficDensity: computeTrafficDensity(vehicles, calibrationM),
      queuedVehicleCount: queued.length,
      queueLength_m: queued.length ? Number(Math.max(...queued.map(vehicle => vehicle.distance_m || 0)).toFixed(2)) : 0
    };
  }

  function ingestSensorSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;

    const sourceCameras = snapshot.cameras && typeof snapshot.cameras === 'object' ? snapshot.cameras : {};
    let cameras = Object.fromEntries(Object.entries(sourceCameras).map(([camera, vehicles]) => [
      camera,
      Array.isArray(vehicles) ? vehicles.map(vehicle => normalizeVehicle(vehicle, camera)) : []
    ]));
    let vehicles = Object.values(cameras).flat();

    if (!vehicles.length && Array.isArray(snapshot.vehicles)) {
      vehicles = snapshot.vehicles.map(vehicle => normalizeVehicle(vehicle, vehicle.camera || 'A'));
      cameras = vehicles.reduce((byCamera, vehicle) => {
        (byCamera[vehicle.camera] ||= []).push(vehicle);
        return byCamera;
      }, Object.fromEntries(Object.keys(sourceCameras).map(camera => [camera, []])));
    }

    const cameraStatus = snapshot.cameraStatus && typeof snapshot.cameraStatus === 'object' ? { ...snapshot.cameraStatus } : {};
    const measuredVehicles = vehicles;
    const hasCameraStatus = Object.keys(cameraStatus).length > 0;
    const activeVehicles = hasCameraStatus
      ? measuredVehicles.filter(vehicle => cameraStatus[vehicle.camera]?.playing)
      : measuredVehicles;
    const sourceMetrics = snapshot.cameraMetrics && typeof snapshot.cameraMetrics === 'object' ? snapshot.cameraMetrics : {};
    const calibrationValues = snapshot.calibrations_m && typeof snapshot.calibrations_m === 'object' ? snapshot.calibrations_m : {};
    const cameraMetrics = Object.fromEntries(Object.entries(cameras).map(([camera, cameraVehicles]) => {
      const calibration = Math.max(1, finiteNumber(calibrationValues[camera] ?? sourceMetrics[camera]?.calibration_m) || 20);
      return [camera, {
        ...sourceMetrics[camera],
        active: cameraStatus[camera]?.playing ?? null,
        calibration_m: calibration,
        ...summarizeCamera(cameraVehicles, calibration)
      }];
    }));

    const observationLength = Math.max(1, finiteNumber(snapshot.observationLength_m) ||
      Object.values(cameraMetrics).reduce((total, metrics) => total + metrics.calibration_m, 0) || 20);
    const trafficDensity = computeTrafficDensity(activeVehicles, observationLength);
    const totalApproaching = activeVehicles.filter(vehicle => vehicle.distance_m > 0 && vehicle.speed_mps > 0 && vehicle.approaching !== false);
    const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const averageSpeed = average(totalApproaching.map(vehicle => vehicle.speed_mps));
    const averageDistance = average(totalApproaching.map(vehicle => vehicle.distance_m));
    const averageArrival = average(totalApproaching.map(vehicle => vehicle.arrivalTime_s).filter(value => value !== null));
    const refugeOccupancy = snapshot.refugeOccupancy && typeof snapshot.refugeOccupancy === 'object'
      ? { ...snapshot.refugeOccupancy, count: finiteNumber(snapshot.refugeOccupancy.count) }
      : { zoneConfigured: false, count: null, visualButtonCheck: 'zone-not-configured' };
    const pedestrians = Array.isArray(snapshot.pedestrians) ? snapshot.pedestrians.map((person, index) => ({
      ...person,
      id: person.id ?? index + 1,
      x: finiteNumber(person.x),
      y: finiteNumber(person.y),
      w: finiteNumber(person.w),
      h: finiteNumber(person.h),
      confidence: finiteNumber(person.confidence ?? person.score),
      inRefugeZone: Boolean(person.inRefugeZone)
    })) : [];
    const measurements = {
      vehicleCount: activeVehicles.length,
      measuredVehicleCount: measuredVehicles.length,
      approachingCount: totalApproaching.length,
      averageDistance_m: Number(averageDistance.toFixed(2)),
      averageSpeed_mps: Number(averageSpeed.toFixed(2)),
      averageSpeed_kmh: Number((averageSpeed * 3.6).toFixed(1)),
      averageArrivalTime_s: Number(averageArrival.toFixed(2)),
      trafficDensity,
      cameraMetrics,
      cameraStatus,
      refugeOccupancy,
      pedestrianCount: refugeOccupancy.count,
      pedestrians,
      signalControl: snapshot.signalControl && typeof snapshot.signalControl === 'object' ? { ...snapshot.signalControl } : {}
    };

    latestSensorSnapshot = {
      ...snapshot,
      dataVersion: 1,
      receivedAt: new Date().toISOString(),
      observationLength_m: observationLength,
      cameras,
      vehicles: activeVehicles,
      measuredVehicles,
      cameraMetrics,
      trafficDensity,
      pedestrians,
      refugeOccupancy,
      measurements
    };
    return getSensorSnapshot();
  }

  function getSensorSnapshot() {
    return latestSensorSnapshot ? JSON.parse(JSON.stringify(latestSensorSnapshot)) : null;
  }

  /**
   * Inti pengambilan keputusan AI: apakah celah lalu lintas cukup aman
   * untuk pejalan kaki menyeberang.
   *
  * @param {Array<{distance_m:number, speed_mps:number|null, approaching?:boolean|null}>} vehicles
   *        Hanya kendaraan yang MENDEKAT ke garis berhenti (distance>0, speed>0).
   * @param {{crossingWidth_m:number, pedSpeed_mps:number, marginSeconds:number}} params
   * @returns {{
   *   safe:boolean,
   *   nearestGap:number,
   *   criticalGap:number,
   *   confidence:number,
   *   reasoning:string[],
   *   arrivalTimes?:number[]
   * }}
   */
  function computeDecision(vehicles, params) {
    if (!Array.isArray(vehicles)) vehicles = latestSensorSnapshot ? latestSensorSnapshot.vehicles : [];
    const pedCrossTime = params.crossingWidth_m / params.pedSpeed_mps;
    const criticalGap = pedCrossTime + params.marginSeconds;

    if (params.requireActiveCameras && !Object.values(latestSensorSnapshot?.cameraStatus || {}).some(status => status?.playing)) {
      return {
        safe: false,
        nearestGap: Infinity,
        criticalGap,
        confidence: 0.05,
        reasoning: [
          `Celah kritis dibutuhkan: ${criticalGap.toFixed(1)} detik.`,
          'Tidak ada feed kamera aktif; keputusan celah ditahan sampai data sensor tersedia.'
        ],
        trafficDensity: computeTrafficDensity([], params.observationLength_m)
      };
    }

    const observedVehicles = vehicles.filter(v => v.distance_m > 0);
    const trafficDensity = computeTrafficDensity(observedVehicles, params.observationLength_m);
    const approaching = observedVehicles.filter(v => Number.isFinite(v.speed_mps) && v.speed_mps > 0 && v.approaching !== false);
    const uncertainVehicles = observedVehicles.filter(v => !Number.isFinite(v.speed_mps)).length;
    const reasoning = [];
    reasoning.push(
      `Celah kritis dibutuhkan: ${criticalGap.toFixed(1)} detik ` +
      `(waktu menyeberang ${pedCrossTime.toFixed(1)}s + margin ${params.marginSeconds.toFixed(1)}s)`
    );

    if (approaching.length === 0) {
      const noVehiclesDetected = observedVehicles.length === 0;
      reasoning.push(noVehiclesDetected
        ? 'Tidak ada kendaraan yang terdeteksi pada area pantau.'
        : uncertainVehicles > 0
          ? 'Kendaraan terdeteksi, tetapi kecepatannya belum terukur; penyeberangan ditahan.'
          : 'Kendaraan terdeteksi, tetapi tidak ada yang mendekati garis saat ini.');
      reasoning.push(`Kepadatan video: ${trafficDensity.vehiclesPer100m.toFixed(1)} kendaraan/100 m (${trafficDensity.level}).`);
      const safe = noVehiclesDetected || uncertainVehicles === 0;
      const confidence = noVehiclesDetected ? 0.95 : uncertainVehicles > 0 ? 0.15 : 0.85;
      return { safe, nearestGap: Infinity, criticalGap, confidence, reasoning, trafficDensity };
    }

    const arrivalTimes = approaching.map(v => v.distance_m / v.speed_mps);
    const nearestGap = Math.min(...arrivalTimes);
    const safe = nearestGap > criticalGap && uncertainVehicles === 0;

    reasoning.push(`Kendaraan terdekat diperkirakan tiba dalam ${nearestGap.toFixed(1)} detik.`);
    reasoning.push(`Kepadatan video: ${trafficDensity.vehiclesPer100m.toFixed(1)} kendaraan/100 m (${trafficDensity.level}).`);
    if (uncertainVehicles > 0) {
      reasoning.push(`${uncertainVehicles} kendaraan belum memiliki kecepatan mendekat yang valid; penyeberangan ditahan.`);
    }
    reasoning.push(
      safe
        ? `Karena ${nearestGap.toFixed(1)}s > ${criticalGap.toFixed(1)}s, celah dinilai CUKUP untuk penyeberang.`
        : `Karena ${nearestGap.toFixed(1)}s \u2264 ${criticalGap.toFixed(1)}s, celah dinilai BELUM cukup aman.`
    );

    // --- Skor kepercayaan (confidence score) dinamis ---
    let confidence = 0.5;
    if (safe) {
      const excessRatio = Math.min(1.0, (nearestGap - criticalGap) / criticalGap);
      confidence = 0.75 + excessRatio * 0.20;
    } else {
      const deficitRatio = Math.max(0.0, Math.min(1.0, nearestGap / criticalGap));
      confidence = 0.05 + deficitRatio * 0.20;
    }
    confidence = clamp(confidence, 0.05, 0.95);

    if (densityPenalty > 0.5) {
      reasoning.push(`Arus terdeteksi padat (${trafficDensity.vehiclesPer100m.toFixed(1)} kendaraan/100 m) \u2192 menurunkan keyakinan.`);
    }
    if (variancePenalty > 0.3) {
      reasoning.push('Variasi kecepatan antar kendaraan tinggi \u2192 prediksi kurang stabil.');
    }

    return { safe, nearestGap, criticalGap, confidence, reasoning, arrivalTimes, trafficDensity };
  }

  // API publik yang boleh dipanggil dari luar file ini
  return {
    computeDecision: computeDecision,
    computeTrafficDensity: computeTrafficDensity,
    ingestSensorSnapshot: ingestSensorSnapshot,
    getSensorSnapshot: getSensorSnapshot,
    clamp: clamp,
    variance: variance
  };

})();
