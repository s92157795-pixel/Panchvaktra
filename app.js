(() => {
  'use strict';

  const TOTAL_FRAMES = 300;
  const canvas = document.getElementById('animation-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });

  const images = new Array(TOTAL_FRAMES);
  const loaded = new Uint8Array(TOTAL_FRAMES);

  // NGO Watermark emblem to seamlessly cover the Gemini watermark in the hero animation
  const ngoLogo = new Image();
  let ngoLogoLoaded = false;
  const loadNgoLogo = () => {
    return new Promise((resolve) => {
      if (ngoLogo.complete && ngoLogo.naturalWidth > 0) {
        ngoLogoLoaded = true;
        resolve();
        return;
      }
      ngoLogo.onload = () => {
        ngoLogoLoaded = true;
        if (lastDrawnIndex !== -1) {
          lastDrawnIndex = -1;
          renderFrame();
        }
        resolve();
      };
      ngoLogo.onerror = () => {
        resolve();
      };
      ngoLogo.src = 'logos/ngo_watermark.png';
    });
  };

  let currentProgress = 0;
  let targetProgress = 0;
  let lastDrawnIndex = -1;
  let dpr = 1;

  const getFrameUrl = (index) => {
    const num = String(index + 1).padStart(4, '0');
    return `frames/frame_${num}.jpg`;
  };

  const resizeCanvas = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const winW = Math.max(window.innerWidth, document.documentElement.clientWidth);
    const winH = Math.max(window.innerHeight, document.documentElement.clientHeight);
    canvas.width = Math.round(winW * dpr);
    canvas.height = Math.round(winH * dpr);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    lastDrawnIndex = -1; // force redraw on next tick
  };

  const getScrollProgress = () => {
    const scrollTop =
      window.scrollY ||
      window.pageYOffset ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0;

    const track = document.getElementById('scroll-track');
    const winHeight = window.innerHeight || document.documentElement.clientHeight || 1;
    let maxScroll = 1;

    if (track) {
      maxScroll = Math.max(1, track.offsetHeight - winHeight);
    } else {
      const docHeight = Math.max(
        document.body.scrollHeight || 0,
        document.documentElement.scrollHeight || 0,
        document.body.offsetHeight || 0,
        document.documentElement.offsetHeight || 0
      );
      maxScroll = Math.max(1, docHeight - winHeight);
    }

    return Math.min(1, Math.max(0, scrollTop / maxScroll));
  };

  const getNearestLoadedIndex = (target) => {
    if (loaded[target]) return target;
    for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
      if (target - offset >= 0 && loaded[target - offset]) return target - offset;
      if (target + offset < TOTAL_FRAMES && loaded[target + offset]) return target + offset;
    }
    return -1;
  };

  const renderFrame = () => {
    // Complete 3D scroll animation by ~85% of track so it STICKS at the end
    const animProgress = Math.min(1, Math.max(0, currentProgress / 0.85));
    const rawTarget = Math.min(
      TOTAL_FRAMES - 1,
      Math.max(0, Math.round(animProgress * (TOTAL_FRAMES - 1)))
    );
    const indexToDraw = getNearestLoadedIndex(rawTarget);

    if (indexToDraw === -1) return;
    if (indexToDraw === lastDrawnIndex) return;

    const img = images[indexToDraw];
    if (!img) return;

    const imgWidth = img.naturalWidth || 1920;
    const imgHeight = img.naturalHeight || 1080;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    // Cover math: fill canvas while maintaining 16:9 aspect ratio
    const hRatio = canvasWidth / imgWidth;
    const vRatio = canvasHeight / imgHeight;
    const ratio = Math.max(hRatio, vRatio);

    const drawWidth = Math.ceil(imgWidth * ratio) + 2;
    const drawHeight = Math.ceil(imgHeight * ratio) + 2;
    const drawX = Math.floor((canvasWidth - drawWidth) / 2);
    const drawY = Math.floor((canvasHeight - drawHeight) / 2);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

    // Overlay NGO emblem logo directly over the watermark area (center: 1742, 888 on 1920x1080)
    if (ngoLogoLoaded || (ngoLogo.complete && ngoLogo.naturalWidth > 0)) {
      const logoSize = Math.round(106 * ratio);
      const logoX = Math.round(drawX + 1742 * ratio - logoSize / 2);
      const logoY = Math.round(drawY + 888 * ratio - logoSize / 2);
      ctx.drawImage(ngoLogo, logoX, logoY, logoSize, logoSize);
    }

    lastDrawnIndex = indexToDraw;
  };

  const heroFadeElements = document.querySelectorAll('.hero-fade-element');
  const videoPopupContainer = document.getElementById('video-popup-container');
  const videoPopupCard = document.getElementById('video-popup-card');
  const videoElement = document.getElementById('panchvaktra-video');

  // Stage 3: 5 Big Boxes slider controls
  const stage3Container = document.getElementById('stage3-container');
  const stage3Track = document.getElementById('stage3-track');
  const stage3PrevBtn = document.getElementById('stage3-prev-btn');
  const stage3NextBtn = document.getElementById('stage3-next-btn');
  const stage3Dots = document.querySelectorAll('.stage3-dot-indicator');
  let stage3CurrentIndex = 0; // 0 = Boxes 1-3, 1 = Boxes 2-4, 2 = Boxes 3-5

  const getStage3StepWidth = () => {
    if (!stage3Track) return 0;
    const firstBox = stage3Track.querySelector('.stage3-big-box');
    if (!firstBox) return 0;
    const gap = parseFloat(getComputedStyle(stage3Track).gap) || 20;
    return firstBox.offsetWidth + gap;
  };

  const setStage3Slide = (index, smooth = true) => {
    if (!stage3Track) return;
    stage3CurrentIndex = Math.max(0, Math.min(2, index));
    const step = getStage3StepWidth();
    const shift = stage3CurrentIndex * step;
    stage3Track.style.transition = smooth ? 'transform 0.5s cubic-bezier(0.2, 0.9, 0.3, 1)' : 'none';
    stage3Track.style.transform = `translateX(-${shift}px)`;
    if (stage3Dots && stage3Dots.length) {
      stage3Dots.forEach((dot, idx) => {
        dot.classList.toggle('is-active', idx === stage3CurrentIndex);
      });
    }
  };

  // Always reset slide to first 3 boxes on initial script run, DOM load, and window refresh
  setStage3Slide(0, false);
  window.addEventListener('load', () => {
    setStage3Slide(0, false);
  });
  window.addEventListener('resize', () => {
    setStage3Slide(stage3CurrentIndex, false);
  });

  if (stage3PrevBtn) {
    stage3PrevBtn.addEventListener('click', () => {
      setStage3Slide(stage3CurrentIndex - 1, true);
    });
  }

  if (stage3NextBtn) {
    stage3NextBtn.addEventListener('click', () => {
      setStage3Slide(stage3CurrentIndex + 1, true);
    });
  }

  if (stage3Dots && stage3Dots.length) {
    stage3Dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        const idx = parseInt(dot.getAttribute('data-index') || '0', 10);
        setStage3Slide(idx, true);
      });
    });
  }

  // Configure video to be muted, looped, and auto-restart on ended
  if (videoElement) {
    videoElement.muted = true;
    videoElement.defaultMuted = true;
    videoElement.loop = true;
    videoElement.volume = 0;

    videoElement.addEventListener('ended', () => {
      videoElement.currentTime = 0;
      videoElement.play().catch(() => {});
    });

    // Try muted playback immediately
    videoElement.play().catch(() => {});
  }

  const updateHeroCardFade = () => {
    const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    const winH = window.innerHeight || 800;
    const track = document.getElementById('scroll-track');
    const maxScroll = track ? Math.max(1, track.offsetHeight - winH) : Math.max(1, winH * 3);

    // 1. Stage 1: The two hero cards & scroll down button fade out within first ~12% of scroll
    const s1End = Math.min(360, maxScroll * 0.12);
    const factor = Math.min(1, Math.max(0, scrollY / s1End));
    const opacity = Math.max(0, 1 - factor * 1.25);
    const translateY = -factor * 45;
    const scale = 1 - factor * 0.04;

    if (heroFadeElements && heroFadeElements.length) {
      heroFadeElements.forEach(el => {
        el.style.opacity = opacity;
        el.style.transform = `translateY(${translateY}px) scale(${scale})`;
        el.style.pointerEvents = opacity <= 0.05 ? 'none' : 'auto';
        el.style.visibility = opacity <= 0.01 ? 'hidden' : 'visible';
      });
    }

    // 2. Stage 2: Video card & NGO card pop up on 2nd scroll as the two sections disappear
    const popInStart = maxScroll * 0.08;
    const popInEnd = maxScroll * 0.18;
    const popOutStart = maxScroll * 0.36;
    const popOutEnd = maxScroll * 0.46;

    if (videoPopupCard) {
      const restingY = 0;
      let vOpacity = 0;
      let vScale = 0.9;
      let vTranslateY = restingY + 40;

      if (scrollY < popInStart) {
        vOpacity = 0;
        vScale = 0.9;
        vTranslateY = restingY + 40;
      } else if (scrollY >= popInStart && scrollY < popInEnd) {
        const p = (scrollY - popInStart) / (popInEnd - popInStart);
        const ease = 1 - Math.pow(1 - p, 3);
        vOpacity = ease;
        vScale = 0.9 + ease * 0.1;
        vTranslateY = restingY + (1 - ease) * 40;
      } else if (scrollY >= popInEnd && scrollY <= popOutStart) {
        vOpacity = 1;
        vScale = 1;
        vTranslateY = restingY;
      } else if (scrollY > popOutStart && scrollY < popOutEnd) {
        const p = (scrollY - popOutStart) / (popOutEnd - popOutStart);
        vOpacity = Math.max(0, 1 - p);
        vScale = 1 - p * 0.05;
        vTranslateY = restingY - p * 35;
      } else {
        vOpacity = 0;
        vScale = 0.95;
        vTranslateY = restingY - 35;
      }

      videoPopupCard.style.opacity = vOpacity;
      videoPopupCard.style.transform = `translateY(${vTranslateY}px) scale(${vScale})`;
      videoPopupCard.style.pointerEvents = vOpacity <= 0.08 ? 'none' : 'auto';
      if (videoPopupContainer) {
        videoPopupContainer.style.pointerEvents = vOpacity <= 0.08 ? 'none' : 'auto';
        videoPopupContainer.style.visibility = vOpacity <= 0.01 ? 'hidden' : 'visible';
      }

      if (typeof setStage2ShuffleActive === 'function') {
        setStage2ShuffleActive(vOpacity >= 0.5);
      }

      // Play video when popped up, pause when fully hidden to save resources
      if (videoElement) {
        if (vOpacity >= 0.25 && videoElement.paused) {
          videoElement.muted = true;
          videoElement.play().catch(() => {});
        } else if (vOpacity <= 0.02 && !videoElement.paused) {
          videoElement.pause();
        }
      }
    }

    // 3. Stage 3: 5 Big Boxes in Column-Wise Row pop in and slide horizontally
    if (stage3Container && stage3Track) {
      const s3PopInStart = maxScroll * 0.46;
      const s3PopInEnd = maxScroll * 0.55;

      let s3Opacity = 0;
      let s3Scale = 0.92;
      let s3TranslateY = 40;

      if (scrollY < s3PopInStart) {
        s3Opacity = 0;
        s3Scale = 0.92;
        s3TranslateY = 40;
        // If user scrolled back above stage 3, reset slide to first 3 boxes
        if (stage3CurrentIndex !== 0) {
          setStage3Slide(0, false);
        }
      } else if (scrollY >= s3PopInStart && scrollY < s3PopInEnd) {
        const p = (scrollY - s3PopInStart) / (s3PopInEnd - s3PopInStart);
        const ease = 1 - Math.pow(1 - p, 3);
        s3Opacity = ease;
        s3Scale = 0.92 + ease * 0.08;
        s3TranslateY = (1 - ease) * 40;
      } else {
        // Fully visible through 3rd scroll (manual sliding only, no auto scroll-slide)
        s3Opacity = 1;
        s3Scale = 1;
        s3TranslateY = 0;
      }

      stage3Container.style.opacity = s3Opacity;
      stage3Container.style.transform = `translateY(${s3TranslateY}px) scale(${s3Scale})`;
      stage3Container.style.pointerEvents = s3Opacity >= 0.5 ? 'auto' : 'none';
      stage3Container.style.visibility = s3Opacity <= 0.01 ? 'hidden' : 'visible';
    }
  };

  // Main continuous render loop with lerping
  const tick = () => {
    targetProgress = getScrollProgress();
    const delta = targetProgress - currentProgress;

    if (Math.abs(delta) < 0.0003) {
      currentProgress = targetProgress;
    } else {
      currentProgress += delta * 0.15; // Smooth momentum interpolation
    }

    renderFrame();
    updateHeroCardFade();
    requestAnimationFrame(tick);
  };

  const loadSingleFrame = (index) => {
    return new Promise((resolve) => {
      if (loaded[index] && images[index]) {
        resolve();
        return;
      }
      const img = new Image();
      img.onload = () => {
        images[index] = img;
        loaded[index] = 1;
        resolve();
      };
      img.onerror = () => {
        resolve();
      };
      img.src = getFrameUrl(index);
    });
  };

  const loadBatch = async (indices, concurrency = 6) => {
    let cursor = 0;
    const worker = async () => {
      while (cursor < indices.length) {
        const idx = indices[cursor++];
        await loadSingleFrame(idx);
      }
    };
    const workers = [];
    const poolSize = Math.min(concurrency, indices.length);
    for (let i = 0; i < poolSize; i++) {
      workers.push(worker());
    }
    await Promise.all(workers);
  };

  const preloadFrames = async () => {
    // 1. Immediately load frame 0 and NGO logo for instant flawless display
    await Promise.all([loadSingleFrame(0), loadNgoLogo()]);
    renderFrame();

    // 2. Load keyframes across the timeline (every 5th frame)
    const keyframes = [];
    for (let i = 0; i < TOTAL_FRAMES; i += 5) {
      if (i !== 0) keyframes.push(i);
    }
    if (!keyframes.includes(TOTAL_FRAMES - 1)) {
      keyframes.push(TOTAL_FRAMES - 1);
    }
    await loadBatch(keyframes, 8);

    // 3. Load all remaining frames
    const remaining = [];
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      if (!loaded[i]) remaining.push(i);
    }
    await loadBatch(remaining, 10);
  };

  // Stage 2: Physical Box Shuffle Animation (0.15s) + 5-Image One-By-One Cycling
  let setStage2ShuffleActive = null;
  const initStage2BoxShuffleAndCycle = () => {
    const boxes = [
      document.getElementById('stage2-box-1'),
      document.getElementById('stage2-box-2'),
      document.getElementById('stage2-box-3')
    ];
    const imagesWrapper = document.querySelector('.stage2-images-wrapper');

    if (!boxes[0] || !boxes[1] || !boxes[2]) return;

    const imgs = boxes.map(b => b.querySelector('.stage2-frame-img'));
    if (!imgs[0] || !imgs[1] || !imgs[2]) return;

    // All 5 images available in the scrollimage folder
    const folderImages = [
      'scrollimage/PV%201.jpeg',
      'scrollimage/PV%202.jpeg',
      'scrollimage/PV%203.jpeg',
      'scrollimage/PV%204.jpeg',
      'scrollimage/PV%205.jpeg'
    ];

    // Preload all 5 images immediately into browser cache for zero latency
    folderImages.forEach(src => {
      const p = new Image();
      p.src = src;
    });

    // Initial slot assignments: Box 0 in Slot 1, Box 1 in Slot 2, Box 2 in Slot 3
    let currentSlots = [1, 2, 3];
    let nextImageIndex = 3; // Next image from pool to introduce (PV 4)
    let isShuffling = false;

    const performShuffle = () => {
      if (isShuffling) return;
      isShuffling = true;

      // 1. FIRST: Measure current bounding client rects of all 3 boxes
      const firstRects = boxes.map(b => b.getBoundingClientRect());

      // 2. LAST: Advance slots for all 3 boxes (1 -> 2, 2 -> 3, 3 -> 1)
      currentSlots = currentSlots.map(slot => (slot % 3) + 1);

      boxes.forEach((box, i) => {
        box.classList.remove('stage2-slot-1', 'stage2-slot-2', 'stage2-slot-3');
        box.classList.add(`stage2-slot-${currentSlots[i]}`);
      });

      // Find which box is moving into Slot 1 (hero large position) to receive the next image one-by-one
      const heroBoxIdx = currentSlots.indexOf(1);
      const incomingImageSrc = folderImages[nextImageIndex];
      nextImageIndex = (nextImageIndex + 1) % folderImages.length;

      // 3. INVERT: Measure new positions and invert transforms
      const lastRects = boxes.map(b => b.getBoundingClientRect());

      boxes.forEach((box, i) => {
        const dx = firstRects[i].left - lastRects[i].left;
        const dy = firstRects[i].top - lastRects[i].top;
        const sx = firstRects[i].width / lastRects[i].width;
        const sy = firstRects[i].height / lastRects[i].height;

        box.style.transformOrigin = 'top left';
        box.style.transition = 'none';
        box.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
        box.style.zIndex = currentSlots[i] === 1 ? '30' : '20';
        box.classList.add('is-shuffling');
      });

      // Mid-flight at 60ms: smoothly swap the image in the incoming hero box
      setTimeout(() => {
        if (imgs[heroBoxIdx]) {
          imgs[heroBoxIdx].src = incomingImageSrc;
        }
      }, 60);

      // Force synchronous DOM reflow
      void boxes[0].offsetHeight;

      // 4. PLAY: Smoothly glide all 3 boxes into their new slots in exactly 0.15s!
      boxes.forEach(box => {
        box.style.transition = 'transform 0.15s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.15s ease, border-color 0.15s ease';
        box.style.transform = 'translate(0px, 0px) scale(1, 1)';
      });

      // Clean up inline styles after exactly 150ms (0.15 sec)
      setTimeout(() => {
        boxes.forEach(box => {
          box.style.transition = '';
          box.style.transform = '';
          box.style.transformOrigin = '';
          box.style.zIndex = '';
          box.classList.remove('is-shuffling');
        });
        isShuffling = false;
      }, 150);
    };

    // Auto-shuffle timer: every 3s when Stage 2 is in view
    let shuffleInterval = null;
    let stage2Visible = false;

    const startInterval = () => {
      if (!shuffleInterval) {
        shuffleInterval = setInterval(performShuffle, 3000);
      }
    };

    const stopInterval = () => {
      if (shuffleInterval) {
        clearInterval(shuffleInterval);
        shuffleInterval = null;
      }
    };

    if (imagesWrapper) {
      imagesWrapper.addEventListener('click', performShuffle);
      imagesWrapper.addEventListener('mouseenter', stopInterval);
      imagesWrapper.addEventListener('mouseleave', () => {
        if (stage2Visible) startInterval();
      });
    }

    setStage2ShuffleActive = (active) => {
      if (stage2Visible === active) return;
      stage2Visible = active;
      if (active) {
        startInterval();
      } else {
        stopInterval();
      }
    };
  };

  // Listeners
  window.addEventListener('resize', resizeCanvas, { passive: true });
  window.addEventListener('scroll', () => {
    targetProgress = getScrollProgress();
  }, { passive: true });

  // Smooth scroll handler for Scroll Down button
  const scrollBtn = document.getElementById('hero-scroll-btn');
  if (scrollBtn) {
    scrollBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const aboutSection = document.getElementById('about');
      if (aboutSection) {
        aboutSection.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
      }
    });
  }

  // Ensure cursor pointer on full paragraph box & donate button everywhere
  const initPointerBoxes = () => {
    const descBox = document.querySelector('.hero-description');
    const donateBtn = document.getElementById('hero-donate-now-btn') || document.querySelector('.hero-donate-btn');

    [descBox, donateBtn].forEach(box => {
      if (!box) return;
      box.style.setProperty('cursor', 'pointer', 'important');
      box.querySelectorAll('*').forEach(child => {
        child.style.setProperty('cursor', 'pointer', 'important');
      });
      box.addEventListener('mouseenter', () => {
        box.style.setProperty('cursor', 'pointer', 'important');
      });
      box.addEventListener('mousemove', () => {
        box.style.setProperty('cursor', 'pointer', 'important');
      });
    });
  };

  // Init
  resizeCanvas();
  preloadFrames();
  initStage2BoxShuffleAndCycle();
  initPointerBoxes();
  window.addEventListener('DOMContentLoaded', initPointerBoxes);
  window.addEventListener('load', initPointerBoxes);
  requestAnimationFrame(tick);
})();
