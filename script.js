/**
 * FISHCAST - Static Fishing Weather & Bite Forecast Application
 * Uses Open-Meteo Forecast, Geocoding, and Marine APIs with zero backend required.
 */

const CONFIG = {
  forecastUrl: "https://api.open-meteo.com/v1/forecast",
  geocodingUrl: "https://geocoding-api.open-meteo.com/v1/search",
  marineUrl: "https://marine-api.open-meteo.com/v1/marine",
  defaultLocation: {
    name: "Cebu City, Philippines",
    latitude: 10.3157,
    longitude: 123.8854
  }
};

const state = {
  location: { ...CONFIG.defaultLocation },
  weather: null,
  marine: null,
  activeChartTab: "tempWind",
  chartInstance: null,
  searchTimer: null
};

const els = {
  navToggle: document.getElementById("navToggle"),
  mainNav: document.getElementById("mainNav"),
  locateBtn: document.getElementById("locateBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  refreshIcon: document.getElementById("refreshIcon"),
  searchForm: document.getElementById("searchForm"),
  locationInput: document.getElementById("locationInput"),
  searchResults: document.getElementById("searchResults"),
  presetChips: document.getElementById("presetChips"),

  statusBanner: document.getElementById("statusBanner"),
  statusSpinner: document.getElementById("statusSpinner"),
  statusMessage: document.getElementById("statusMessage"),
  dismissBannerBtn: document.getElementById("dismissBannerBtn"),

  locationTitle: document.getElementById("locationTitle"),
  locationCoords: document.getElementById("locationCoords"),
  conditionPill: document.getElementById("conditionPill"),
  conditionEmoji: document.getElementById("conditionEmoji"),
  conditionText: document.getElementById("conditionText"),
  currentTemp: document.getElementById("currentTemp"),
  feelsLikeTemp: document.getElementById("feelsLikeTemp"),
  currentPrecip: document.getElementById("currentPrecip"),

  scoreRing: document.getElementById("scoreRing"),
  fishingScore: document.getElementById("fishingScore"),
  scoreRating: document.getElementById("scoreRating"),
  scoreSummary: document.getElementById("scoreSummary"),
  recommendedWindows: document.getElementById("recommendedWindows"),

  windSpeed: document.getElementById("windSpeed"),
  windArrow: document.getElementById("windArrow"),
  windDirectionText: document.getElementById("windDirectionText"),
  windGusts: document.getElementById("windGusts"),
  humidityVal: document.getElementById("humidityVal"),
  humidityNote: document.getElementById("humidityNote"),
  pressureVal: document.getElementById("pressureVal"),
  pressureTrend: document.getElementById("pressureTrend"),
  sunriseTime: document.getElementById("sunriseTime"),
  sunsetTime: document.getElementById("sunsetTime"),
  daylightDuration: document.getElementById("daylightDuration"),

  forecastChart: document.getElementById("forecastChart"),
  hourlyGrid: document.getElementById("hourlyGrid"),
  weeklyList: document.getElementById("weeklyList"),

  moonPhaseBadge: document.getElementById("moonPhaseBadge"),
  moonShadow: document.getElementById("moonShadow"),
  moonPhaseName: document.getElementById("moonPhaseName"),
  moonIllumination: document.getElementById("moonIllumination"),
  moonAge: document.getElementById("moonAge"),
  moonFishingTip: document.getElementById("moonFishingTip"),

  tideStatusBadge: document.getElementById("tideStatusBadge"),
  tideBody: document.getElementById("tideBody"),
  tideSeries: document.getElementById("tideSeries")
};

/* ---------------- Weather Code Mapping ---------------- */
const WMO_CODES = {
  0: ["Clear Sky", "☀️"],
  1: ["Mostly Clear", "🌤️"],
  2: ["Partly Cloudy", "⛅"],
  3: ["Overcast", "☁️"],
  45: ["Foggy", "🌫️"],
  48: ["Rime Fog", "🌫️"],
  51: ["Light Drizzle", "🌦️"],
  53: ["Moderate Drizzle", "🌦️"],
  55: ["Dense Drizzle", "🌧️"],
  61: ["Light Rain", "🌧️"],
  63: ["Moderate Rain", "🌧️"],
  65: ["Heavy Rain", "⛈️"],
  71: ["Light Snow", "🌨️"],
  73: ["Moderate Snow", "🌨️"],
  75: ["Heavy Snow", "❄️"],
  80: ["Rain Showers", "🌦️"],
  81: ["Moderate Showers", "🌧️"],
  82: ["Violent Showers", "⛈️"],
  95: ["Thunderstorm", "⛈️"],
  96: ["Thunderstorm & Hail", "⛈️"],
  99: ["Severe Hail Storm", "⛈️"]
};

function getWeatherInfo(code) {
  return WMO_CODES[code] || ["Variable Conditions", "🌊"];
}

/* ---------------- UI Status Helpers ---------------- */
function setStatus(message, { loading = false, error = false } = {}) {
  els.statusBanner.classList.remove("hidden");
  els.statusBanner.classList.toggle("error", error);
  els.statusSpinner.classList.toggle("hidden", !loading);
  els.dismissBannerBtn.classList.toggle("hidden", loading);
  els.statusMessage.textContent = message;
}

function clearStatus() {
  els.statusBanner.classList.add("hidden");
  els.statusBanner.classList.remove("error");
}

function setRefreshing(active) {
  els.refreshIcon.classList.toggle("spinning", active);
  els.refreshBtn.disabled = active;
}

/* ---------------- Formatting Helpers ---------------- */
function degreesToCardinal(deg) {
  if (typeof deg !== "number" || Number.isNaN(deg)) return "N/A";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const idx = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return dirs[idx];
}

function formatTimeShort(isoStr) {
  if (!isoStr) return "--:--";
  const d = new Date(isoStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatHourLabel(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleTimeString([], { hour: "numeric" });
}

function formatDayLabel(isoDateStr, index) {
  const d = new Date(`${isoDateStr}T12:00:00`);
  const dayName = index === 0 ? "Today" : index === 1 ? "Tomorrow" : d.toLocaleDateString([], { weekday: "short" });
  const dateLabel = d.toLocaleDateString([], { month: "short", day: "numeric" });
  return { dayName, dateLabel };
}

/* ---------------- Fishing Activity Score (0-100) ---------------- */
function calculateFishingScore({ tempC, windKmh, pressureHpa, precipMm, humidity, hour }) {
  let score = 65;
  const reasons = [];

  // 1. Wind impact (ideal: 5-18 km/h; harsh > 32 km/h)
  if (windKmh <= 5) {
    score += 6;
    reasons.push("glassy/light wind");
  } else if (windKmh <= 18) {
    score += 12;
    reasons.push("fishable breeze");
  } else if (windKmh <= 28) {
    score -= 8;
    reasons.push("choppy wind");
  } else {
    score -= 22;
    reasons.push("strong wind");
  }

  // 2. Pressure impact (sweet spot around 1010-1022 hPa)
  if (pressureHpa >= 1010 && pressureHpa <= 1022) {
    score += 10;
    reasons.push("favorable barometer");
  } else if (pressureHpa >= 1002 && pressureHpa <= 1028) {
    score += 4;
  } else {
    score -= 8;
    reasons.push("shifted pressure");
  }

  // 3. Temperature impact (sweet spot 15-28°C)
  if (tempC >= 16 && tempC <= 28) {
    score += 8;
  } else if (tempC < 6 || tempC > 35) {
    score -= 10;
  }

  // 4. Precipitation impact
  if (precipMm > 4) {
    score -= 16;
    reasons.push("heavy rain");
  } else if (precipMm > 0.5) {
    score -= 6;
    reasons.push("light rain");
  } else if (humidity >= 55 && humidity <= 88) {
    score += 4;
  }

  // 5. Dawn / Dusk feeding window bonus
  if ((hour >= 5 && hour <= 8) || (hour >= 17 && hour <= 20)) {
    score += 7;
    reasons.push("prime dawn/dusk window");
  }

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: clamped,
    summary: reasons.slice(0, 2).join(" · ") || "steady conditions"
  };
}

function getScoreRating(score) {
  if (score >= 82) return { label: "Prime Bite Conditions", color: "#2dd4bf" };
  if (score >= 65) return { label: "Good Fishing Activity", color: "#34d399" };
  if (score >= 45) return { label: "Fair / Selective Bite", color: "#f59e0b" };
  return { label: "Tough / Low Activity", color: "#fb7185" };
}

/* ---------------- Moon Phase Calculation ---------------- */
function computeMoonPhase(date = new Date()) {
  // Known new moon reference: Jan 6, 2000 18:14 UTC
  const synodicMonth = 29.53058867;
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14, 0);
  const daysSince = (date.getTime() - knownNewMoon) / 86400000;
  const age = ((daysSince % synodicMonth) + synodicMonth) % synodicMonth;
  const phaseFraction = age / synodicMonth; // 0..1

  // Illumination approximation
  const illumination = Math.round(((1 - Math.cos(2 * Math.PI * phaseFraction)) / 2) * 100);

  let name = "New Moon";
  let tip = "Dark nights boost low-light predator movement; high-tide dawn/dusk edges shine.";
  if (phaseFraction < 0.04 || phaseFraction >= 0.96) {
    name = "New Moon";
    tip = "Strong tidal swings and dark skies; target moving water and structure.";
  } else if (phaseFraction < 0.21) {
    name = "Waxing Crescent";
    tip = "Building lunar light and increasing tides; steady morning/evening bite.";
  } else if (phaseFraction < 0.29) {
    name = "First Quarter";
    tip = "Moderate tides; work current seams, points, and drop-offs.";
  } else if (phaseFraction < 0.46) {
    name = "Waxing Gibbous";
    tip = "Brighter evenings; fish feed actively around dusk and early night.";
  } else if (phaseFraction < 0.54) {
    name = "Full Moon";
    tip = "Strong spring tides and bright nights; midday shade and current lines are key.";
  } else if (phaseFraction < 0.71) {
    name = "Waning Gibbous";
    tip = "Post-full-moon current push; focus on dawn transitions and channel edges.";
  } else if (phaseFraction < 0.79) {
    name = "Last Quarter";
    tip = "Balanced lunar pull; reliable daytime casting around cover.";
  } else {
    name = "Waning Crescent";
    tip = "Gentle tides; stealthy presentations in clear or shallow water pay off.";
  }

  return {
    name,
    illumination,
    age: age.toFixed(1),
    phaseFraction,
    tip
  };
}

function renderMoonPhase() {
  const moon = computeMoonPhase(new Date());
  els.moonPhaseBadge.textContent = moon.name;
  els.moonPhaseName.textContent = moon.name;
  els.moonIllumination.textContent = `${moon.illumination}%`;
  els.moonAge.textContent = `${moon.age} days`;
  els.moonFishingTip.textContent = moon.tip;

  // Visual shadow positioning on lunar disc
  const pct = moon.illumination;
  if (moon.phaseFraction < 0.5) {
    // Waxing: shadow recedes from left
    const shift = Math.round((pct / 100) * 100);
    els.moonShadow.style.transform = `translateX(${shift}%)`;
  } else {
    // Waning: shadow covers from left
    const cover = Math.round(((100 - pct) / 100) * 100);
    els.moonShadow.style.transform = `translateX(${-100 + cover}%)`;
  }
}

/* ---------------- API Fetching ---------------- */
async function fetchWeatherAndMarine(lat, lon) {
  const weatherParams = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "precipitation",
      "weather_code",
      "surface_pressure",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m"
    ].join(","),
    hourly: [
      "temperature_2m",
      "relative_humidity_2m",
      "precipitation",
      "weather_code",
      "surface_pressure",
      "wind_speed_10m"
    ].join(","),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "precipitation_probability_max",
      "wind_speed_10m_max",
      "sunrise",
      "sunset"
    ].join(","),
    timezone: "auto",
    forecast_days: "7"
  });

  const marineParams = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: ["sea_level_height_msl", "wave_height", "wave_period"].join(","),
    timezone: "auto",
    forecast_days: "2"
  });

  const weatherPromise = fetch(`${CONFIG.forecastUrl}?${weatherParams.toString()}`).then(async (res) => {
    if (!res.ok) throw new Error(`Weather API error (${res.status})`);
    return res.json();
  });

  const marinePromise = fetch(`${CONFIG.marineUrl}?${marineParams.toString()}`)
    .then(async (res) => {
      if (!res.ok) return null;
      return res.json();
    })
    .catch(() => null);

  const [weatherData, marineData] = await Promise.all([weatherPromise, marinePromise]);
  return { weatherData, marineData };
}

async function searchLocations(query) {
  const params = new URLSearchParams({
    name: query,
    count: "6",
    language: "en",
    format: "json"
  });
  const res = await fetch(`${CONFIG.geocodingUrl}?${params.toString()}`);
  if (!res.ok) throw new Error(`Geocoding error (${res.status})`);
  const data = await res.json();
  return data.results || [];
}

/* ---------------- Rendering ---------------- */
function renderAll() {
  if (!state.weather) return;
  const w = state.weather;
  const cur = w.current;
  const [condText, condEmoji] = getWeatherInfo(cur.weather_code);
  const nowHour = new Date(cur.time).getHours();

  // Location & header
  els.locationTitle.textContent = state.location.name;
  els.locationCoords.textContent =
    `Lat ${Number(state.location.latitude).toFixed(3)} · Lon ${Number(state.location.longitude).toFixed(3)} · Updated ${formatTimeShort(cur.time)}`;
  els.conditionEmoji.textContent = condEmoji;
  els.conditionText.textContent = condText;

  // Current metrics
  els.currentTemp.textContent = `${Math.round(cur.temperature_2m)}°C`;
  els.feelsLikeTemp.textContent = `${Math.round(cur.apparent_temperature)}°C`;
  els.currentPrecip.textContent = `${Number(cur.precipitation).toFixed(1)} mm`;

  els.windSpeed.textContent = `${Math.round(cur.wind_speed_10m)} km/h`;
  const cardDir = degreesToCardinal(cur.wind_direction_10m);
  els.windDirectionText.textContent = `${cardDir} (${Math.round(cur.wind_direction_10m)}°)`;
  els.windArrow.style.transform = `rotate(${(cur.wind_direction_10m + 180) % 360}deg)`;
  els.windGusts.textContent = `${Math.round(cur.wind_gusts_10m)} km/h`;

  els.humidityVal.textContent = `${Math.round(cur.relative_humidity_2m)}%`;
  els.humidityNote.textContent =
    cur.relative_humidity_2m > 80 ? "High moisture / coastal mist" : "Balanced air moisture";

  const press = Math.round(cur.surface_pressure);
  els.pressureVal.textContent = `${press} hPa`;
  const futurePress = w.hourly?.surface_pressure?.[6];
  if (typeof futurePress === "number") {
    const diff = futurePress - cur.surface_pressure;
    if (diff > 1.5) els.pressureTrend.textContent = `Rising (+${diff.toFixed(1)} hPa over 6h)`;
    else if (diff < -1.5) els.pressureTrend.textContent = `Falling (${diff.toFixed(1)} hPa over 6h)`;
    else els.pressureTrend.textContent = "Steady barometric pressure";
  }

  // Sunrise / Sunset
  const todaySunrise = w.daily?.sunrise?.[0];
  const todaySunset = w.daily?.sunset?.[0];
  els.sunriseTime.textContent = formatTimeShort(todaySunrise);
  els.sunsetTime.textContent = formatTimeShort(todaySunset);
  if (todaySunrise && todaySunset) {
    const diffMins = Math.max(0, Math.round((new Date(todaySunset) - new Date(todaySunrise)) / 60000));
    const hrs = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    els.daylightDuration.textContent = `Daylight ${hrs}h ${mins}m`;
  }

  // Fishing Score
  const bite = calculateFishingScore({
    tempC: cur.temperature_2m,
    windKmh: cur.wind_speed_10m,
    pressureHpa: cur.surface_pressure,
    precipMm: cur.precipitation,
    humidity: cur.relative_humidity_2m,
    hour: nowHour
  });
  const rating = getScoreRating(bite.score);
  els.fishingScore.textContent = String(bite.score);
  els.scoreRating.textContent = rating.label;
  els.scoreRating.style.color = rating.color;
  els.scoreSummary.textContent = bite.summary.charAt(0).toUpperCase() + bite.summary.slice(1);
  els.scoreRing.style.setProperty("--score", bite.score);
  els.scoreRing.style.setProperty("--ring-color", rating.color);

  renderHourlyAndWindows();
  renderWeekly();
  renderMoonPhase();
  renderTideMarine();
  renderChart();
}

function getHourlyScoredSeries() {
  const h = state.weather.hourly;
  const nowMs = Date.now() - 3600 * 1000;
  const items = [];

  for (let i = 0; i < h.time.length && items.length < 24; i++) {
    const tMs = new Date(h.time[i]).getTime();
    if (tMs >= nowMs) {
      const hourNum = new Date(h.time[i]).getHours();
      const scoreObj = calculateFishingScore({
        tempC: h.temperature_2m[i],
        windKmh: h.wind_speed_10m[i],
        pressureHpa: h.surface_pressure[i],
        precipMm: h.precipitation[i],
        humidity: h.relative_humidity_2m[i],
        hour: hourNum
      });
      items.push({
        time: h.time[i],
        hourLabel: formatHourLabel(h.time[i]),
        tempC: h.temperature_2m[i],
        windKmh: h.wind_speed_10m[i],
        pressureHpa: h.surface_pressure[i],
        precipMm: h.precipitation[i],
        humidity: h.relative_humidity_2m[i],
        weatherCode: h.weather_code[i],
        score: scoreObj.score
      });
    }
  }
  return items;
}

function renderHourlyAndWindows() {
  const series = getHourlyScoredSeries();

  // Top 3 non-overlapping recommended windows
  const sorted = [...series].sort((a, b) => b.score - a.score);
  const picks = [];
  for (const cand of sorted) {
    const tooClose = picks.some((p) => Math.abs(new Date(p.time) - new Date(cand.time)) < 3 * 3600 * 1000);
    if (!tooClose) picks.push(cand);
    if (picks.length === 3) break;
  }
  picks.sort((a, b) => new Date(a.time) - new Date(b.time));

  els.recommendedWindows.innerHTML = picks
    .map(
      (slot) => `
      <div class="window-slot">
        <div class="window-time">${slot.hourLabel} Window</div>
        <div class="window-meta">
          <span>Score: <strong>${slot.score}/100</strong></span>
          <span>Wind ${Math.round(slot.windKmh)} km/h</span>
        </div>
      </div>
    `
    )
    .join("");

  // Hourly cards
  els.hourlyGrid.innerHTML = series
    .map((item) => {
      const [, emoji] = getWeatherInfo(item.weatherCode);
      return `
        <div class="hour-card">
          <div class="hour-time">${item.hourLabel}</div>
          <div class="hour-icon" aria-hidden="true">${emoji}</div>
          <div class="hour-temp">${Math.round(item.tempC)}°C</div>
          <div class="hour-wind">${Math.round(item.windKmh)} km/h</div>
          <div class="hour-score">Bite ${item.score}</div>
        </div>
      `;
    })
    .join("");
}

function renderWeekly() {
  const d = state.weather.daily;
  const minAll = Math.min(...d.temperature_2m_min);
  const maxAll = Math.max(...d.temperature_2m_max);
  const span = Math.max(1, maxAll - minAll);

  els.weeklyList.innerHTML = d.time
    .map((dateStr, idx) => {
      const { dayName, dateLabel } = formatDayLabel(dateStr, idx);
      const [, emoji] = getWeatherInfo(d.weather_code[idx]);
      const low = Math.round(d.temperature_2m_min[idx]);
      const high = Math.round(d.temperature_2m_max[idx]);
      const maxWind = Math.round(d.wind_speed_10m_max[idx]);
      const precipSum = d.precipitation_sum[idx] || 0;
      const avgTemp = (d.temperature_2m_max[idx] + d.temperature_2m_min[idx]) / 2;

      const dayBite = calculateFishingScore({
        tempC: avgTemp,
        windKmh: maxWind * 0.75,
        pressureHpa: state.weather.current.surface_pressure,
        precipMm: precipSum,
        humidity: state.weather.current.relative_humidity_2m,
        hour: 7
      });

      const leftPct = ((d.temperature_2m_min[idx] - minAll) / span) * 100;
      const widthPct = Math.max(12, ((d.temperature_2m_max[idx] - d.temperature_2m_min[idx]) / span) * 100);

      return `
        <div class="day-row">
          <div>
            <span class="day-name">${dayName}</span>
            <span class="day-date">${dateLabel}</span>
          </div>
          <div class="day-cond">
            <span aria-hidden="true">${emoji}</span>
            <span>${precipSum > 0 ? `${precipSum.toFixed(1)}mm` : "Dry"}</span>
          </div>
          <div class="temp-range-bar">
            <span>${low}°</span>
            <div class="range-track">
              <div class="range-fill" style="margin-left: ${leftPct}%; width: ${widthPct}%;"></div>
            </div>
            <span>${high}°</span>
          </div>
          <div class="day-wind">Wind ≤ ${maxWind} km/h</div>
          <div class="day-score-badge">Score ${dayBite.score}</div>
        </div>
      `;
    })
    .join("");
}

function renderTideMarine() {
  const m = state.marine;
  const seaLevelSeries = m?.hourly?.sea_level_height_msl;
  const waveSeries = m?.hourly?.wave_height;
  const times = m?.hourly?.time;

  const hasSeaLevel = Array.isArray(seaLevelSeries) && seaLevelSeries.some((v) => typeof v === "number" && !Number.isNaN(v));
  const hasWave = Array.isArray(waveSeries) && waveSeries.some((v) => typeof v === "number" && !Number.isNaN(v));

  if (!hasSeaLevel && !hasWave) {
    els.tideStatusBadge.textContent = "Inland / No Tide Feed";
    els.tideBody.innerHTML = `
      <p class="muted-copy">
        No coastal sea-level or marine wave feed is available for these coordinates (common for inland lakes or rivers).
        Rely on barometric pressure trends, wind direction, and dawn/dusk windows above.
      </p>
    `;
    els.tideSeries.innerHTML = "";
    return;
  }

  els.tideStatusBadge.textContent = hasSeaLevel ? "Open-Meteo Marine Active" : "Wave Telemetry Active";

  const startIdx = Math.max(
    0,
    times.findIndex((t) => new Date(t).getTime() >= Date.now() - 3600 * 1000)
  );
  const slices = [];
  for (let i = startIdx; i < times.length && slices.length < 6; i += 3) {
    slices.push({
      time: formatHourLabel(times[i]),
      seaLevel: typeof seaLevelSeries?.[i] === "number" ? `${seaLevelSeries[i].toFixed(2)} m` : null,
      wave: typeof waveSeries?.[i] === "number" ? `${waveSeries[i].toFixed(1)} m wave` : null
    });
  }

  // Detect simple rising/falling sea level trend
  let trendText = "Marine telemetry available for upcoming hours.";
  if (hasSeaLevel && slices.length >= 2) {
    const firstVal = seaLevelSeries[startIdx];
    const nextVal = seaLevelSeries[Math.min(seaLevelSeries.length - 1, startIdx + 3)];
    if (typeof firstVal === "number" && typeof nextVal === "number") {
      if (nextVal > firstVal + 0.03) trendText = "Sea level / tide height is rising over the next few hours.";
      else if (nextVal < firstVal - 0.03) trendText = "Sea level / tide height is receding over the next few hours.";
      else trendText = "Sea level / tide height is relatively steady.";
    }
  }

  els.tideBody.innerHTML = `<p class="muted-copy">${trendText}</p>`;
  els.tideSeries.innerHTML = slices
    .map(
      (s) => `
      <div class="tide-slot">
        <div class="tide-slot-time">${s.time}</div>
        <div class="tide-slot-val">${s.seaLevel || s.wave || "--"}</div>
      </div>
    `
    )
    .join("");
}

/* ---------------- Interactive Chart ---------------- */
function renderChart() {
  if (!state.weather || typeof Chart === "undefined") return;
  const series = getHourlyScoredSeries().slice(0, 18);
  const labels = series.map((s) => s.hourLabel);

  let datasets = [];
  if (state.activeChartTab === "tempWind") {
    datasets = [
      {
        label: "Temperature (°C)",
        data: series.map((s) => s.tempC),
        borderColor: "#2dd4bf",
        backgroundColor: "rgba(45, 212, 191, 0.16)",
        tension: 0.35,
        fill: true,
        yAxisID: "y"
      },
      {
        label: "Wind Speed (km/h)",
        data: series.map((s) => s.windKmh),
        borderColor: "#38bdf8",
        backgroundColor: "rgba(56, 189, 248, 0.14)",
        tension: 0.35,
        yAxisID: "y1"
      }
    ];
  } else if (state.activeChartTab === "pressureScore") {
    datasets = [
      {
        label: "Fishing Score (0–100)",
        data: series.map((s) => s.score),
        borderColor: "#34d399",
        backgroundColor: "rgba(52, 211, 153, 0.18)",
        tension: 0.35,
        fill: true,
        yAxisID: "y"
      },
      {
        label: "Pressure (hPa)",
        data: series.map((s) => s.pressureHpa),
        borderColor: "#f59e0b",
        borderDash: [5, 5],
        tension: 0.3,
        yAxisID: "y1"
      }
    ];
  } else {
    datasets = [
      {
        label: "Humidity (%)",
        data: series.map((s) => s.humidity),
        borderColor: "#38bdf8",
        backgroundColor: "rgba(56, 189, 248, 0.15)",
        tension: 0.35,
        fill: true,
        yAxisID: "y"
      },
      {
        label: "Precipitation (mm)",
        data: series.map((s) => s.precipMm),
        borderColor: "#fb7185",
        backgroundColor: "rgba(251, 113, 133, 0.25)",
        type: "bar",
        yAxisID: "y1"
      }
    ];
  }

  if (state.chartInstance) {
    state.chartInstance.destroy();
  }

  state.chartInstance = new Chart(els.forecastChart.getContext("2d"), {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: { color: "#cbd5e1", font: { family: "Inter", size: 12 } }
        }
      },
      scales: {
        x: {
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(148, 163, 184, 0.1)" }
        },
        y: {
          type: "linear",
          position: "left",
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(148, 163, 184, 0.12)" }
        },
        y1: {
          type: "linear",
          position: "right",
          ticks: { color: "#94a3b8" },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

/* ---------------- Actions & Event Listeners ---------------- */
async function loadForecastForLocation(loc, { showBanner = true } = {}) {
  state.location = { ...loc };
  setRefreshing(true);
  if (showBanner) {
    setStatus(`Fetching live fishing weather for ${loc.name}...`, { loading: true });
  }

  try {
    const { weatherData, marineData } = await fetchWeatherAndMarine(loc.latitude, loc.longitude);
    state.weather = weatherData;
    state.marine = marineData;
    renderAll();
    clearStatus();
  } catch (err) {
    console.error(err);
    setStatus(`Could not load forecast for ${loc.name}. ${err.message || "Please try again."}`, {
      error: true
    });
  } finally {
    setRefreshing(false);
  }
}

function initEvents() {
  // Mobile navigation toggle
  els.navToggle.addEventListener("click", () => {
    const isOpen = els.mainNav.classList.toggle("open");
    els.navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  // Close mobile nav on link click
  els.mainNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      els.mainNav.classList.remove("open");
      els.navToggle.setAttribute("aria-expanded", "false");
    });
  });

  // Dismiss status banner
  els.dismissBannerBtn.addEventListener("click", clearStatus);

  // Refresh button
  els.refreshBtn.addEventListener("click", () => {
    loadForecastForLocation(state.location);
  });

  // Geolocation button
  els.locateBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      setStatus("Geolocation is not supported by your browser.", { error: true });
      return;
    }
    setStatus("Detecting your current fishing coordinates...", { loading: true });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        loadForecastForLocation({
          name: "Current GPS Location",
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude
        });
      },
      (err) => {
        setStatus(`Location access unavailable (${err.message}). Using searched or default spot.`, {
          error: true
        });
      },
      { timeout: 10000 }
    );
  });

  // Preset chips
  els.presetChips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    els.presetChips.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    loadForecastForLocation({
      name: chip.dataset.name,
      latitude: Number(chip.dataset.lat),
      longitude: Number(chip.dataset.lon)
    });
  });

  // Search autocomplete
  els.locationInput.addEventListener("input", () => {
    const q = els.locationInput.value.trim();
    clearTimeout(state.searchTimer);
    if (q.length < 2) {
      els.searchResults.classList.remove("open");
      els.searchResults.innerHTML = "";
      return;
    }

    state.searchTimer = setTimeout(async () => {
      try {
        const matches = await searchLocations(q);
        if (!matches.length) {
          els.searchResults.innerHTML = `<div class="search-result-item"><span class="search-result-sub">No matching places found</span></div>`;
          els.searchResults.classList.add("open");
          return;
        }
        els.searchResults.innerHTML = matches
          .map((m) => {
            const label = [m.name, m.admin1, m.country].filter(Boolean).join(", ");
            return `
              <button type="button" class="search-result-item" data-lat="${m.latitude}" data-lon="${m.longitude}" data-name="${label.replace(/"/g, "&quot;")}">
                <span>${label}</span>
                <span class="search-result-sub">${Number(m.latitude).toFixed(2)}, ${Number(m.longitude).toFixed(2)}</span>
              </button>
            `;
          })
          .join("");
        els.searchResults.classList.add("open");
      } catch {
        els.searchResults.classList.remove("open");
      }
    }, 280);
  });

  els.searchResults.addEventListener("click", (e) => {
    const item = e.target.closest(".search-result-item");
    if (!item || !item.dataset.lat) return;
    els.locationInput.value = item.dataset.name;
    els.searchResults.classList.remove("open");
    loadForecastForLocation({
      name: item.dataset.name,
      latitude: Number(item.dataset.lat),
      longitude: Number(item.dataset.lon)
    });
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-input-wrap")) {
      els.searchResults.classList.remove("open");
    }
  });

  // Search submit
  els.searchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = els.locationInput.value.trim();
    if (!q) return;
    els.searchResults.classList.remove("open");
    setStatus(`Searching for "${q}"...`, { loading: true });
    try {
      const matches = await searchLocations(q);
      if (!matches.length) {
        setStatus(`No fishing location found for "${q}". Try another town, bay, or region.`, {
          error: true
        });
        return;
      }
      const top = matches[0];
      const fullName = [top.name, top.admin1, top.country].filter(Boolean).join(", ");
      loadForecastForLocation({
        name: fullName,
        latitude: top.latitude,
        longitude: top.longitude
      });
    } catch (err) {
      setStatus(`Search failed: ${err.message}`, { error: true });
    }
  });

  // Chart tabs
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      state.activeChartTab = btn.dataset.chart;
      renderChart();
    });
  });
}

/* ---------------- Boot ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  initEvents();
  loadForecastForLocation(state.location);
});