"use strict";

// Finds the CaptchaMvc math captcha on the AIUB student portal, reads it with
// AIUBCaptchaSolver and fills in the answer. Unreadable captchas are
// refreshed a few times before giving up. The answer field is animated to
// show each outcome.

(function () {
  // Consecutive refreshes allowed before giving up; reset by a successful fill.
  const MAX_REFRESHES = 3;
  let refreshes = 0;
  // How long a refresh may take to bring a new image before giving up.
  const REFRESH_TIMEOUT_MS = 10000;
  let refreshTimer = null;
  // Source of the last image seen and of the last image read.
  let lastSrc = null;
  let solvedSrc = null;
  // The answer the extension last put in the input, until the user edits it.
  let filled = null;
  // The input's own placeholder while the extension shows its give-up message.
  let savedPlaceholder = null;
  const GAVE_UP = "Couldn't read the captcha; please type the answer";

  // Effects use the Web Animations API, which leaves the page's own classes
  // and styles alone; each one reverts when it ends or is cancelled.
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const GREEN = "40, 167, 69";
  const AMBER = "255, 153, 0";
  const SHIMMER = "linear-gradient(90deg, transparent 33%, rgba(11, 92, 173, 0.18) 50%, transparent 67%)";
  const effects = new Set();
  let shimmer = null;
  // The portal keeps the captcha hidden until it asks for one, so the effect
  // for an outcome waits until the field is on screen.
  let pending = null;
  const visibility = new IntersectionObserver((entries) => {
    if (!pending || !entries[entries.length - 1].isIntersecting) return;
    const effect = pending;
    pending = null;
    visibility.disconnect();
    effect();
  });

  function readPixels(img) {
    const canvas = document.createElement("canvas");
    canvas.width = AIUBCaptchaSolver.W;
    canvas.height = AIUBCaptchaSolver.H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  }

  function fill(input, value) {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    // jquery.validate re-checks on keyup/focusout; clears "This field is required."
    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  }

  // Shows (or removes) a hint in the empty answer field that the extension
  // has given up on this captcha.
  function showGaveUp(input, show) {
    if (show && savedPlaceholder === null) {
      savedPlaceholder = input.placeholder;
      input.placeholder = GAVE_UP;
    } else if (!show && savedPlaceholder !== null) {
      input.placeholder = savedPlaceholder;
      savedPlaceholder = null;
    }
  }

  function animate(input, keyframes, options) {
    const animation = input.animate(keyframes, options);
    effects.add(animation);
    const done = () => effects.delete(animation);
    animation.finished.then(done, done);
    return animation;
  }

  function stopEffects() {
    clearTimeout(refreshTimer);
    refreshTimer = null;
    for (const animation of effects) animation.cancel();
    shimmer = null;
    pending = null;
    visibility.disconnect();
  }

  function whenVisible(input, effect) {
    pending = effect;
    visibility.observe(input);
  }

  // A ring that spreads out from the field's border and fades.
  function ring(input, rgb) {
    const keyframes = reducedMotion.matches
      ? [{ boxShadow: `0 0 0 3px rgba(${rgb}, 0.6)` }, { boxShadow: `0 0 0 3px rgba(${rgb}, 0)` }]
      : [{ boxShadow: `0 0 0 0 rgba(${rgb}, 0.7)` }, { boxShadow: `0 0 0 10px rgba(${rgb}, 0)` }];
    animate(input, keyframes, { duration: 1000, easing: "ease-out" });
  }

  // A highlight sweeping across the empty field while a new captcha loads.
  function showWorking(input) {
    if (shimmer || reducedMotion.matches) return;
    const frame = { backgroundImage: SHIMMER, backgroundSize: "300% 100%" };
    shimmer = animate(input, [
      { ...frame, backgroundPosition: "100% 0" },
      { ...frame, backgroundPosition: "0% 0" },
    ], { duration: 1200, iterations: Infinity });
  }

  function showFilled(input) {
    stopEffects();
    whenVisible(input, () => {
      if (!reducedMotion.matches) {
        animate(input, [{ color: "transparent" }, { color: getComputedStyle(input).color }],
          { duration: 250, easing: "ease-out" });
      }
      ring(input, GREEN);
    });
  }

  function showFailed(input) {
    stopEffects();
    whenVisible(input, () => {
      if (!reducedMotion.matches) {
        animate(input, [0, -6, 6, -4, 4, 0].map((x) => ({ transform: `translateX(${x}px)` })),
          { duration: 400, easing: "ease-in-out" });
      }
      ring(input, AMBER);
    });
  }

  // CaptchaMvc's refresh link points at the answer field.
  function refresh(img, input) {
    const button = img.parentElement && img.parentElement.querySelector('a[href="#CaptchaInputText"]');
    if (button && refreshes < MAX_REFRESHES) {
      refreshes++;
      showWorking(input);
      refreshTimer = setTimeout(() => giveUp(input), REFRESH_TIMEOUT_MS);
      button.click();
    } else {
      giveUp(input);
    }
  }

  function giveUp(input) {
    showGaveUp(input, true);
    showFailed(input);
  }

  function solve(img) {
    // Each image is read once it has loaded or failed, however many load
    // events reach here.
    if (!img.complete || img.src === solvedSrc) return;
    solvedSrc = img.src;
    const input = document.getElementById("CaptchaInputText");
    // Leave anything the user typed alone, but drop our own answer to an
    // earlier image.
    if (!input || (input.value && input.value !== filled)) return;
    if (filled !== null) {
      fill(input, "");
      filled = null;
    }
    if (!img.naturalWidth) {
      refresh(img, input);
      return;
    }
    const result = AIUBCaptchaSolver.solveRGBA(readPixels(img));
    if (result.confident) {
      filled = String(result.answer);
      fill(input, filled);
      showGaveUp(input, false);
      showFilled(input);
      refreshes = 0;
      return;
    }
    refresh(img, input);
  }

  function check() {
    const img = document.getElementById("CaptchaImage");
    if (!img || img.src === lastSrc) return;
    lastSrc = img.src;
    clearTimeout(refreshTimer);
    refreshTimer = null;
    if (img.complete) {
      solve(img);
    } else {
      img.addEventListener("load", () => solve(img), { once: true });
      img.addEventListener("error", () => solve(img), { once: true });
    }
  }

  // Anything the user types into the field is theirs, even if it matches the
  // extension's answer, and stops any effect on it. The extension's own
  // events are untrusted.
  document.addEventListener(
    "input",
    (e) => {
      if (e.isTrusted && e.target.id === "CaptchaInputText") {
        filled = null;
        stopEffects();
      }
    },
    true,
  );

  check();
  // Refreshing swaps the image source (or the whole element) in place.
  new MutationObserver(check).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["src"],
  });
})();
