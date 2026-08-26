// RoadVision API Client
// Handles all API calls to the backend with camera-based authentication

// Get API base URL from config
const API_BASE_URL = window.RoadVisionConfig ? window.RoadVisionConfig.API_BASE_URL : 'http://localhost:8000';

// Get current camera ID from localStorage
function getCurrentCameraId() {
  const cameraData = localStorage.getItem('roadvision_camera');
  if (cameraData) {
    try {
      const camera = JSON.parse(cameraData);
      return camera.id || 'CAM-001';
    } catch (e) {
      console.error('Error parsing camera data:', e);
    }
  }
  return 'CAM-001'; // Default camera
}

// Storage key for local reviews/corrections
const LOCAL_REVIEWS_KEY = 'roadvision_reviews';

/**
 * Helper to retrieve local operator reviews/corrections from localStorage.
 */
function getLocalReviews() {
  try {
    const raw = localStorage.getItem(LOCAL_REVIEWS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn('Failed to read local reviews:', e);
    return {};
  }
}

/**
 * Merge local review/correction states onto a list of detection objects.
 */
function mergeLocalReviews(detections) {
  const reviews = getLocalReviews();
  console.log('[DEBUG] mergeLocalReviews reading stored reviews:', reviews);
  return detections.map(det => {
    const cleanPlate = det.detected_plate ? det.detected_plate.replace(/\s+/g, '').toUpperCase() : '';
    // Check by id, string id, detected_plate, or clean plate
    const review = (det.id && reviews[det.id]) ||
                   (det.id && reviews[String(det.id)]) ||
                   (det.detected_plate && reviews[det.detected_plate]) ||
                   (cleanPlate && reviews[cleanPlate]);

    if (review) {
      console.log(`[DEBUG] Found matching review for ${det.detected_plate} (ID: ${det.id}):`, review.correct_plate);
      return {
        ...det,
        correct_plate: review.correct_plate,
        status: review.status,
        reviewed: true
      };
    }
    return det;
  });
}

/**
 * Mock fallback detections containing a mix of high, medium, and low confidence scores
 * to ensure all visual tiers (>85%, 60-85%, <60%) and the Review Queue work out-of-the-box.
 */
function getMockDetections() {
  return [
    {
      id: 101,
      detected_plate: "DL01CA1234",
      correct_plate: "DL 01 CA 1234",
      violation: "Speeding",
      confidence: 0.94,
      timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      bbox: [30, 40, 20, 10],
      vehicle_info: { registered: true, owner_name: "Aarav Sharma", vehicle_type: "Sedan", model: "Honda City" }
    },
    {
      id: 102,
      detected_plate: "MH12AB5678",
      correct_plate: null,
      violation: "Red Light Violation",
      confidence: 0.78,
      timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      bbox: [45, 35, 18, 9],
      vehicle_info: { registered: true, owner_name: "Priya Patel", vehicle_type: "SUV", model: "Hyundai Creta" }
    },
    {
      id: 103,
      detected_plate: "KA05XY9999",
      correct_plate: null,
      violation: "Wrong Way Driving",
      confidence: 0.52,
      timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
      bbox: [20, 50, 22, 11],
      vehicle_info: { registered: false, owner_name: null, vehicle_type: null, model: null }
    },
    {
      id: 104,
      detected_plate: "TN09BC4321",
      correct_plate: null,
      violation: "No Helmet",
      confidence: 0.45,
      timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
      bbox: [55, 60, 15, 8],
      vehicle_info: { registered: true, owner_name: "Karthik Raja", vehicle_type: "Two Wheeler", model: "Royal Enfield" }
    },
    {
      id: 105,
      detected_plate: "UP16Z0001",
      correct_plate: "UP 16 Z 0001",
      violation: null,
      confidence: 0.89,
      timestamp: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
      bbox: [35, 30, 19, 9],
      vehicle_info: { registered: true, owner_name: "Vikram Singh", vehicle_type: "Luxury SUV", model: "Fortuner" }
    }
  ];
}

// Camera API
const CameraAPI = {
  // Get all cameras
  async getAll() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/cameras`);
      const data = await response.json();
      return data.cameras;
    } catch (e) {
      return [
        { camera_id: 'CAM-001', name: 'Camera 1', location: 'Main Expressway North' },
        { camera_id: 'CAM-002', name: 'Camera 2', location: 'City Center Junction' }
      ];
    }
  },

  // Get camera info
  async get(cameraId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/cameras/${cameraId}`);
      const data = await response.json();
      return data.camera;
    } catch (e) {
      return { camera_id: cameraId, name: 'Camera 1', location: 'Main Expressway North' };
    }
  },

  // Update camera info
  async update(cameraId, cameraData) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/cameras/${cameraId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cameraData)
      });
      return await response.json();
    } catch (e) {
      return { success: true, camera: cameraData };
    }
  }
};

// Detection API
const DetectionAPI = {
  // Get detections for current camera (merged with local operator corrections)
  async getAll(violationsOnly = false, limit = 100) {
    const cameraId = getCurrentCameraId();
    let rawDetections = [];
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/detections/${cameraId}?violations_only=${violationsOnly}&limit=${limit}`
      );
      if (response.ok) {
        const data = await response.json();
        rawDetections = data.detections || [];
      } else {
        rawDetections = getMockDetections();
      }
    } catch (e) {
      console.warn('Backend API unreachable. Falling back to local mock detections.', e);
      rawDetections = getMockDetections();
    }

    if (violationsOnly) {
      rawDetections = rawDetections.filter(d => d.violation);
    }

    return mergeLocalReviews(rawDetections);
  },

  /**
   * Submit an operator correction/review decision for a detection item.
   *
   * Real Backend Requirement:
   *   Calls PATCH /api/detections/{id}/correct with payload { correct_plate: "...", status: "confirmed"|"rejected" }.
   * Demo Fallback:
   *   Persists correction in localStorage under 'roadvision_reviews' so that review decisions
   *   instantly update the UI across pages even without an active backend.
   */
  async correct(detectionIdOrPlate, correctedPlate, status = 'confirmed') {
    const key = String(detectionIdOrPlate);
    const cleanPlate = typeof detectionIdOrPlate === 'string' ? detectionIdOrPlate.replace(/\s+/g, '').toUpperCase() : '';

    // 1. Update localStorage for instant frontend reactivity & offline demo
    const reviews = getLocalReviews();
    const reviewData = {
      correct_plate: status === 'rejected' ? 'REJECTED/UNREADABLE' : correctedPlate,
      status: status,
      timestamp: new Date().toISOString()
    };

    reviews[key] = reviewData;
    if (cleanPlate) reviews[cleanPlate] = reviewData;

    try {
      localStorage.setItem(LOCAL_REVIEWS_KEY, JSON.stringify(reviews));
      console.log(`[DEBUG] Saved correction write for key='${key}', cleanPlate='${cleanPlate}':`, reviewData);
    } catch (e) {
      console.error('Failed to update local reviews store:', e);
    }

    // 2. Notify backend API endpoint if available (PATCH /api/detections/{id}/correct)
    try {
      const response = await fetch(`${API_BASE_URL}/api/detections/${detectionIdOrPlate}/correct`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correct_plate: status === 'rejected' ? null : correctedPlate,
          status: status
        })
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.info('Backend PATCH endpoint unavailable; saved to local demo store.', e);
    }

    return { success: true, key, status, correct_plate: correctedPlate };
  },

  /**
   * Get list of detections pending operator review (confidence below threshold and not yet reviewed).
   */
  async getPendingReviewItems() {
    const threshold = (window.RoadVisionConfig && window.RoadVisionConfig.DETECTION_CONFIDENCE_THRESHOLD) ? window.RoadVisionConfig.DETECTION_CONFIDENCE_THRESHOLD : 0.6;
    const all = await this.getAll(false, 200);
    return all.filter(det => {
      if (det.reviewed) return false;
      if (det.correct_plate && det.correct_plate !== 'null') return false;
      const conf = det.confidence <= 1 ? det.confidence : det.confidence / 100;
      return conf < threshold;
    });
  },

  /**
   * Get pending review items count for sidebar badge.
   */
  async getPendingCount() {
    const pending = await this.getPendingReviewItems();
    return pending.length;
  },

  // Add detection
  async add(detection) {
    const cameraId = getCurrentCameraId();
    try {
      const response = await fetch(`${API_BASE_URL}/api/detections/${cameraId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(detection)
      });
      return await response.json();
    } catch (e) {
      return { success: true, detection };
    }
  },

  // Clear all detections
  async clearAll() {
    const cameraId = getCurrentCameraId();
    try {
      localStorage.removeItem(LOCAL_REVIEWS_KEY);
      const response = await fetch(`${API_BASE_URL}/api/detections/${cameraId}`, {
        method: 'DELETE'
      });
      return await response.json();
    } catch (e) {
      localStorage.removeItem(LOCAL_REVIEWS_KEY);
      return { success: true };
    }
  },

  // Get stats
  async getStats() {
    const cameraId = getCurrentCameraId();
    try {
      const response = await fetch(`${API_BASE_URL}/api/stats/${cameraId}`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.stats) return data.stats;
      }
    } catch (e) {
      console.warn('Backend stats API failed, computing from current dataset...', e);
    }

    const all = await this.getAll();
    if (!all || all.length === 0) {
      return { total_detections: 0, violations: 0, legal_plates: 0, avg_confidence: 0 };
    }

    const violations = all.filter(d => d.violation && d.violation !== 'None' && d.violation !== 'None (Legal)').length;
    const totalConf = all.reduce((sum, d) => {
      const c = (d.confidence !== undefined && d.confidence <= 1) ? d.confidence * 100 : (d.confidence || 0);
      return sum + c;
    }, 0);
    const avgConf = (totalConf / all.length).toFixed(1);

    return {
      total_detections: all.length,
      violations: violations,
      legal_plates: all.length - violations,
      avg_confidence: parseFloat(avgConf)
    };
  }
};

// Process frame (live monitoring)
async function processFrame(imageBlob) {
  const formData = new FormData();
  formData.append('file', imageBlob, 'frame.jpg');

  const response = await fetch(`${API_BASE_URL}/api/process-frame`, {
    method: 'POST',
    body: formData
  });

  const data = await response.json();
  return data.detections;
}

// Analyze video
async function analyzeVideo(videoFile) {
  const formData = new FormData();
  formData.append('video', videoFile);

  const response = await fetch(`${API_BASE_URL}/analyze-video`, {
    method: 'POST',
    body: formData
  });

  const data = await response.json();
  return data.detections;
}

// Export API
window.RoadVisionAPI = {
  Camera: CameraAPI,
  Detection: DetectionAPI,
  processFrame,
  analyzeVideo,
  getCurrentCameraId
};

