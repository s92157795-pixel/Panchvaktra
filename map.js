/**
 * Panchvaktra Human Welfare Foundation
 * Weekly On-field Drives Interactive Map Component
 * Accurately renders India states, drive hubs, pins, leader lines, and zoom controls.
 */
(() => {
  'use strict';

  // 1. Pointed drive states: Rajasthan, Bihar, Delhi, Gujarat only
  const CITIES = [
    {
      id: 'rajasthan',
      stateId: 'rj',
      name: 'Rajasthan',
      x: 130.0,
      y: 245.0,
      lineX: 52,
      lineY: 195,
      textX: 45,
      textY: 198,
      anchor: 'end',
      state: 'Rajasthan',
      drive: 'Rural Child Education, Malnutrition Relief & Desert Family Outreach',
      stat: '420+ Families Supported'
    },
    {
      id: 'delhi',
      stateId: 'dl',
      name: 'Delhi',
      x: 186.3,
      y: 210.4,
      lineX: 255,
      lineY: 165,
      textX: 262,
      textY: 168,
      anchor: 'start',
      state: 'NCT of Delhi',
      drive: 'Central Distribution Hub: Food Kits, Stationery & Primary Health Camps',
      stat: '350+ Families Supported'
    },
    {
      id: 'bihar',
      stateId: 'br',
      name: 'Bihar',
      x: 365.0,
      y: 272.0,
      lineX: 435,
      lineY: 235,
      textX: 442,
      textY: 238,
      anchor: 'start',
      state: 'Bihar',
      drive: 'Flood Rehabilitation, Slum Children Literacy Drives & Health Camps',
      stat: '380+ Families Supported'
    },
    {
      id: 'gujarat',
      stateId: 'gj',
      name: 'Gujarat',
      x: 75.0,
      y: 345.0,
      lineX: 38,
      lineY: 410,
      textX: 30,
      textY: 414,
      anchor: 'end',
      state: 'Gujarat',
      drive: 'Coastal Community Care, Youth Skill Programs & Emergency Ration Aid',
      stat: '310+ Families Supported'
    }
  ];

  // Drive states to highlight: only Rajasthan (rj), Bihar (br), Delhi (dl), Gujarat (gj)
  const HIGHLIGHT_STATES = ['rj', 'br', 'dl', 'gj'];

  // Route paths connecting the 4 drive hubs (curved arcs across Gujarat, Rajasthan, Delhi, Bihar)
  const ROUTES = [
    'M 75 345 Q 92 290 130 245',        // Gujarat to Rajasthan
    'M 130 245 Q 155 220 186.3 210.4',    // Rajasthan to Delhi
    'M 186.3 210.4 Q 275 228 365 272'     // Delhi to Bihar
  ];

  // Geographic center of Rajasthan, Gujarat, Delhi, and Bihar drive region
  const REGION_CENTER_X = 215;
  const REGION_CENTER_Y = 275;

  // Zoom preset positions centered directly on the 4 drive states area
  const ZOOM_LEVELS = [
    { scale: 1.0, x: 0, y: 0 },
    { scale: 1.55, x: 306 - REGION_CENTER_X * 1.55, y: 348 - REGION_CENTER_Y * 1.55 },
    { scale: 2.25, x: 306 - REGION_CENTER_X * 2.25, y: 348 - REGION_CENTER_Y * 2.25 },
    { scale: 3.1, x: 306 - REGION_CENTER_X * 3.1, y: 348 - REGION_CENTER_Y * 3.1 }
  ];

  let currentLevel = 0;
  let scale = 1.0;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let hasMoved = false;
  let lastMousePos = null;

  function initMap() {
    const svg = document.getElementById('india-map-svg');
    const zoomGroup = document.getElementById('map-zoom-content');
    const statesGroup = document.getElementById('map-states-group');
    const routesGroup = document.getElementById('map-routes-group');
    const pinsGroup = document.getElementById('map-pins-group');

    if (!svg || !zoomGroup || !statesGroup || !window.INDIA_MAP_DATA) {
      return;
    }

    // 1. Render all India states
    const locations = window.INDIA_MAP_DATA.locations || [];
    statesGroup.innerHTML = '';

    locations.forEach(loc => {
      const isDriveState = HIGHLIGHT_STATES.includes(loc.id);
      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.setAttribute('d', loc.path);
      pathEl.setAttribute('id', `state-${loc.id}`);
      pathEl.setAttribute('data-name', loc.name);

      // Deep teal/slate palette matching user image
      if (isDriveState) {
        pathEl.setAttribute('fill', '#224d6d');
        pathEl.setAttribute('stroke', 'rgba(100, 180, 230, 0.65)');
        pathEl.setAttribute('stroke-width', '0.85');
        pathEl.style.cursor = 'pointer';
        pathEl.classList.add('transition-colors', 'duration-300');
        pathEl.addEventListener('mouseenter', () => {
          pathEl.setAttribute('fill', '#2d6791');
          const matchingCity = CITIES.find(c => c.stateId === loc.id);
          if (matchingCity) showCityDetail(matchingCity);
        });
        pathEl.addEventListener('mouseleave', () => {
          pathEl.setAttribute('fill', '#224d6d');
        });
        pathEl.addEventListener('click', (e) => {
          e.stopPropagation();
          const matchingCity = CITIES.find(c => c.stateId === loc.id);
          if (matchingCity) {
            showCityDetail(matchingCity);
            zoomToRegion(matchingCity.x, matchingCity.y, 2.25);
          }
        });
      } else {
        pathEl.setAttribute('fill', '#193952');
        pathEl.setAttribute('stroke', 'rgba(255, 255, 255, 0.16)');
        pathEl.setAttribute('stroke-width', '0.6');
        pathEl.style.cursor = 'default';
        pathEl.classList.add('transition-colors', 'duration-300');
        pathEl.addEventListener('mouseenter', () => {
          pathEl.setAttribute('fill', '#204663');
        });
        pathEl.addEventListener('mouseleave', () => {
          pathEl.setAttribute('fill', '#193952');
        });
      }

      const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      titleEl.textContent = loc.name + (isDriveState ? ' (Active Weekly Drive Region)' : '');
      pathEl.appendChild(titleEl);

      statesGroup.appendChild(pathEl);
    });

    // 2. Render connecting routes
    if (routesGroup) {
      routesGroup.innerHTML = '';
      ROUTES.forEach(d => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#38bdf8');
        path.setAttribute('stroke-width', '1.3');
        path.setAttribute('stroke-dasharray', '3.5 2.5');
        path.setAttribute('opacity', '0.85');
        routesGroup.appendChild(path);
      });
    }

    // 3. Render city pins, leader lines, and labels
    if (pinsGroup) {
      pinsGroup.innerHTML = '';

      CITIES.forEach(city => {
        const cityG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        cityG.setAttribute('id', `city-pin-${city.id}`);
        cityG.setAttribute('class', 'group cursor-pointer');

        // Leader line
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', city.x);
        line.setAttribute('y1', city.y);
        line.setAttribute('x2', city.lineX);
        line.setAttribute('y2', city.lineY);
        line.setAttribute('stroke', 'rgba(255, 255, 255, 0.85)');
        line.setAttribute('stroke-width', '1.2');
        line.setAttribute('stroke-linecap', 'round');
        cityG.appendChild(line);

        // Leader line termination dot at label end
        const endDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        endDot.setAttribute('cx', city.lineX);
        endDot.setAttribute('cy', city.lineY);
        endDot.setAttribute('r', '1.8');
        endDot.setAttribute('fill', '#ffffff');
        cityG.appendChild(endDot);

        // Outer animated ping ring
        const pingCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        pingCircle.setAttribute('cx', city.x);
        pingCircle.setAttribute('cy', city.y);
        pingCircle.setAttribute('r', '7.5');
        pingCircle.setAttribute('fill', 'none');
        pingCircle.setAttribute('stroke', '#38bdf8');
        pingCircle.setAttribute('stroke-width', '1.5');
        pingCircle.setAttribute('class', 'animate-ping map-pulse-ring origin-center opacity-75');
        cityG.appendChild(pingCircle);

        // Middle ring
        const midCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        midCircle.setAttribute('cx', city.x);
        midCircle.setAttribute('cy', city.y);
        midCircle.setAttribute('r', '4.5');
        midCircle.setAttribute('fill', 'rgba(56, 189, 248, 0.4)');
        midCircle.setAttribute('stroke', '#ffffff');
        midCircle.setAttribute('stroke-width', '1.1');
        cityG.appendChild(midCircle);

        // Center solid white dot
        const centerDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        centerDot.setAttribute('cx', city.x);
        centerDot.setAttribute('cy', city.y);
        centerDot.setAttribute('r', '2.2');
        centerDot.setAttribute('fill', '#ffffff');
        cityG.appendChild(centerDot);

        // City Label Text with high contrast shadow
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', city.textX);
        text.setAttribute('y', city.textY);
        text.setAttribute('fill', '#ffffff');
        text.setAttribute('font-family', 'sans-serif');
        text.setAttribute('font-weight', '800');
        text.setAttribute('font-size', '13.5');
        text.setAttribute('text-anchor', city.anchor);
        text.setAttribute('filter', 'url(#label-shadow)');
        text.textContent = city.name;
        cityG.appendChild(text);

        // Click / Hover interaction to show city details and zoom in
        cityG.addEventListener('click', (e) => {
          e.stopPropagation();
          showCityDetail(city);
          zoomToRegion(city.x, city.y, 2.25);
        });

        cityG.addEventListener('mouseenter', () => {
          midCircle.setAttribute('r', '6');
          midCircle.setAttribute('fill', '#38bdf8');
          text.setAttribute('fill', '#7dd3fc');
          showCityDetail(city);
        });

        cityG.addEventListener('mouseleave', () => {
          midCircle.setAttribute('r', '4.5');
          midCircle.setAttribute('fill', 'rgba(56, 189, 248, 0.4)');
          text.setAttribute('fill', '#ffffff');
        });

        pinsGroup.appendChild(cityG);
      });
    }

    // 4. Attach Zoom and Pan Controls
    setupZoomControls(svg, zoomGroup);
  }

  function updateTransform(animated = true, duration = '0.35s') {
    const zoomGroup = document.getElementById('map-zoom-content');
    if (!zoomGroup) return;

    zoomGroup.style.transformOrigin = '0 0';

    if (animated) {
      zoomGroup.style.transition = `transform ${duration} cubic-bezier(0.16, 1, 0.3, 1)`;
    } else {
      zoomGroup.style.transition = 'none';
    }
    zoomGroup.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }

  // Exact cursor-centered zoom: keeps the point directly under the cursor stationary
  function zoomAtPoint(clientX, clientY, factor, animated = true, duration = '0.15s') {
    const svg = document.getElementById('india-map-svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();

    // Coordinates relative to the SVG container box
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    const oldScale = scale;
    let newScale = oldScale * factor;

    // Constrain scale between 1.0 (overview) and 6.0 (deep zoom)
    newScale = Math.max(1.0, Math.min(6.0, newScale));

    if (Math.abs(newScale - oldScale) < 0.001) return;

    if (newScale <= 1.005) {
      scale = 1.0;
      panX = 0;
      panY = 0;
      currentLevel = 0;
    } else {
      // Invariant: mouseX = panX + contentX * scale
      // When scale changes, keep (mouseX, mouseY) fixed on the content
      panX = mouseX - (mouseX - panX) * (newScale / oldScale);
      panY = mouseY - (mouseY - panY) * (newScale / oldScale);
      scale = newScale;
    }

    updateTransform(animated, duration);
  }

  function zoomToRegion(cityX, cityY, targetScale = 2.25) {
    const svg = document.getElementById('india-map-svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();

    scale = targetScale;
    const contentX = (cityX / 612) * rect.width;
    const contentY = (cityY / 696) * rect.height;

    panX = rect.width / 2 - contentX * scale;
    panY = rect.height / 2 - contentY * scale;

    updateTransform(true, '0.5s');
  }

  function zoomIn() {
    const svg = document.getElementById('india-map-svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();

    // If cursor was recently over map, zoom at cursor; otherwise center on Rajasthan/Delhi/Gujarat/Bihar
    const targetX = lastMousePos ? lastMousePos.x : (rect.left + (REGION_CENTER_X / 612) * rect.width);
    const targetY = lastMousePos ? lastMousePos.y : (rect.top + (REGION_CENTER_Y / 696) * rect.height);

    zoomAtPoint(targetX, targetY, 1.35, true, '0.35s');
  }

  function zoomOut() {
    const svg = document.getElementById('india-map-svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();

    const targetX = lastMousePos ? lastMousePos.x : (rect.left + (REGION_CENTER_X / 612) * rect.width);
    const targetY = lastMousePos ? lastMousePos.y : (rect.top + (REGION_CENTER_Y / 696) * rect.height);

    zoomAtPoint(targetX, targetY, 0.74, true, '0.35s');
  }

  function resetZoom() {
    scale = 1.0;
    panX = 0;
    panY = 0;
    currentLevel = 0;
    lastMousePos = null;
    updateTransform(true, '0.45s');
  }

  function setupZoomControls(svg, zoomGroup) {
    const btnIn = document.getElementById('map-zoom-in');
    const btnOut = document.getElementById('map-zoom-out');
    const btnReset = document.getElementById('map-zoom-reset');

    if (btnIn) btnIn.addEventListener('click', zoomIn);
    if (btnOut) btnOut.addEventListener('click', zoomOut);
    if (btnReset) btnReset.addEventListener('click', resetZoom);

    // Track cursor position anywhere on map for cursor-centered actions
    svg.addEventListener('mousemove', (e) => {
      lastMousePos = { x: e.clientX, y: e.clientY };
      if (!isDragging) return;
      hasMoved = true;
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      updateTransform(false);
    });

    svg.addEventListener('mouseenter', (e) => {
      lastMousePos = { x: e.clientX, y: e.clientY };
    });

    // Mouse drag-to-pan
    svg.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      isDragging = true;
      hasMoved = false;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
      svg.style.cursor = 'grabbing';
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        svg.style.cursor = 'default';
      }
    });

    // Allow natural, silky-smooth webpage scrolling across the map!
    // Wheel zoom is only activated when Ctrl or Command is pressed (industry standard UX).
    let hintTimeout = null;
    svg.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.87;
        zoomAtPoint(e.clientX, e.clientY, factor, true, '0.12s');
      } else {
        // Show gentle, non-blocking toast hint if scrolling over map without Ctrl
        const hint = document.getElementById('map-scroll-hint');
        if (hint) {
          hint.style.opacity = '1';
          clearTimeout(hintTimeout);
          hintTimeout = setTimeout(() => {
            hint.style.opacity = '0';
          }, 1400);
        }
      }
    }, { passive: false });

    // Double click to zoom directly into the clicked spot
    svg.addEventListener('dblclick', (e) => {
      e.preventDefault();
      zoomAtPoint(e.clientX, e.clientY, 1.6, true, '0.45s');
    });

    // Touch pinch-to-zoom and pan support with smooth mobile page scrolling
    let touchDistance = 0;
    let touchMidX = 0;
    let touchMidY = 0;
    let touchStartX = 0;
    let touchStartY = 0;

    svg.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        // Only engage pan if map is zoomed in beyond default scale (scale > 1.05)
        // At default overview (scale <= 1.05), let vertical swipe scroll page smoothly!
        if (scale > 1.05) {
          isDragging = true;
          touchStartX = e.touches[0].clientX - panX;
          touchStartY = e.touches[0].clientY - panY;
        } else {
          isDragging = false;
        }
      } else if (e.touches.length === 2) {
        isDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchDistance = Math.hypot(dx, dy);
        touchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        touchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      }
    }, { passive: true });

    svg.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && isDragging && scale > 1.05) {
        panX = e.touches[0].clientX - touchStartX;
        panY = e.touches[0].clientY - touchStartY;
        updateTransform(false);
      } else if (e.touches.length === 2 && touchDistance > 0) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const newDist = Math.hypot(dx, dy);
        const factor = newDist / touchDistance;
        touchDistance = newDist;
        zoomAtPoint(touchMidX, touchMidY, factor, false);
      }
    }, { passive: true });

    svg.addEventListener('touchend', () => {
      isDragging = false;
      touchDistance = 0;
    });
  }

  function showCityDetail(city) {
    const detailBox = document.getElementById('active-city-info');
    if (!detailBox) return;

    detailBox.innerHTML = `
      <div class="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-pink-500/25 border border-pink-400 text-pink-200 font-black text-[10px] uppercase tracking-wider mb-1">
        <span class="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse"></span>
        <span>${city.name} Drive Hub</span>
      </div>
      <h4 class="text-sm sm:text-base font-black text-white leading-tight">${city.name} (${city.state})</h4>
      <p class="text-[11px] sm:text-xs text-pink-100 font-bold leading-snug mt-1">${city.drive}</p>
      <span class="inline-block mt-2 text-[10.5px] font-black text-pink-300 uppercase tracking-widest">Active Impact: ${city.stat}</span>
    `;
    detailBox.classList.remove('opacity-0');
    detailBox.classList.add('opacity-100');
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMap);
  } else {
    initMap();
  }
})();
