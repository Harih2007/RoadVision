/**
 * RoadVision — Vehicle Verification & VAHAN Mock Data Layer
 * Handles mock VAHAN/NCRB vehicle lookups, PII access audit logging,
 * consolidated verification card rendering, and action routing.
 */

// Cache mock vehicle database in memory once loaded
let _mockVehicleDatabase = null;
const AUDIT_LOG_KEY = 'roadvision_audit_logs';

/**
 * Fetch and load vehicle database from mock-vehicle-data.json
 */
async function loadMockVehicleDatabase() {
  if (_mockVehicleDatabase) return _mockVehicleDatabase;
  try {
    const res = await fetch('mock-vehicle-data.json');
    if (res.ok) {
      const data = await res.json();
      _mockVehicleDatabase = data.vehicles || [];
      return _mockVehicleDatabase;
    }
  } catch (e) {
    console.warn('Failed to load mock-vehicle-data.json, using fallback cache', e);
  }
  return [];
}

/**
 * Lookup vehicle record by plate registration string (normalized)
 */
async function lookupVehicleRecord(plateStr) {
  const db = await loadMockVehicleDatabase();
  if (!plateStr) return null;
  const cleanKey = plateStr.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return db.find(v => v.plate.replace(/[^A-Z0-9]/gi, '').toUpperCase() === cleanKey) || null;
}

/**
 * Log PII access request to persistent audit trail (localStorage)
 */
function logPiiAccess(plate, reason) {
  try {
    const logs = JSON.parse(localStorage.getItem(AUDIT_LOG_KEY) || '[]');
    const newEntry = {
      id: Date.now(),
      plate: plate,
      reason: reason || 'Routine Security Audit',
      operator: 'Operator (Officer ID #4092)',
      timestamp: new Date().toISOString()
    };
    logs.unshift(newEntry);
    // Keep max 50 audit entries
    localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(logs.slice(0, 50)));
    return newEntry;
  } catch (e) {
    console.error('Failed to write PII audit log:', e);
    return null;
  }
}

/**
 * Get all stored audit log entries
 */
function getPiiAuditLogs() {
  try {
    return JSON.parse(localStorage.getItem(AUDIT_LOG_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

/**
 * Build consolidated Vehicle Verification Card HTML
 */
function buildVerificationCardHTML(record, plateQuery) {
  const cardId = 'v-card-' + Math.random().toString(36).substr(2, 9);
  
  if (!record) {
    // Unmatched / Not Found state
    return `
      <div class="verification-card verification-unmatched" id="${cardId}">
        <div class="verification-header warning">
          <span class="material-symbols-outlined">help_outline</span>
          <span>Registry Check: No Record Found</span>
        </div>
        <div class="verification-body">
          <div class="verification-row">
            <span class="verification-label">Scanned Plate</span>
            <span class="plate-number">${plateQuery || 'Unknown'}</span>
          </div>
          <div class="verification-row">
            <span class="verification-label">VAHAN Registry Status</span>
            <span class="badge warning">Unregistered / Ambiguous Plate</span>
          </div>
          <p style="font-size:12px; color:var(--text-muted); margin-top:8px;">
            This plate number could not be matched against the state vehicle database. Recommended action: Route to Operator Review Queue.
          </p>
        </div>
        <div class="verification-disclaimer">
          Simulated data — production requires VAHAN/NCRB API integration via government MoU
        </div>
      </div>
    `;
  }

  const isStolen = record.stolen === true;
  const isRegValid = record.registration_status === 'Valid';
  const isInsValid = record.insurance && record.insurance.status === 'Valid';
  const isPucValid = record.puc && record.puc.status === 'Valid';
  const challanCount = record.challans ? record.challans.count : 0;
  const challanAmount = record.challans ? record.challans.total_amount : 0;

  // Stolen alert banner & card modifier
  const stolenBannerHTML = isStolen ? `
    <div class="stolen-alert-banner">
      <span class="material-symbols-outlined siren-icon">emergency</span>
      <div class="stolen-alert-text">
        <strong>STOLEN VEHICLE ALERT — NCRB MATCH</strong>
        <div>${record.stolen_details ? record.stolen_details.crime_status : 'Active Police Wanted Flag'}</div>
      </div>
    </div>
  ` : '';

  const cardClass = isStolen ? 'verification-card verification-stolen-alert' : 'verification-card';

  return `
    <div class="${cardClass}" id="${cardId}">
      ${stolenBannerHTML}

      <div class="verification-card-inner">
        <div class="verification-title-row">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="material-symbols-outlined" style="color:var(--primary);">verified</span>
            <h4 style="margin:0; font-size:14px; font-weight:700;">Vehicle Registry Verification</h4>
          </div>
          <span class="badge ${isRegValid ? 'success' : 'alert'}">${record.registration_status} Reg</span>
        </div>

        <div class="verification-grid">
          <!-- Registration Info (NO PII) -->
          <div class="verification-item">
            <span class="verification-label">Vehicle Class</span>
            <span class="verification-value">${record.vehicle_class || 'N/A'}</span>
          </div>

          <div class="verification-item">
            <span class="verification-label">State / RTO</span>
            <span class="verification-value">${record.state || 'N/A'}</span>
          </div>

          <div class="verification-item">
            <span class="verification-label">Reg Validity</span>
            <span class="verification-value">${record.valid_until || 'N/A'}</span>
          </div>

          <!-- Insurance Status -->
          <div class="verification-item">
            <span class="verification-label">Insurance</span>
            <span class="badge ${isInsValid ? 'success' : 'alert'}">
              <span class="material-symbols-outlined" style="font-size:12px;">${isInsValid ? 'security' : 'warning'}</span>
              ${record.insurance ? record.insurance.status : 'No Data'}
            </span>
            <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">Exp: ${record.insurance ? record.insurance.expiry : 'N/A'}</div>
          </div>

          <!-- PUC Status -->
          <div class="verification-item">
            <span class="verification-label">PUC Certificate</span>
            <span class="badge ${isPucValid ? 'success' : 'alert'}">
              <span class="material-symbols-outlined" style="font-size:12px;">${isPucValid ? 'eco' : 'warning'}</span>
              ${record.puc ? record.puc.status : 'No Data'}
            </span>
            <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">Exp: ${record.puc ? record.puc.expiry : 'N/A'}</div>
          </div>

          <!-- Pending Challans -->
          <div class="verification-item">
            <span class="verification-label">Pending Challans</span>
            <span class="badge ${challanCount === 0 ? 'success' : 'warning'}">
              ${challanCount === 0 ? 'Clean (0)' : `${challanCount} Pending (₹${challanAmount.toLocaleString()})`}
            </span>
          </div>
        </div>

        ${isStolen && record.stolen_details ? `
        <div class="stolen-details-box">
          <div style="font-size:11px; font-weight:700; color:var(--alert-text); margin-bottom:4px;">POLICE REPORT DETAILS:</div>
          <div style="font-size:12px;"><strong>FIR:</strong> ${record.stolen_details.fir_number} · <strong>Station:</strong> ${record.stolen_details.police_station}</div>
        </div>
        ` : ''}

        <!-- PII Reveal Section (RBAC Protected: Reviewer & Admin Only) -->
        ${(function() {
          const user = window.RoadVisionAuth ? window.RoadVisionAuth.getUser() : null;
          const role = user ? user.role : 'Reviewer/Supervisor';
          
          if (role === 'Field Operator') {
            return `
              <div style="margin-top:10px; padding:8px 12px; background:var(--surface-secondary); border-radius:var(--radius-md); font-size:11px; color:var(--text-muted); display:flex; align-items:center; gap:6px;">
                <span class="material-symbols-outlined" style="font-size:14px; color:var(--warning);">lock</span>
                <span>PII Access Restricted — Field Operator Role</span>
              </div>
            `;
          }

          return `
            <div class="pii-section" id="pii-section-${cardId}">
              <button class="btn-reveal-owner" onclick="handleRevealOwnerClick('${record.plate}', '${cardId}')">
                <span class="material-symbols-outlined" style="font-size:16px;">lock</span>
                Reveal Owner Details (Requires Access Reason)
              </button>
              
              <div class="pii-content" id="pii-content-${cardId}" style="display:none; margin-top:12px; padding:12px; background:var(--surface-secondary); border-radius:var(--radius-md); border:1px solid var(--border-color);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                  <span style="font-size:11px; font-weight:700; color:var(--primary); text-transform:uppercase;">Owner Identity Details</span>
                  <span style="font-size:10px; color:var(--text-muted);">Audit Logged ✓</span>
                </div>
                <div class="verification-row">
                  <span class="verification-label">Owner Name</span>
                  <span class="verification-value" style="font-weight:700;">${record.owner ? record.owner.name : 'N/A'}</span>
                </div>
                <div class="verification-row">
                  <span class="verification-label">Registered Address</span>
                  <span class="verification-value">${record.owner ? record.owner.address : 'N/A'}</span>
                </div>
                <div class="verification-row">
                  <span class="verification-label">Registering RTO</span>
                  <span class="verification-value">${record.owner ? record.owner.rto : 'N/A'}</span>
                </div>
              </div>
            </div>
          `;
        })()}
      </div>

      <div class="verification-disclaimer">
        Simulated data — production requires VAHAN/NCRB API integration via government MoU
      </div>
    </div>
  `;
}

/**
 * Handle "Reveal Owner Details" click with access reason modal
 */
function handleRevealOwnerClick(plate, cardId) {
  const user = window.RoadVisionAuth ? window.RoadVisionAuth.getUser() : null;
  const role = user ? user.role : 'Reviewer/Supervisor';

  if (role === 'Field Operator') {
    alert('Access Denied: Field Operators are not authorized to view PII owner details.');
    return;
  }

  const reason = prompt(`[SECURITY AUDIT ENFORCED]\nPlease state your official reason for accessing PII owner details for plate ${plate}:`, 'Traffic Violation Verification & Audit');
  if (reason && reason.trim()) {
    logPiiAccess(plate, reason.trim());
    if (window.RoadVisionAudit) {
      window.RoadVisionAudit.record('PII_REVEAL', plate, { reason: reason.trim() });
    }
    const piiContent = document.getElementById(`pii-content-${cardId}`);
    const revealBtn = document.querySelector(`#pii-section-${cardId} .btn-reveal-owner`);
    if (piiContent) piiContent.style.display = 'block';
    if (revealBtn) {
      revealBtn.style.display = 'none';
    }
  }
}

/**
 * Action Routing Logic based on vehicle verification match
 */
async function processVehicleActionRouting(detection) {
  const plateStr = detection.detected_plate;
  const record = await lookupVehicleRecord(plateStr);

  const routingResult = {
    detection: detection,
    record: record,
    actions: []
  };

  if (!record) {
    // 1. Unregistered / Unmatched plate -> Route to Review Queue
    routingResult.actions.push({
      type: 'ROUTE_REVIEW_QUEUE',
      reason: 'Plate not found in VAHAN registry'
    });
    return routingResult;
  }

  if (record.stolen) {
    // 2. Stolen Vehicle Match -> Priority Alert State
    routingResult.actions.push({
      type: 'PRIORITY_ALERT',
      reason: 'NCRB Stolen Vehicle Match (' + (record.stolen_details ? record.stolen_details.fir_number : 'Active Wanted') + ')',
      record: record
    });
  }

  // 3. Auto-tag Violation Records if expired insurance, expired PUC, or pending challans exist
  if (record.insurance && record.insurance.status === 'Expired') {
    routingResult.actions.push({
      type: 'AUTO_VIOLATION',
      violationType: 'Expired Insurance',
      expiry: record.insurance.expiry
    });
  }

  if (record.puc && record.puc.status === 'Expired') {
    routingResult.actions.push({
      type: 'AUTO_VIOLATION',
      violationType: 'Expired PUC',
      expiry: record.puc.expiry
    });
  }

  if (record.challans && record.challans.count > 0) {
    routingResult.actions.push({
      type: 'AUTO_VIOLATION',
      violationType: `Unpaid Challans (${record.challans.count})`,
      amount: record.challans.total_amount
    });
  }

  return routingResult;
}

// Make globally available
window.RoadVisionVehicle = {
  loadMockVehicleDatabase,
  lookupVehicleRecord,
  buildVerificationCardHTML,
  logPiiAccess,
  getPiiAuditLogs,
  processVehicleActionRouting,
  handleRevealOwnerClick
};
