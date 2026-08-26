/**
 * RoadVision — Component Loader
 * Fetches sidebar.html and header.html, injects them into the page,
 * and highlights the active sidebar link based on the current URL.
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Determine current page key from filename
  const path = window.location.pathname;
  const filename = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
  const pageKey = filename.replace('.html', '') || 'index';

  // Page titles map
  const pageTitles = {
    index: 'Dashboard',
    monitoring: 'Live Monitoring',
    detections: 'Detections',
    history: 'History',
    'review-queue': 'Review Queue',
    'audit-log': 'Security Audit Log'
  };

  // Check current session
  const currentUser = window.RoadVisionAuth ? window.RoadVisionAuth.getUser() : null;

  // Load sidebar
  const sidebarSlot = document.getElementById('sidebar-slot');
  if (sidebarSlot) {
    try {
      const res = await fetch('components/sidebar.html');
      const html = await res.text();
      sidebarSlot.innerHTML = html;

      // Highlight active link
      const links = sidebarSlot.querySelectorAll('.sidebar-nav a');
      links.forEach(link => {
        if (link.getAttribute('data-page') === pageKey) {
          link.classList.add('active');
        }
      });

      // Show Audit Log nav link for Admin only
      const auditNavLink = sidebarSlot.querySelector('#auditLogNavLink');
      if (auditNavLink && currentUser && currentUser.role === 'Admin') {
        auditNavLink.style.display = 'flex';
      }

      // Wire logout button
      const logoutBtn = sidebarSlot.querySelector('.sidebar-logout');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (window.RoadVisionAuth) window.RoadVisionAuth.logout();
          else window.location.href = 'login.html';
        });
      }

      // Update Active Camera Node text in sidebar mini-widget
      const activeCamEl = sidebarSlot.querySelector('#sidebarActiveCamera');
      if (activeCamEl) {
        try {
          const rawCam = localStorage.getItem('roadvision_camera');
          if (rawCam) {
            const camObj = JSON.parse(rawCam);
            activeCamEl.textContent = `${camObj.name || 'Camera 1'} • ${camObj.location || 'Expressway'}`;
          }
        } catch (e) {
          activeCamEl.textContent = 'Camera 1 • Expressway';
        }
      }

      // Update Review Queue Badge Count
      updateReviewQueueBadgeCount();
    } catch (e) {
      console.error('Failed to load sidebar:', e);
    }
  }

  // Load header
  const headerSlot = document.getElementById('header-slot');
  if (headerSlot) {
    try {
      const res = await fetch('components/header.html');
      const html = await res.text();
      headerSlot.innerHTML = html;

      // Set page title
      const titleEl = headerSlot.querySelector('#page-title');
      if (titleEl && pageTitles[pageKey]) {
        titleEl.textContent = pageTitles[pageKey];
      }

      // Load camera info from localStorage
      const cameraData = localStorage.getItem('roadvision_camera');
      const cameraNameEl = headerSlot.querySelector('#cameraName');
      const cameraLocEl = headerSlot.querySelector('#cameraLocation');

      if (cameraNameEl && cameraLocEl) {
        if (cameraData) {
          try {
            const camera = JSON.parse(cameraData);
            cameraNameEl.textContent = camera.name || 'Camera 1';
            cameraLocEl.textContent = camera.location || 'Unknown Location';
          } catch (e) {
            console.error('Error loading camera data:', e);
          }
        } else {
          cameraLocEl.textContent = 'Click to set location';
        }
      }

      // ---- Camera Dropdown Wiring ----
      initCameraDropdown(headerSlot, cameraData);

      // Hide Camera Settings link for non-Admin roles
      const cameraSettingsItem = headerSlot.querySelector('#cameraSettingsDropdownItem');
      const cameraSettingsDivider = headerSlot.querySelector('#cameraSettingsDivider');
      if (currentUser && currentUser.role !== 'Admin') {
        if (cameraSettingsItem) cameraSettingsItem.style.display = 'none';
        if (cameraSettingsDivider) cameraSettingsDivider.style.display = 'none';
      }

      // Wire header logout button
      const headerLogoutBtn = headerSlot.querySelector('.header-logout-btn');
      if (headerLogoutBtn) {
        headerLogoutBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (window.RoadVisionAuth) window.RoadVisionAuth.logout();
          else {
            sessionStorage.clear();
            window.location.href = 'login.html';
          }
        });
      }

      // ---- Sidebar Toggle & Drawer Wiring ----
      initSidebarDrawer();

    } catch (e) {
      console.error('Failed to load header:', e);
    }
  }

});

/**
 * Initialize Sidebar Toggle / Drawer behavior.
 * When clicking the 3-bar hamburger button, toggles the sidebar drawer pop-out.
 */
function initSidebarDrawer() {
  const toggleBtn = document.getElementById('sidebarToggleBtn');
  const closeBtn = document.getElementById('sidebarCloseBtn');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');

  if (!toggleBtn || !sidebar) return;

  function openSidebar() {
    sidebar.classList.add('open');
    if (backdrop) backdrop.classList.add('active');
    document.body.classList.add('sidebar-open');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
    document.body.classList.remove('sidebar-open');
  }

  function toggleSidebar() {
    if (sidebar.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  toggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleSidebar();
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeSidebar();
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeSidebar();
    });
  }

  // Also close drawer on nav link click
  sidebar.querySelectorAll('.sidebar-nav a').forEach(link => {
    link.addEventListener('click', () => {
      closeSidebar();
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSidebar();
  });
}

/**
 * Initialize the camera switcher dropdown in the header.
 * Reads the active camera from localStorage and highlights it,
 * handles open/close, and switches camera context on selection.
 */
function initCameraDropdown(headerSlot, cameraDataJSON) {
  const toggle = headerSlot.querySelector('#cameraDropdownToggle');
  const menu = headerSlot.querySelector('#cameraDropdownMenu');
  const arrow = headerSlot.querySelector('#cameraDropdownArrow');
  if (!toggle || !menu) return;

  // Determine active camera ID
  let activeCamId = 'CAM-001';
  if (cameraDataJSON) {
    try {
      const parsed = JSON.parse(cameraDataJSON);
      activeCamId = parsed.id || 'CAM-001';
    } catch (_) {}
  }

  // Highlight active camera item
  function updateActiveCheck() {
    menu.querySelectorAll('.camera-dropdown-item[data-cam-id]').forEach(item => {
      const check = item.querySelector('.camera-dropdown-check');
      if (check) {
        check.style.display = item.dataset.camId === activeCamId ? 'inline' : 'none';
      }
      item.classList.toggle('active', item.dataset.camId === activeCamId);
    });
  }
  updateActiveCheck();

  // Toggle dropdown
  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isOpen = menu.classList.toggle('open');
    if (arrow) arrow.style.transform = isOpen ? 'rotate(180deg)' : '';
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!headerSlot.querySelector('#cameraDropdown').contains(e.target)) {
      menu.classList.remove('open');
      if (arrow) arrow.style.transform = '';
    }
  });

  // Camera selection handler
  menu.querySelectorAll('.camera-dropdown-item[data-cam-id]').forEach(item => {
    item.addEventListener('click', () => {
      const camId = item.dataset.camId;
      const camName = item.dataset.camName;
      const camLoc = item.dataset.camLoc;

      // Update localStorage
      const existing = JSON.parse(localStorage.getItem('roadvision_camera') || '{}');
      const updated = {
        ...existing,
        id: camId,
        name: camName,
        location: camLoc
      };
      localStorage.setItem('roadvision_camera', JSON.stringify(updated));

      // Update header display
      const nameEl = headerSlot.querySelector('#cameraName');
      const locEl = headerSlot.querySelector('#cameraLocation');
      if (nameEl) nameEl.textContent = camName;
      if (locEl) locEl.textContent = camLoc;

      // Update active state
      activeCamId = camId;
      updateActiveCheck();

      // Close dropdown
      menu.classList.remove('open');
      if (arrow) arrow.style.transform = '';

      // Reload page to refresh data for the new camera context
      window.location.reload();
    });
  });
}

/**
 * Update the Review Queue badge count in the sidebar.
 * Reads pending items count using RoadVisionAPI or local storage.
 */
async function updateReviewQueueBadgeCount() {
  const badge = document.getElementById('reviewQueueCount');
  if (!badge) return;

  try {
    let pendingCount = 0;
    if (window.RoadVisionAPI && window.RoadVisionAPI.Detection && typeof window.RoadVisionAPI.Detection.getPendingCount === 'function') {
      pendingCount = await window.RoadVisionAPI.Detection.getPendingCount();
    } else {
      // Fallback local calculation
      const reviews = JSON.parse(localStorage.getItem('roadvision_reviews') || '{}');
      const threshold = (window.RoadVisionConfig && window.RoadVisionConfig.DETECTION_CONFIDENCE_THRESHOLD) ? window.RoadVisionConfig.DETECTION_CONFIDENCE_THRESHOLD : 0.6;
      let detections = [];
      if (window.RoadVisionAPI && window.RoadVisionAPI.Detection) {
        detections = await window.RoadVisionAPI.Detection.getAll(false, 100);
      }
      pendingCount = detections.filter(d => {
        const idKey = d.id || d.detected_plate;
        const review = reviews[idKey];
        if (review) return false; // Reviewed already
        if (d.correct_plate && d.correct_plate !== 'null') return false;
        const conf = (d.confidence <= 1) ? d.confidence : d.confidence / 100;
        return conf < threshold;
      }).length;
    }

    badge.textContent = pendingCount;
    badge.style.display = pendingCount > 0 ? 'inline-flex' : 'none';
  } catch (e) {
    console.warn('Failed to update review queue badge count:', e);
  }
}

window.updateReviewQueueBadgeCount = updateReviewQueueBadgeCount;

