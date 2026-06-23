/**
 * Retail Cloud VIN Lookup — Cloudflare Worker
 */

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VIN Lookup — Goodyear Auto Service</title>
  <script src="https://cdn.jsdelivr.net/npm/@ericblade/quagga2/dist/quagga.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f4f4f4;
      color: #1a1a1a;
      min-height: 100vh;
    }

    header {
      background: #1a1a1a;
      padding: 14px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    header .logo {
      width: 32px; height: 32px;
      background: #f4c00a;
      border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; font-weight: 900; color: #1a1a1a;
      flex-shrink: 0;
    }
    header h1 { color: #fff; font-size: 16px; font-weight: 600; }
    header span { color: #f4c00a; font-size: 13px; margin-left: auto; font-weight: 500; }

    .search-bar {
      background: #fff;
      border-bottom: 1px solid #e0e0e0;
      padding: 16px 20px;
      display: flex;
      gap: 10px;
    }
    .input-wrap {
      flex: 1;
      position: relative;
      display: flex;
      align-items: center;
    }
    .search-bar input {
      width: 100%;
      border: 1.5px solid #ccc;
      border-radius: 6px;
      padding: 10px 42px 10px 14px;
      font-size: 14px;
      font-family: monospace;
      letter-spacing: 1px;
      text-transform: uppercase;
      outline: none;
      transition: border-color 0.15s;
    }
    .search-bar input:focus { border-color: #f4c00a; }
    .search-bar .scan-btn {
      position: absolute;
      right: 10px;
      background: none !important;
      border: none;
      color: #aaa;
      padding: 0;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: color 0.15s;
    }
    .search-bar .scan-btn:hover  { color: #555; }
    .search-bar .scan-btn:active { color: #333; }
    .search-bar button {
      background: #f4c00a;
      color: #1a1a1a;
      border: none;
      border-radius: 6px;
      padding: 10px 22px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s;
      white-space: nowrap;
    }
    .search-bar button:hover  { background: #dba908; }
    .search-bar button:active { background: #c9980a; }

    /* Camera scanner overlay */
    #scanner-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: #000;
      z-index: 200;
      flex-direction: column;
    }
    #scanner-overlay.active { display: flex; }
    #scanner-video {
      width: 100%;
      flex: 1;
      object-fit: cover;
    }
    .scanner-ui {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }
    .scanner-frame {
      width: 260px; height: 120px;
      border: 2px solid #f4c00a;
      border-radius: 8px;
      box-shadow: 0 0 0 2000px rgba(0,0,0,0.55);
      position: relative;
    }
    .scanner-frame::before, .scanner-frame::after {
      content: '';
      position: absolute;
      width: 20px; height: 20px;
      border-color: #f4c00a;
      border-style: solid;
    }
    .scanner-frame::before { top: -2px; left: -2px; border-width: 3px 0 0 3px; border-radius: 6px 0 0 0; }
    .scanner-frame::after  { bottom: -2px; right: -2px; border-width: 0 3px 3px 0; border-radius: 0 0 6px 0; }
    .scanner-label {
      color: #fff;
      font-size: 13px;
      margin-top: 20px;
      opacity: 0.8;
    }
    .scanner-close {
      position: absolute;
      top: 20px; right: 20px;
      background: rgba(0,0,0,0.6);
      color: #fff;
      border: 1px solid #444;
      border-radius: 6px;
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      pointer-events: all;
    }

    #error-msg {
      display: none;
      background: #fff0f0;
      color: #c0392b;
      border-left: 4px solid #c0392b;
      margin: 16px 20px 0;
      padding: 10px 14px;
      border-radius: 4px;
      font-size: 13px;
    }

    #results { display: none; padding: 16px 20px; }

    /* Vehicle card */
    .vehicle-card {
      background: #fff;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
      margin-bottom: 16px;
    }
    .vehicle-card img {
      width: 100%;
      max-height: 220px;
      object-fit: contain;
      background: #f0f0f0;
      display: block;
      padding: 10px 0;
    }
    .vehicle-info { padding: 16px; }
    .vehicle-info h2 { font-size: 19px; font-weight: 700; margin-bottom: 2px; }
    .vin-label { font-size: 11px; color: #999; margin-bottom: 14px; font-family: monospace; }

    .specs-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .spec { background: #f7f7f7; border-radius: 7px; padding: 9px 12px; }
    .spec label { display: block; font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
    .spec span  { font-size: 13px; font-weight: 600; }

    .approval-row {
      margin-top: 14px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .approval-btn {
      background: #1a1a1a;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 9px 18px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
      white-space: nowrap;
    }
    .approval-btn:hover    { background: #333; }
    .approval-btn:disabled { background: #999; cursor: default; }
    .approval-badge {
      display: none;
      align-items: center;
      gap: 7px;
      background: #eafaf1;
      border: 1.5px solid #27ae60;
      border-radius: 6px;
      padding: 7px 12px;
      flex: 1;
    }
    .approval-badge.visible { display: flex; }
    .approval-badge .check {
      width: 18px; height: 18px;
      background: #27ae60;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .approval-badge .check svg { display: block; }
    .approval-badge .text { font-size: 12px; color: #1a6e3a; line-height: 1.4; }
    .approval-badge .text strong { display: block; font-size: 13px; font-weight: 700; }

    /* Assignment panel */
    .assign-panel {
      display: none;
      margin-top: 14px;
      border: 1.5px solid #e0e0e0;
      border-radius: 8px;
      overflow: hidden;
    }
    .assign-panel.visible { display: block; }
    .assign-section {
      padding: 14px 16px;
      border-bottom: 1px solid #f0f0f0;
    }
    .assign-section:last-child { border-bottom: none; }
    .assign-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #999;
      margin-bottom: 10px;
    }
    .bay-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    .bay-btn {
      border: 1.5px solid #e0e0e0;
      border-radius: 7px;
      padding: 10px 6px;
      text-align: center;
      cursor: pointer;
      background: #fff;
      transition: border-color 0.12s, background 0.12s;
    }
    .bay-btn .bay-num { font-size: 16px; font-weight: 800; color: #1a1a1a; }
    .bay-btn .bay-status { font-size: 10px; color: #27ae60; font-weight: 600; margin-top: 2px; }
    .bay-btn.busy { background: #f7f7f7; cursor: default; }
    .bay-btn.busy .bay-num { color: #bbb; }
    .bay-btn.busy .bay-status { color: #bbb; }
    .bay-btn.selected { border-color: #f4c00a; background: #fffbea; }
    .bay-btn:not(.busy):hover { border-color: #f4c00a; }

    .tech-list { display: flex; flex-direction: column; gap: 7px; }
    .tech-btn {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border: 1.5px solid #e0e0e0;
      border-radius: 7px;
      padding: 9px 13px;
      cursor: pointer;
      background: #fff;
      transition: border-color 0.12s, background 0.12s;
    }
    .tech-btn .tech-name { font-size: 13px; font-weight: 600; color: #1a1a1a; }
    .tech-btn .tech-avail { font-size: 11px; color: #27ae60; font-weight: 600; }
    .tech-btn.busy { background: #f7f7f7; cursor: default; }
    .tech-btn.busy .tech-name { color: #bbb; }
    .tech-btn.busy .tech-avail { color: #bbb; }
    .tech-btn.selected { border-color: #f4c00a; background: #fffbea; }
    .tech-btn:not(.busy):hover { border-color: #f4c00a; }

    .assign-footer {
      padding: 12px 16px;
      background: #fafafa;
      border-top: 1px solid #f0f0f0;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .assign-confirm-btn {
      background: #f4c00a;
      color: #1a1a1a;
      border: none;
      border-radius: 6px;
      padding: 9px 20px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s;
    }
    .assign-confirm-btn:hover { background: #dba908; }
    .assign-confirm-btn:disabled { background: #e0e0e0; color: #aaa; cursor: default; }
    .assign-hint { font-size: 12px; color: #aaa; }

    /* Assignment confirmation card */
    .assign-confirm-card {
      display: none;
      margin-top: 14px;
      background: #1a1a1a;
      border-radius: 8px;
      padding: 14px 16px;
    }
    .assign-confirm-card.visible { display: block; }
    .assign-confirm-card .confirm-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #f4c00a;
      margin-bottom: 10px;
    }
    .confirm-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .confirm-item label {
      display: block;
      font-size: 10px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      margin-bottom: 2px;
    }
    .confirm-item span { font-size: 13px; font-weight: 700; color: #fff; }

    /* Section heading */
    .section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #999;
      margin-bottom: 10px;
    }

    /* Tire card */
    .tire-card {
      background: #fff;
      border-radius: 10px;
      padding: 16px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
      margin-bottom: 16px;
      display: flex;
      align-items: flex-start;
      gap: 14px;
    }
    .tire-badge {
      background: #f4c00a;
      border-radius: 8px;
      padding: 10px 12px;
      text-align: center;
      flex-shrink: 0;
      min-width: 72px;
    }
    .tire-badge .brand { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
    .tire-badge .size  { font-size: 13px; font-weight: 900; margin-top: 3px; }
    .tire-info h3 { font-size: 15px; font-weight: 700; margin-bottom: 5px; }
    .tire-info p  { font-size: 12px; color: #555; line-height: 1.5; }

    /* Service history */
    .history-card {
      background: #fff;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    }
    .history-header {
      display: grid;
      grid-template-columns: 88px 1fr 1fr 72px;
      gap: 8px;
      padding: 9px 16px;
      background: #1a1a1a;
      border-radius: 10px 10px 0 0;
    }
    .history-header span {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #f4c00a;
    }
    .history-header span:last-child { text-align: right; }
    .history-row {
      display: grid;
      grid-template-columns: 88px 1fr 1fr 72px;
      gap: 8px;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid #f2f2f2;
    }
    .history-row:last-child { border-bottom: none; }
    .history-row .date { font-size: 12px; color: #999; }
    .history-row .svcs { font-size: 13px; font-weight: 500; line-height: 1.3; }
    .history-row .svcs .mi { display: block; font-size: 11px; color: #bbb; font-weight: 400; margin-top: 1px; }
    .history-row .notes { font-size: 11px; color: #777; line-height: 1.4; }
    .history-row .tech { font-size: 11px; color: #bbb; text-align: right; }

    /* Loading overlay */
    #loading-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(244,244,244,0.92);
      z-index: 100;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
    }
    #loading-overlay.active { display: flex; }
    .spinner-ring {
      width: 72px; height: 72px;
      border-radius: 50%;
      border: 4px solid #e0e0e0;
      border-top-color: #f4c00a;
      animation: spin 0.8s linear infinite;
      display: flex; align-items: center; justify-content: center;
      position: relative;
    }
    .spinner-ring .inner-logo {
      position: absolute;
      width: 52px; height: 52px;
      background: #1a1a1a;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; font-weight: 900; color: #f4c00a;
      letter-spacing: -1px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    #loading-overlay p { font-size: 13px; color: #888; font-weight: 500; }
  </style>
</head>
<body>

<header>
  <div class="logo">G</div>
  <h1>VIN Lookup</h1>
  <span>Goodyear Auto Service</span>
</header>

<div class="search-bar">
  <div class="input-wrap">
    <input id="vin-input" type="text" placeholder="Enter VIN (17 characters)" maxlength="17" autocomplete="off" spellcheck="false" />
    <button class="scan-btn" onclick="openScanner()" title="Scan barcode">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>
        <path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
        <line x1="7" y1="12" x2="7" y2="12.01"/><line x1="12" y1="8" x2="12" y2="16"/>
        <line x1="17" y1="12" x2="17" y2="12.01"/>
      </svg>
    </button>
  </div>
  <button id="lookup-btn" onclick="lookupVin()">Look Up</button>
</div>

<div id="scanner-overlay">
  <div id="qr-reader" style="width:100%;height:100%;"></div>
  <button class="scanner-close" onclick="closeScanner()">Cancel</button>
</div>

<div id="error-msg"></div>

<div id="loading-overlay">
  <div class="spinner-ring">
    <div class="inner-logo">G</div>
  </div>
  <p>Looking up VIN...</p>
</div>

<div id="results">
  <div class="vehicle-card">
    <img id="car-img" src="" alt="Vehicle photo" />
    <div class="vehicle-info">
      <h2 id="car-title"></h2>
      <div class="vin-label" id="car-vin"></div>
      <div class="specs-grid">
        <div class="spec"><label>Trim</label><span id="spec-trim"></span></div>
        <div class="spec"><label>Color</label><span id="spec-color"></span></div>
        <div class="spec"><label>Engine</label><span id="spec-engine"></span></div>
        <div class="spec"><label>Transmission</label><span id="spec-trans"></span></div>
      </div>
      <div class="approval-row">
        <button class="approval-btn" id="approval-btn" onclick="checkApproval()">Check Service Approval</button>
        <div class="approval-badge" id="approval-badge">
          <div class="check">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="text">
            <strong>Service Approved</strong>
            <span id="approval-contract"></span>
          </div>
        </div>
      </div>

      <button class="approval-btn" id="assign-btn" style="display:none;margin-top:10px;width:100%;" onclick="openAssignPanel()">Assign Bay &amp; Technician</button>

      <div class="assign-panel" id="assign-panel">
        <div class="assign-section">
          <div class="assign-label">Select Bay</div>
          <div class="bay-grid">
            <button class="bay-btn" id="bay-1" onclick="selectBay(1)">
              <div class="bay-num">1</div><div class="bay-status">Available</div>
            </button>
            <button class="bay-btn busy" id="bay-2" disabled>
              <div class="bay-num">2</div><div class="bay-status">In Use</div>
            </button>
            <button class="bay-btn busy" id="bay-3" disabled>
              <div class="bay-num">3</div><div class="bay-status">In Use</div>
            </button>
            <button class="bay-btn" id="bay-4" onclick="selectBay(4)">
              <div class="bay-num">4</div><div class="bay-status">Available</div>
            </button>
          </div>
        </div>
        <div class="assign-section">
          <div class="assign-label">Select Technician</div>
          <div class="tech-list" id="tech-list">
            <div style="font-size:12px;color:#bbb;padding:4px 0;">Select a bay first</div>
          </div>
        </div>
        <div class="assign-footer">
          <button class="assign-confirm-btn" id="assign-confirm-btn" onclick="confirmAssignment()" disabled>Confirm Assignment</button>
          <span class="assign-hint" id="assign-hint">Select a bay and technician</span>
        </div>
      </div>

      <div class="assign-confirm-card" id="assign-confirm-card">
        <div class="confirm-title">Assignment Confirmed</div>
        <div class="confirm-grid">
          <div class="confirm-item"><label>Bay</label><span id="confirm-bay"></span></div>
          <div class="confirm-item"><label>Technician</label><span id="confirm-tech"></span></div>
          <div class="confirm-item"><label>Service</label><span id="confirm-service"></span></div>
          <div class="confirm-item"><label>Est. Start Time</label><span id="confirm-time"></span></div>
        </div>
      </div>

    </div>
  </div>

  <div class="section-title">Recommended Tire</div>
  <div class="tire-card">
    <div class="tire-badge">
      <div class="brand" id="tire-brand"></div>
      <div class="size"  id="tire-size"></div>
    </div>
    <div class="tire-info">
      <h3 id="tire-model"></h3>
      <p  id="tire-reason"></p>
    </div>
  </div>

  <div class="section-title">Service History</div>
  <div class="history-card">
    <div class="history-header">
      <span>Date</span>
      <span>Service</span>
      <span>Notes</span>
      <span>Technician</span>
    </div>
    <div id="history-list"></div>
  </div>
</div>

<script>
  const VEHICLES = {
    '1GKKVTKD7EJ360562': {
      contractNumber: 'GN-2024-00842',
      service: 'Oil Change',
      year: 2014, make: 'GMC', model: 'Acadia', trim: 'Denali Sport Utility 4D',
      transmission: 'Automatic, 6-Speed', engine: 'V6, 3.6 Liter', color: 'White',
      image_url: 'https://vexstockimages.fastly.carvana.io/stockimages/2014_GMC_ACADIA_DENALI%20SPORT%20UTILITY%204D_WHITE_stock_1_desktop.png?v=1772087838.879',
      tire: {
        brand: 'Goodyear', model: 'Eagle Sport All Season', size: '255/55R20',
        reason: 'High-performance all-season tire with excellent wet traction and handling — ideal for this vehicle.',
      },
      history: [
        { date: '2024-03-12', mileage: 45230, services: ['Oil Change', 'Tire Rotation'],   notes: 'Used 5W-30 synthetic. Tread even, 6/32 depth.',          tech: 'J. Alvarez' },
        { date: '2024-08-04', mileage: 48910, services: ['Battery Replacement'],            notes: 'OEM battery failed load test. Replaced with 700CCA.',    tech: 'M. Torres'  },
        { date: '2025-01-19', mileage: 52440, services: ['Brake Service — Front Pads'],    notes: 'Pads at 2mm. Rotors inspected, within spec, no resurface.', tech: 'J. Alvarez' },
        { date: '2025-06-07', mileage: 56780, services: ['Oil Change', 'Tire Rotation'],   notes: 'Used 5W-30 synthetic. Rotated F→R. Pressure set to 35psi.', tech: 'R. Chen'    },
        { date: '2025-11-22', mileage: 59120, services: ['Tire Replacement — All 4'],      notes: 'Installed Goodyear Assurance WeatherReady 255/65R18.',    tech: 'M. Torres'  },
      ],
    },
  };

  async function checkApproval() {
    const btn = document.getElementById('approval-btn');
    btn.disabled = true;
    btn.textContent = 'Checking...';

    await new Promise(r => setTimeout(r, 1200));

    const vin = document.getElementById('vin-input').value.trim().toUpperCase();
    const v = VEHICLES[vin];
    const contract = v && v.contractNumber ? v.contractNumber : null;

    btn.disabled = false;
    btn.textContent = 'Check Service Approval';

    if (contract) {
      document.getElementById('approval-contract').textContent = 'Contract #' + contract;
      document.getElementById('approval-badge').classList.add('visible');
      btn.style.display = 'none';
      document.getElementById('assign-btn').style.display = 'block';
    } else {
      btn.disabled = false;
    }
  }

  function openAssignPanel() {
    var btn = document.getElementById('assign-btn');
    btn.disabled = true;
    btn.textContent = 'Loading…';
    setTimeout(function() {
      btn.style.display = 'none';
      btn.disabled = false;
      btn.textContent = 'Assign Bay & Technician';
      document.getElementById('assign-panel').classList.add('visible');
    }, 1400);
  }

  const ALL_TECHS = ['J. Alvarez', 'R. Chen', 'M. Torres', 'D. Patel', 'S. Nguyen'];

  // Which techs are already assigned to each bay
  const BAY_BUSY = {
    1: ['M. Torres'],
    2: ['J. Alvarez', 'M. Torres'], // Bay 2 in use
    3: ['R. Chen', 'D. Patel'],     // Bay 3 in use
    4: ['J. Alvarez'],
  };

  let selectedBay  = null;
  let selectedTech = null;

  function selectBay(num) {
    selectedBay = num;
    selectedTech = null;
    document.querySelectorAll('.bay-btn:not(.busy)').forEach(b => b.classList.remove('selected'));
    document.getElementById('bay-' + num).classList.add('selected');
    renderTechs(BAY_BUSY[num] || []);
    updateAssignHint();
  }

  function renderTechs(busyList) {
    const list = document.getElementById('tech-list');
    list.innerHTML = ALL_TECHS.map(function(name) {
      const busy = busyList.includes(name);
      const cls  = 'tech-btn' + (busy ? ' busy' : '');
      const data = busy ? 'disabled' : 'data-tech="' + name + '"';
      return '<button class="' + cls + '" ' + data + '>'
        + '<span class="tech-name">' + name + '</span>'
        + '<span class="tech-avail">' + (busy ? 'Busy' : 'Available') + '</span>'
        + '</button>';
    }).join('');
  }

  document.getElementById('tech-list').addEventListener('click', function(e) {
    const btn = e.target.closest('.tech-btn:not(.busy)');
    if (!btn || !btn.dataset.tech) return;
    document.querySelectorAll('.tech-btn:not(.busy)').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedTech = btn.dataset.tech;
    updateAssignHint();
  });

  function updateAssignHint() {
    const btn  = document.getElementById('assign-confirm-btn');
    const hint = document.getElementById('assign-hint');
    if (selectedBay && selectedTech) {
      btn.disabled = false;
      hint.textContent = '';
    } else if (selectedBay) {
      hint.textContent = 'Now select a technician';
    } else if (selectedTech) {
      hint.textContent = 'Now select a bay';
    }
  }

  async function confirmAssignment() {
    const confirmBtn = document.getElementById('assign-confirm-btn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Confirming...';

    await new Promise(r => setTimeout(r, 1100));

    const vin = document.getElementById('vin-input').value.trim().toUpperCase();
    const v   = VEHICLES[vin];
    var estStart = 'In ' + (Math.floor(Math.random() * 8) + 1) + ' minutes';

    document.getElementById('confirm-bay').textContent      = 'Bay ' + selectedBay;
    document.getElementById('confirm-tech').textContent     = selectedTech;
    document.getElementById('confirm-service').textContent  = v ? v.service : 'Service';
    document.getElementById('confirm-time').textContent     = estStart;

    document.getElementById('assign-panel').classList.remove('visible');
    document.getElementById('assign-confirm-card').classList.add('visible');
  }

  async function lookupVin() {
    const vin = document.getElementById('vin-input').value.trim().toUpperCase();
    const btn = document.getElementById('lookup-btn');
    const err = document.getElementById('error-msg');
    const res = document.getElementById('results');

    document.getElementById('approval-badge').classList.remove('visible');
    document.getElementById('approval-btn').style.display = '';
    document.getElementById('assign-btn').style.display = 'none';
    document.getElementById('assign-panel').classList.remove('visible');
    document.getElementById('assign-confirm-card').classList.remove('visible');
    document.querySelectorAll('.bay-btn:not(.busy)').forEach(b => b.classList.remove('selected'));
    document.querySelectorAll('.tech-btn:not(.busy)').forEach(b => b.classList.remove('selected'));
    document.getElementById('assign-confirm-btn').disabled = true;
    document.getElementById('assign-hint').textContent = 'Select a bay and technician';
    selectedBay = null; selectedTech = null;

    err.style.display = 'none';
    res.style.display = 'none';

    if (!vin) { showError('Please enter a VIN.'); return; }
    if (vin.length !== 17) { showError('VIN must be exactly 17 characters.'); return; }

    btn.disabled = true;
    btn.textContent = 'Looking up...';
    document.getElementById('loading-overlay').classList.add('active');

    await new Promise(r => setTimeout(r, 1400));

    document.getElementById('loading-overlay').classList.remove('active');
    btn.disabled = false;
    btn.textContent = 'Look Up';

    const v = VEHICLES[vin];
    if (!v) { showError('VIN not found in our system. Please check and try again.'); return; }

    render(vin, v);
  }

  function showError(msg) {
    const el = document.getElementById('error-msg');
    el.textContent = msg;
    el.style.display = 'block';
  }

  function render(vin, v) {
    document.getElementById('car-img').src      = v.image_url;
    document.getElementById('car-title').textContent = v.year + ' ' + v.make + ' ' + v.model;
    document.getElementById('car-vin').textContent   = 'VIN: ' + vin;
    document.getElementById('spec-trim').textContent  = v.trim;
    document.getElementById('spec-color').textContent = v.color;
    document.getElementById('spec-engine').textContent = v.engine;
    document.getElementById('spec-trans').textContent  = v.transmission;

    document.getElementById('tire-brand').textContent  = v.tire.brand;
    document.getElementById('tire-size').textContent   = v.tire.size;
    document.getElementById('tire-model').textContent  = v.tire.model;
    document.getElementById('tire-reason').textContent = v.tire.reason;

    document.getElementById('history-list').innerHTML = v.history.slice().sort(function(a,b){ return b.date.localeCompare(a.date); }).map(function(h) {
      return '<div class="history-row">'
        + '<span class="date">' + h.date + '</span>'
        + '<span class="svcs">' + h.services.join(', ') + '<span class="mi">' + h.mileage.toLocaleString() + ' mi</span></span>'
        + '<span class="notes">' + h.notes + '</span>'
        + '<span class="tech">' + h.tech + '</span>'
        + '</div>';
    }).join('');

    document.getElementById('results').style.display = 'block';
  }

  document.getElementById('vin-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') lookupVin();
  });

  // Global keyboard-wedge listener for Bluetooth HID scanners (e.g. Socket Mobile).
  // Scanners send chars in a burst then Enter — detect by timing: ≥8 chars in <300ms.
  (function() {
    let buffer = '';
    let lastKeyTime = 0;
    const TIMEOUT = 300;

    document.addEventListener('keydown', e => {
      const input = document.getElementById('vin-input');
      const now = Date.now();

      // If the VIN input already has focus, let it handle keystrokes normally.
      if (document.activeElement === input) return;

      if (e.key === 'Enter') {
        if (buffer.length >= 8) {
          input.value = buffer.trim().toUpperCase();
          lookupVin();
        }
        buffer = '';
        return;
      }

      // Reset buffer if too much time has passed since the last keystroke.
      if (now - lastKeyTime > TIMEOUT) buffer = '';
      lastKeyTime = now;

      if (e.key.length === 1) buffer += e.key;
    });
  })();

  // ── Barcode Scanner ──────────────────────────────────────────────────────────
  let scannerRunning = false;

  function openScanner() {
    document.getElementById('scanner-overlay').classList.add('active');

    Quagga.init({
      inputStream: {
        name: 'Live',
        type: 'LiveStream',
        target: document.getElementById('qr-reader'),
        constraints: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      },
      decoder: {
        readers: ['code_128_reader', 'code_39_reader', 'ean_reader', 'upc_reader'],
      },
      locate: true,
    }, function(err) {
      if (err) {
        closeScanner();
        alert('Could not access camera. Please check permissions and try again.');
        return;
      }
      scannerRunning = true;
      Quagga.start();
    });

    Quagga.onDetected(function(result) {
      const code = result.codeResult.code;
      if (code) {
        closeScanner();
        document.getElementById('vin-input').value = code.trim().toUpperCase();
        lookupVin();
      }
    });
  }

  function closeScanner() {
    if (scannerRunning) {
      Quagga.stop();
      scannerRunning = false;
    }
    document.getElementById('scanner-overlay').classList.remove('active');
  }
</script>
</body>
</html>
`;

const ICONS = {
  "warranty-1yr": "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",
  "warranty-2yr": "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",
  "road-hazard": "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",
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const iconMatch = url.pathname.match(/^\/icons\/(.+)\.png$/);
    if (iconMatch) {
      const key = iconMatch[1];
      if (ICONS[key]) {
        const bytes = Uint8Array.from(atob(ICONS[key]), c => c.charCodeAt(0));
        return new Response(bytes, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      return new Response('Not found', { status: 404 });
    }
    return new Response(HTML, {
      headers: {
        'Content-Type': 'text/html;charset=UTF-8',
        'X-Frame-Options': 'ALLOWALL',
      },
    });
  },
};
