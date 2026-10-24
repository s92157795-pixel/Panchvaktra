/**
 * Panchvaktra Foundation - Backend Contact & Interactive Integration
 */
(() => {
  'use strict';

  // Modal elements
  const modal = document.getElementById('panchvaktra-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const gmailBtn = document.getElementById('gmail-contact-btn');
  const toast = document.getElementById('panchvaktra-toast');
  const toastMsg = document.getElementById('toast-message');

  // Tab elements
  const tabButtons = document.querySelectorAll('.pv-tab-btn');
  const tabPanels = document.querySelectorAll('.pv-tab-panel');

  // Open modal
  const openModal = (tabName = 'contact') => {
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    switchTab(tabName);
    document.body.style.overflow = 'hidden';
  };

  // Close modal
  const closeModal = () => {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.style.overflow = '';
  };

  // Switch tabs
  const switchTab = (tabName) => {
    tabButtons.forEach(btn => {
      const active = btn.dataset.tab === tabName;
      if (active) {
        btn.className = 'pv-tab-btn flex-1 py-2 px-3 text-xs sm:text-sm font-extrabold rounded-xl bg-emerald-600 text-white shadow-xs transition';
      } else {
        btn.className = 'pv-tab-btn flex-1 py-2 px-3 text-xs sm:text-sm font-bold rounded-xl bg-emerald-950/60 text-emerald-200 hover:text-white hover:bg-emerald-900/60 transition';
      }
    });

    tabPanels.forEach(panel => {
      if (panel.id === `tab-panel-${tabName}` || panel.id === `${tabName}-form`) {
        panel.classList.remove('hidden');
      } else {
        panel.classList.add('hidden');
      }
    });
  };

  // Show Toast
  const showToast = (message, isError = false) => {
    if (!toast || !toastMsg) return;
    toastMsg.textContent = message;
    toast.className = `fixed bottom-5 right-5 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border transition-all duration-300 transform translate-y-0 opacity-100 ${
      isError 
        ? 'bg-rose-900/95 border-rose-500/80 text-white' 
        : 'bg-emerald-900/95 border-emerald-400/80 text-white'
    }`;

    setTimeout(() => {
      toast.className = 'fixed bottom-5 right-5 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border transition-all duration-300 transform translate-y-12 opacity-0 pointer-events-none';
    }, 4500);
  };

  // Attach event listeners to open modal
  if (gmailBtn) {
    // Gmail button now redirects to email/Gmail compose directly, inquiry page is not opened
  }

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeModal);
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  // Handle Form 1: Contact
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = contactForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;

      const payload = {
        name: document.getElementById('contact-name').value.trim(),
        email: document.getElementById('contact-email').value.trim(),
        phone: document.getElementById('contact-phone').value.trim(),
        subject: document.getElementById('contact-subject').value.trim(),
        message: document.getElementById('contact-message').value.trim()
      };

      try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
          <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg> Sending...`;

        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok && data.success) {
          contactForm.reset();
          closeModal();
          showToast(data.message || 'Message sent successfully!');
        } else {
          showToast(data.error || 'Failed to send message. Please check required fields.', true);
        }
      } catch (err) {
        showToast('Network error: Unable to connect to server.', true);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  // Handle Form 2: Volunteer
  const volunteerForm = document.getElementById('volunteer-form');
  if (volunteerForm) {
    volunteerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = volunteerForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;

      const payload = {
        name: document.getElementById('vol-name').value.trim(),
        email: document.getElementById('vol-email').value.trim(),
        phone: document.getElementById('vol-phone').value.trim(),
        interest: document.getElementById('vol-interest').value,
        availability: document.getElementById('vol-availability').value,
        message: document.getElementById('vol-message').value.trim()
      };

      try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `Submitting...`;

        const res = await fetch('/api/volunteer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok && data.success) {
          volunteerForm.reset();
          closeModal();
          showToast(data.message || 'Volunteer application received!');
        } else {
          showToast(data.error || 'Please fill required fields.', true);
        }
      } catch (err) {
        showToast('Network error: Unable to submit application.', true);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  // Handle Form 3: Donation Pledge
  const donateForm = document.getElementById('donate-form');
  if (donateForm) {
    donateForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = donateForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;

      const payload = {
        name: document.getElementById('don-name').value.trim(),
        email: document.getElementById('don-email').value.trim(),
        phone: document.getElementById('don-phone').value.trim(),
        amount: document.getElementById('don-amount').value.trim(),
        cause: document.getElementById('don-cause').value,
        message: document.getElementById('don-message').value.trim()
      };

      try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `Submitting...`;

        const res = await fetch('/api/donate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok && data.success) {
          donateForm.reset();
          closeModal();
          showToast(data.message || 'Thank you for your pledge!');
        } else {
          showToast(data.error || 'Please fill required fields.', true);
        }
      } catch (err) {
        showToast('Network error: Unable to submit pledge.', true);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  // -------------------------------------------------------------------------
  // Dedicated Premium NGO Inquiry Form Handler
  // -------------------------------------------------------------------------
  const inquiryForm = document.getElementById('ngo-inquiry-form');
  const inquirySuccessCard = document.getElementById('inquiry-success-card');
  const inquiryFormAlert = document.getElementById('inq-form-alert');
  const inquiryResetBtn = document.getElementById('inq-reset-btn');
  const inquiryRefId = document.getElementById('inq-reference-id');

  if (inquiryForm) {
    const nameInput = document.getElementById('inq-name');
    const emailInput = document.getElementById('inq-email');
    const phoneInput = document.getElementById('inq-phone');
    const typeSelect = document.getElementById('inq-type');
    const orgInput = document.getElementById('inq-org');
    const subjectInput = document.getElementById('inq-subject');
    const messageInput = document.getElementById('inq-message');
    const consentInput = document.getElementById('inq-consent');
    const consentError = document.getElementById('inq-consent-error');
    const submitBtn = document.getElementById('inq-submit-btn');

    // Helper: show field error
    const setFieldError = (inputEl, message) => {
      if (!inputEl) return;
      inputEl.classList.add('has-error');
      const container = inputEl.closest('.inq-field-group');
      if (container) {
        const errEl = container.querySelector('.inq-field-error');
        if (errEl) {
          errEl.textContent = message;
          errEl.classList.remove('hidden');
        }
      }
    };

    // Helper: clear field error
    const clearFieldError = (inputEl) => {
      if (!inputEl) return;
      inputEl.classList.remove('has-error');
      const container = inputEl.closest('.inq-field-group');
      if (container) {
        const errEl = container.querySelector('.inq-field-error');
        if (errEl) {
          errEl.textContent = '';
          errEl.classList.add('hidden');
        }
      }
    };

    // Clear error on input
    [nameInput, emailInput, phoneInput, typeSelect, subjectInput, messageInput].forEach(el => {
      if (!el) return;
      el.addEventListener('input', () => {
        clearFieldError(el);
        if (inquiryFormAlert) inquiryFormAlert.classList.add('hidden');
      });
      el.addEventListener('change', () => {
        clearFieldError(el);
        if (inquiryFormAlert) inquiryFormAlert.classList.add('hidden');
      });
    });

    if (consentInput && consentError) {
      consentInput.addEventListener('change', () => {
        if (consentInput.checked) {
          consentError.classList.add('hidden');
          consentError.textContent = '';
        }
      });
    }

    inquiryForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Clear all prior errors
      [nameInput, emailInput, phoneInput, typeSelect, subjectInput, messageInput].forEach(clearFieldError);
      if (consentError) consentError.classList.add('hidden');
      if (inquiryFormAlert) {
        inquiryFormAlert.classList.add('hidden');
        inquiryFormAlert.textContent = '';
      }

      let hasError = false;

      // 1. Validate Name
      const nameVal = nameInput ? nameInput.value.trim() : '';
      if (!nameVal || nameVal.length < 2) {
        setFieldError(nameInput, 'Please provide your full name (at least 2 characters).');
        hasError = true;
      }

      // 2. Validate Email
      const emailVal = emailInput ? emailInput.value.trim() : '';
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailVal || !emailRegex.test(emailVal)) {
        setFieldError(emailInput, 'Please provide a valid email address.');
        hasError = true;
      }

      // 3. Validate Phone (optional, but if present must be valid)
      const phoneVal = phoneInput ? phoneInput.value.trim() : '';
      if (phoneVal && !/^[\d\s+\-().]{7,25}$/.test(phoneVal)) {
        setFieldError(phoneInput, 'Please enter a valid phone number (e.g. +91 98765 43210).');
        hasError = true;
      }

      // 4. Validate Inquiry Type
      const typeVal = typeSelect ? typeSelect.value.trim() : '';
      if (!typeVal) {
        setFieldError(typeSelect, 'Please select an inquiry type.');
        hasError = true;
      }

      // 5. Validate Subject
      const subjectVal = subjectInput ? subjectInput.value.trim() : '';
      if (!subjectVal || subjectVal.length < 3) {
        setFieldError(subjectInput, 'Please enter a subject (at least 3 characters).');
        hasError = true;
      }

      // 6. Validate Message
      const messageVal = messageInput ? messageInput.value.trim() : '';
      if (!messageVal || messageVal.length < 8) {
        setFieldError(messageInput, 'Please provide your inquiry details (at least 8 characters).');
        hasError = true;
      }

      // 7. Validate Privacy Consent
      if (consentInput && !consentInput.checked) {
        if (consentError) {
          consentError.textContent = 'You must agree to the privacy policy to submit your inquiry.';
          consentError.classList.remove('hidden');
        }
        hasError = true;
      }

      if (hasError) {
        if (inquiryFormAlert) {
          inquiryFormAlert.innerHTML = `
            <svg class="w-4 h-4 text-rose-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Please complete all required fields highlighted in red before submitting.</span>
          `;
          inquiryFormAlert.classList.remove('hidden');
        }
        return;
      }

      // Honeypots
      const websiteVal = document.getElementById('inq-website') ? document.getElementById('inq-website').value : '';
      const botCheckVal = document.getElementById('inq-bot-check') ? document.getElementById('inq-bot-check').value : '';

      const payload = {
        name: nameVal,
        email: emailVal,
        phone: phoneVal,
        inquiryType: typeVal,
        organization: orgInput ? orgInput.value.trim() : '',
        subject: subjectVal,
        message: messageVal,
        consent: true,
        website: websiteVal,
        bot_check: botCheckVal
      };

      // Loading state on button
      const btnText = submitBtn ? submitBtn.querySelector('.btn-text') : null;
      const btnSpinner = submitBtn ? submitBtn.querySelector('.btn-spinner') : null;

      try {
        if (submitBtn) submitBtn.disabled = true;
        if (btnText) btnText.classList.add('hidden');
        if (btnSpinner) btnSpinner.classList.remove('hidden');

        const res = await fetch('/api/inquiry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (res.ok && data.success) {
          // Success confirmed by backend - reveal stylish confirmation card
          inquiryForm.classList.add('hidden');
          if (inquirySuccessCard) {
            inquirySuccessCard.classList.remove('hidden');
            inquirySuccessCard.classList.add('flex');
            if (inquiryRefId) {
              inquiryRefId.textContent = data.id || `INQ-${Date.now().toString().slice(-6)}`;
            }
          }

          // Smooth scroll to card
          const formCard = document.getElementById('inquiry-form-card');
          if (formCard) {
            formCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }

          showToast(data.message || 'Thank You for Reaching Out! Your inquiry has been received.');
        } else {
          // Server returned validation or rate limit error
          const errMsg = data.error || 'Unable to submit inquiry. Please check your information and try again.';
          if (inquiryFormAlert) {
            inquiryFormAlert.innerHTML = `
              <svg class="w-4 h-4 text-rose-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>${errMsg}</span>
            `;
            inquiryFormAlert.classList.remove('hidden');
          }
          showToast(errMsg, true);
        }
      } catch (err) {
        console.error('Inquiry submission network error:', err);
        const netMsg = 'Network error: Unable to contact the server. Please check your internet connection.';
        if (inquiryFormAlert) {
          inquiryFormAlert.innerHTML = `
            <svg class="w-4 h-4 text-rose-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>${netMsg}</span>
          `;
          inquiryFormAlert.classList.remove('hidden');
        }
        showToast(netMsg, true);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (btnText) btnText.classList.remove('hidden');
        if (btnSpinner) btnSpinner.classList.add('hidden');
      }
    });

    // Reset button to submit another inquiry
    if (inquiryResetBtn) {
      inquiryResetBtn.addEventListener('click', () => {
        inquiryForm.reset();
        [nameInput, emailInput, phoneInput, typeSelect, subjectInput, messageInput].forEach(clearFieldError);
        if (consentError) consentError.classList.add('hidden');
        if (inquiryFormAlert) inquiryFormAlert.classList.add('hidden');
        if (inquirySuccessCard) {
          inquirySuccessCard.classList.add('hidden');
          inquirySuccessCard.classList.remove('flex');
        }
        inquiryForm.classList.remove('hidden');
        if (nameInput) nameInput.focus();
      });
    }
  }

  // -------------------------------------------------------------------------
  // Dedicated Premium NGO Inquiry Pop-up Modal Controller
  // -------------------------------------------------------------------------
  const inquiryModal = document.getElementById('inquiry-modal');
  const inquiryModalCloseBtn = document.getElementById('inquiry-modal-close-btn');
  const navInquiryBtn = document.getElementById('nav-inquiry-btn');
  const mobileNavInquiryBtn = document.getElementById('mobile-nav-inquiry-btn');

  const openInquiryModal = () => {
    if (!inquiryModal) return;
    const dialog = document.getElementById('inquiry-modal-dialog');
    if (dialog) {
      dialog.classList.remove('animate-popSlideUp');
      void dialog.offsetWidth; // reflow to restart down-to-up pop animation
      dialog.classList.add('animate-popSlideUp');
    }
    inquiryModal.classList.remove('hidden');
    inquiryModal.classList.add('flex');
    document.body.style.overflow = 'hidden';
    const firstInput = document.getElementById('inq-name');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 150);
    }
  };

  const closeInquiryModal = () => {
    if (!inquiryModal) return;
    inquiryModal.classList.add('hidden');
    inquiryModal.classList.remove('flex');
    document.body.style.overflow = '';
  };

  if (navInquiryBtn) {
    navInquiryBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openInquiryModal();
    });
  }

  if (mobileNavInquiryBtn) {
    mobileNavInquiryBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const mobileMenu = document.getElementById('mobile-nav-menu');
      if (mobileMenu) mobileMenu.classList.add('hidden');
      openInquiryModal();
    });
  }

  if (inquiryModalCloseBtn) {
    inquiryModalCloseBtn.addEventListener('click', closeInquiryModal);
  }

  if (inquiryModal) {
    inquiryModal.addEventListener('click', (e) => {
      // Close if user clicks the backdrop outside the dialog card
      if (e.target === inquiryModal) {
        closeInquiryModal();
      }
    });
  }

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && inquiryModal && !inquiryModal.classList.contains('hidden')) {
      closeInquiryModal();
    }
    // Owner quick shortcut: Press Ctrl+Shift+A or Alt+L to jump to Admin Portal
    if ((e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) ||
        (e.altKey && (e.key === 'L' || e.key === 'l'))) {
      e.preventDefault();
      window.location.href = '/admin';
    }
  });

  // Expose global openers
  window.Panchvaktra = {
    openContactModal: openModal,
    closeContactModal: closeModal,
    openInquiryModal: openInquiryModal,
    closeInquiryModal: closeInquiryModal
  };
})();


