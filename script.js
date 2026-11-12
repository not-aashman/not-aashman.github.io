/* ═══════════════════════════════════════════════════════════════
   AASHMAN SINGH VERMA — APPLIED AI/ML PORTFOLIO
   Object-Oriented Architecture | GSAP + Lenis + Three.js
   ═══════════════════════════════════════════════════════════════ */

// Respects the OS "reduce motion" setting. When true, animation is skipped
// and final state is applied immediately rather than tweened.
const REDUCED_MOTION_QUERY = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
);
let PREFERS_REDUCED_MOTION = REDUCED_MOTION_QUERY.matches;

// Tracks the preference live, so toggling it in the OS takes effect without
// a reload. A full re-init isn't required — just don't leave the page
// contradicting a preference the reader has only just set.
const onMotionPreferenceChange = (e) => {
  PREFERS_REDUCED_MOTION = e.matches;
  if (e.matches && window.app) {
    if (window.app.hologram) {
      window.app.hologram.stopLoop();
      hideHologramCanvas();
    }
    if (window.app.scroll && window.app.scroll.lenis) {
      window.app.scroll.lenis.stop();
    }
  }
};
if (REDUCED_MOTION_QUERY.addEventListener) {
  REDUCED_MOTION_QUERY.addEventListener("change", onMotionPreferenceChange);
} else if (REDUCED_MOTION_QUERY.addListener) {
  REDUCED_MOTION_QUERY.addListener(onMotionPreferenceChange);
}

// ── Decrypt animation tuning ─────────────────────────────────────────────
// Katakana + Hangul. These are full-width glyphs, roughly twice the advance
// of a Latin character, so .ts-live/.ts-pending pin each one to 1ch in the
// stylesheet — otherwise every reveal would re-wrap the paragraph under it.
const SCRAMBLE_KATAKANA =
  "アイウエオカキクケコサシスセソ" +
  "タチツテトナニヌネノハヒフヘホ" +
  "マミムメモヤユヨラリルレロワヲン";
const SCRAMBLE_HANGUL =
  "가나다라마바사아자차카타파하" +
  "고노도로모보소오조초코토포호" +
  "구누두루무부수우주추쿠투푸후";

const SCRAMBLE = {
  charset: SCRAMBLE_KATAKANA + SCRAMBLE_HANGUL,
  // Reveal speed. Lower = the sweep crosses the text sooner.
  revealScale: 0.45,
  maxSweepMs: 750,
  charMsMin: 60,
  charMsMax: 220,
  // Shuffle speed. How long a single scrambled glyph is held before it is
  // swapped for another. Higher = slower, calmer flicker.
  glyphHoldMs: 260,
};

// One IntersectionObserver shared by every instance; instances are looked
// up by element.
const scrambleRegistry = new WeakMap();
let _scrambleObserver = null;
function scrambleObserver() {
  if (!_scrambleObserver) {
    _scrambleObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const inst = scrambleRegistry.get(entry.target);
          if (inst && !inst.running) inst.arm();
        });
      },
      { threshold: 0.1 },
    );
  }
  return _scrambleObserver;
}

class TextScramble {
  constructor(el) {
    this.el = el;
    this.chars = SCRAMBLE.charset;
    // Snapshot the original markup, not innerText, so <br> breaks and <span>
    // highlights inside elements like .hero-warning survive the animation.
    this.originalHTML = el.innerHTML;
    this.mode = el.dataset.mode || "chars";

    // data-* values are authored as frame counts; convert to ms so the
    // animation runs at the same speed regardless of refresh rate.
    const FRAME_MS = 16.7;
    this.sweepMs = Math.min(
      (parseInt(el.dataset.shuffleSpeed) || 50) * FRAME_MS * SCRAMBLE.revealScale,
      SCRAMBLE.maxSweepMs,
    );
    this.charMs = Math.min(
      Math.max(
        (parseInt(el.dataset.speed) || 30) * FRAME_MS * SCRAMBLE.revealScale,
        SCRAMBLE.charMsMin,
      ),
      SCRAMBLE.charMsMax,
    );

    this.running = false;
    this.raf = null;

    // Reduced motion: leave the original markup completely untouched.
    if (PREFERS_REDUCED_MOTION) return;

    scrambleRegistry.set(el, this);
    scrambleObserver().observe(el);
  }

  // Opacity is not inherited as a computed value, so an element whose PARENT
  // is at opacity:0 still reports 1. Hero elements start at opacity:0 and are
  // faded in by GSAP, so walk the ancestors and multiply before deciding the
  // element is visible enough to animate.
  isVisible() {
    let node = this.el;
    let opacity = 1;
    while (node && node !== document.body) {
      const cs = getComputedStyle(node);
      if (cs.visibility === "hidden" || cs.display === "none") return false;
      opacity *= parseFloat(cs.opacity || "1");
      if (opacity < 0.05) return false;
      node = node.parentElement;
    }
    return true;
  }

  arm() {
    this.running = true;
    const waitForReveal = () => {
      if (this.isVisible()) this.begin();
      else this.raf = requestAnimationFrame(waitForReveal);
    };
    waitForReveal();
  }

  build() {
    // Wrap each text node in its own span. Element nodes (<br>, <span>) are
    // left alone, so structure survives the animation.
    const walker = document.createTreeWalker(this.el, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    this.segs = [];
    textNodes.forEach((tn) => {
      if (!tn.nodeValue.trim()) return;
      const span = document.createElement("span");
      span.textContent = tn.nodeValue;
      tn.parentNode.replaceChild(span, tn);
      this.segs.push({ span, text: tn.nodeValue });
    });

    this.slots = [];
    let order = 0;
    this.segs.forEach((seg, si) => {
      for (let c = 0; c < seg.text.length; c++, order++) {
        this.slots.push({ si, ch: seg.text[c], order });
      }
    });

    const total = Math.max(this.slots.length, 1);
    const jitter = this.sweepMs * 0.22;

    if (this.mode === "words") {
      // words mode: every character of a word resolves together, which reads
      // better than per-character on long strings.
      let wordStart = null;
      this.slots.forEach((slot) => {
        if (/\s/.test(slot.ch)) {
          wordStart = null;
          slot.start = 0;
          slot.dur = 0;
          return;
        }
        if (wordStart === null) {
          wordStart =
            (slot.order / total) * this.sweepMs + Math.random() * jitter;
        }
        slot.start = wordStart;
        slot.dur = this.charMs;
      });
    } else {
      this.slots.forEach((slot) => {
        // Left-to-right sweep plus jitter, rather than pure randomness —
        // a directional reveal reads as deliberate instead of noisy.
        slot.start =
          (slot.order / total) * this.sweepMs + Math.random() * jitter;
        slot.dur = this.charMs;
      });
    }
  }

  begin() {
    this.build();
    if (!this.slots || !this.slots.length) {
      this.finish();
      return;
    }
    // Full-width CJK glyphs take more room than the Latin text they stand in
    // for, so a paragraph would re-wrap taller mid-reveal and shove the rest
    // of the page down. Freeze the box for the duration; the overflow is the
    // still-unresolved tail, which is gibberish anyway and un-clips as the
    // sweep reaches it. Inline elements are left alone.
    this.lockedBox = getComputedStyle(this.el).display !== "inline";
    if (this.lockedBox) {
      const rect = this.el.getBoundingClientRect();
      if (rect.height) {
        // height alone is not enough: a flex item with flex:1 (.wc-desc) has
        // its height decided by the flex algorithm and ignores it. Pin the
        // min and max too.
        const px = rect.height + "px";
        this.el.style.height = px;
        this.el.style.minHeight = px;
        this.el.style.maxHeight = px;
        this.el.style.overflow = "hidden";
      }
    }

    // Don't let a screen reader announce the scrambled glyphs.
    this.el.setAttribute("aria-hidden", "true");

    this.t0 = performance.now();
    this.raf = requestAnimationFrame(() => this.tick());
  }

  tick() {
    const elapsed = performance.now() - this.t0;
    let done = 0;
    let dirty = false;

    // Pass 1: advance state without touching the DOM. A glyph is held for
    // SCRAMBLE.glyphHoldMs before being swapped, so most frames change
    // nothing and can skip the rewrite entirely.
    for (const slot of this.slots) {
      if (/\s/.test(slot.ch)) {
        done++;
        continue;
      }
      let state;
      if (elapsed >= slot.start + slot.dur) {
        state = 2;
        done++;
      } else if (elapsed >= slot.start) {
        state = 1;
      } else {
        state = 0;
      }
      if (state !== slot.state) {
        slot.state = state;
        dirty = true;
      }
      if (state !== 2 && (slot.glyph === undefined || elapsed >= slot.swapAt)) {
        slot.glyph = this.randomChar();
        slot.swapAt = elapsed + SCRAMBLE.glyphHoldMs * (0.6 + Math.random() * 0.8);
        dirty = true;
      }
    }

    // Pass 2: only rebuild when something actually changed.
    if (dirty) {
      const buffers = this.segs.map(() => "");
      for (const slot of this.slots) {
        if (/\s/.test(slot.ch)) {
          buffers[slot.si] += slot.ch;
        } else if (slot.state === 2) {
          // Resolved characters go in as plain text, no wrapper. The span
          // count therefore falls as the sweep advances.
          buffers[slot.si] += esc(slot.ch);
        } else {
          buffers[slot.si] +=
            '<span class="' +
            (slot.state === 1 ? "ts-live" : "ts-pending") +
            '">' +
            esc(slot.glyph) +
            "</span>";
        }
      }
      for (let i = 0; i < this.segs.length; i++) {
        this.segs[i].span.innerHTML = buffers[i];
      }
    }

    if (done === this.slots.length) {
      this.finish();
      return;
    }
    this.raf = requestAnimationFrame(() => this.tick());
  }

  finish() {
    // Restore the exact original markup so highlights and breaks come back.
    this.el.innerHTML = this.originalHTML;
    this.el.removeAttribute("aria-hidden");
    if (this.lockedBox) {
      this.el.style.height = "";
      this.el.style.minHeight = "";
      this.el.style.maxHeight = "";
      this.el.style.overflow = "";
    }
    this.running = false;
    scrambleObserver().unobserve(this.el);
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  randomChar() {
    return this.chars[Math.floor(Math.random() * this.chars.length)];
  }
}

// The scramble alphabet contains < and >.
function esc(c) {
  if (c === "&") return "&amp;";
  if (c === "<") return "&lt;";
  if (c === ">") return "&gt;";
  return c;
}

class Preloader {
  constructor(onComplete) {
    this.el = document.getElementById("preloader");
    this.bar = document.getElementById("preloader-bar");
    this.text = document.getElementById("preloader-text");
    this.onComplete = onComplete;
    this.progress = 0;
    this.target = 0;
  }

  start() {
    // Reduced motion: skip the whole sequence, hand straight over.
    if (PREFERS_REDUCED_MOTION) {
      this.el.style.display = "none";
      if (this.onComplete) this.onComplete();
      return;
    }

    // Simulate loading sequence. Kept short on purpose — this is set
    // dressing, and a visitor should be reading the page inside ~1s.
    const steps = [30, 65, 100];
    let i = 0;
    const interval = setInterval(() => {
      this.target = steps[i];
      i++;
      if (i >= steps.length) clearInterval(interval);
    }, 110);

    this.animate();
  }

  animate() {
    this.progress += (this.target - this.progress) * 0.22;

    if (Math.abs(this.target - this.progress) < 0.5 && this.target === 100) {
      this.progress = 100;
      this.bar.style.width = "100%";
      this.text.innerText = "100%";
      setTimeout(() => this.hide(), 120);
      return;
    }

    this.bar.style.width = this.progress + "%";
    this.text.innerText = Math.floor(this.progress) + "%";
    requestAnimationFrame(() => this.animate());
  }

  hide() {
    // If GSAP never loaded, skip the fade and hand over immediately —
    // an un-dismissed preloader is a blank page.
    if (typeof gsap === "undefined") {
      this.el.style.display = "none";
      if (this.onComplete) this.onComplete();
      return;
    }

    gsap.to(this.el, {
      opacity: 0,
      duration: 0.35,
      ease: "power2.inOut",
      onComplete: () => {
        this.el.style.display = "none";
        if (this.onComplete) this.onComplete();
      },
    });
  }
}

// Institutional and university machines routinely have WebGL disabled or
// blocklisted — exactly the machines an admissions reader will use. Probe for
// it before constructing a renderer, and fail silently to the plain hero.
function webglAvailable() {
  try {
    // THREE is loaded on demand after this check, so do not require it here.
    if (!window.WebGLRenderingContext) return false;
    const probe = document.createElement("canvas");
    const ctx =
      probe.getContext("webgl2") ||
      probe.getContext("webgl") ||
      probe.getContext("experimental-webgl");
    if (!ctx) return false;
    // Release the probe context immediately rather than waiting for GC.
    const lose = ctx.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
    return true;
  } catch (err) {
    return false;
  }
}

// Three.js is ~600KB and is only worth fetching once we know the canvas will
// actually be used. Loaded here rather than in <head>, with the same SRI hash.
let threeLoadPromise = null;
function loadThree() {
  if (window.THREE) return Promise.resolve();
  if (threeLoadPromise) return threeLoadPromise;
  threeLoadPromise = new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    tag.integrity =
      "sha384-CI3ELBVUz9XQO+97x6nwMDPosPR5XvsxW2ua7N1Xeygeh1IxtgqtCkGfQY9WWdHu";
    tag.crossOrigin = "anonymous";
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error("three.js failed to load"));
    document.head.appendChild(tag);
  });
  return threeLoadPromise;
}

function hideHologramCanvas() {
  const canvas = document.getElementById("hologram-canvas");
  if (canvas) canvas.style.display = "none";
}

class Hologram3D {
  constructor() {
    this.canvas = document.getElementById("hologram-canvas");
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    this.camera.position.z = 3.5;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    this.mouse = new THREE.Vector2(0.5, 0.5);
    this.targetMouse = new THREE.Vector2(0.5, 0.5);
    this.targetRotation = new THREE.Vector2(0, 0);
    this.clock = new THREE.Clock();
    this.mesh = null;
    this.particles = null;
    this.rafId = null;
    this.fade = 1;
    this.fadeTarget = 1;

    this.init();
  }

  init() {
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      "Front.jpeg",
      (texture) => {
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        this.createMesh(texture);
        this.createParticles();
        this.startLoop();
      },
      undefined,
      () => {
        // Fail loudly, and still build the rest of the scene: the particle
        // field does not depend on the portrait texture.
        console.error(
          "[Hologram3D] Front.jpeg failed to load — portrait mesh skipped. Add Front.jpeg to this folder.",
        );
        this.createParticles();
        this.startLoop();
      },
    );

    // setSize() reallocates the drawing buffer, so don't do it per event.
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => this.onResize(), 150);
    });

    document.addEventListener("visibilitychange", () => this.syncLoop());

    const hero = document.getElementById("hero");
    if (hero && "IntersectionObserver" in window) {
      new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            this.fadeTarget = e.isIntersecting ? 1 : 0;
          });
        },
        { threshold: 0 },
      ).observe(hero);
    }

    // A mid-session context loss otherwise throws once per frame from outside
    // the try/catch that guarded construction.
    if (this.canvas) {
      this.canvas.addEventListener("webglcontextlost", (e) => {
        e.preventDefault();
        this.stopLoop();
        hideHologramCanvas();
      });
    }
    window.addEventListener("mousemove", (e) => this.onMouseMove(e));
  }

  createMesh(texture) {
    const geometry = new THREE.PlaneGeometry(2.2, 2.8, 64, 64);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: texture },
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uHover: { value: 1.0 },
        uFade: { value: 1 },
      },
      vertexShader: `
                uniform float uTime;
                uniform vec2 uMouse;
                uniform float uHover;
                varying vec2 vUv;
                varying float vDist;

                void main() {
                    vUv = uv;
                    vec3 pos = position;

                    float dist = distance(uv, uMouse);
                    float ripple = sin(dist * 20.0 - uTime * 3.0) * 0.08 * uHover;
                    float wave = sin(pos.x * 4.0 + uTime * 0.8) * 0.015 + sin(pos.y * 4.0 + uTime * 0.6) * 0.015;

                    pos.z += ripple + wave;
                    vDist = dist;

                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }
            `,
      fragmentShader: `
                uniform sampler2D uTexture;
                uniform float uTime;
                uniform vec2 uMouse;
                uniform float uHover;
                uniform float uFade;
                varying vec2 vUv;
                varying float vDist;

                void main() {
                    vec2 uv = vUv;

                    // Chromatic aberration
                    float aberration = 0.015 * uHover * (1.0 - vDist);
                    vec4 cr = texture2D(uTexture, uv + vec2(aberration, 0.0));
                    vec4 cg = texture2D(uTexture, uv);
                    vec4 cb = texture2D(uTexture, uv - vec2(aberration, 0.0));

                    vec4 color = vec4(cr.r, cg.g, cb.b, cg.a);

                    // Scanlines
                    float scanline = sin(uv.y * 600.0) * 0.03;
                    color.rgb -= scanline;

                    // Vignette
                    float vig = 1.0 - smoothstep(0.4, 1.2, length(uv - 0.5) * 2.0);
                    color.rgb *= vig;

                    // Holographic tint — matches --accent (#20daff)
                    color.rgb += vec3(0.01, 0.05, 0.06) * (1.0 - vDist) * uHover;

                    // Pulse glow
                    float pulse = sin(uTime * 1.5) * 0.03 + 0.97;
                    color.rgb *= pulse;

                    // Straight alpha, not premultiplied: this material leaves
                    // premultipliedAlpha at its default false, so three.js
                    // blends it (SRC_ALPHA, ONE_MINUS_SRC_ALPHA). Scaling rgb
                    // here as well would apply uFade twice and roughly double
                    // the fade rate. Measured over #050505: 200 -> 122 -> 64
                    // -> 25 as uFade goes 1.0 -> 0.6 -> 0.3 -> 0.1.
                    gl_FragColor = color;
                    gl_FragColor.a *= uFade;
                }
            `,
      transparent: true,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(0.8, 0, 0);
    this.scene.add(this.mesh);
  }

  createParticles() {
    const count = 400;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 6;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 6;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0x20daff,
      size: 0.015,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  onMouseMove(e) {
    this.targetMouse.x = e.clientX / window.innerWidth;
    this.targetMouse.y = 1.0 - e.clientY / window.innerHeight;
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // startLoop is idempotent: it never schedules a second frame while one is
  // already pending, so repeated calls are safe.
  startLoop() {
    if (this.rafId != null) return;
    const frame = () => {
      this.rafId = requestAnimationFrame(frame);
      this.renderFrame();
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stopLoop() {
    if (this.rafId == null) return;
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  // Tab visibility gates the loop; the hero observer drives the portrait fade.
  // The canvas is a site-wide background, so the hero scrolling away is not a
  // reason to stop rendering.
  syncLoop() {
    if (document.visibilityState === "visible") this.startLoop();
    else this.stopLoop();
  }

  renderFrame() {
    const time = this.clock.getElapsedTime();

    this.mouse.x += (this.targetMouse.x - this.mouse.x) * 0.05;
    this.mouse.y += (this.targetMouse.y - this.mouse.y) * 0.05;

    // Ease the portrait in and out rather than popping it.
    this.fade += (this.fadeTarget - this.fade) * 0.06;

    if (this.mesh) {
      this.mesh.visible = this.fade > 0.01;
      this.mesh.material.uniforms.uFade.value = this.fade;
      this.mesh.material.uniforms.uTime.value = time;
      this.mesh.material.uniforms.uMouse.value = this.mouse;

      this.targetRotation.x = (this.mouse.y - 0.5) * 0.3;
      this.targetRotation.y = (this.mouse.x - 0.5) * 0.3;

      this.mesh.rotation.x +=
        (this.targetRotation.x - this.mesh.rotation.x) * 0.05;
      this.mesh.rotation.y +=
        (this.targetRotation.y - this.mesh.rotation.y) * 0.05;
    }

    if (this.particles) {
      this.particles.rotation.y = time * 0.05;
      this.particles.rotation.x = time * 0.02;
    }

    this.renderer.render(this.scene, this.camera);
  }
}

class SmoothScrollController {
  constructor() {
    // Reduced motion: skip Lenis entirely and leave native scrolling alone.
    if (PREFERS_REDUCED_MOTION) {
      this.lenis = null;
      this.updateProgressBar();
      return;
    }

    this.lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      direction: "vertical",
      gestureDirection: "vertical",
      smooth: true,
      smoothTouch: false,
      touchMultiplier: 2,
    });

    this.lenis.on("scroll", ScrollTrigger.update);

    gsap.ticker.add((time) => {
      this.lenis.raf(time * 1000);
    });

    gsap.ticker.lagSmoothing(0);

    this.updateProgressBar();
  }

  updateProgressBar() {
    const bar = document.getElementById("top-progress-line");
    if (!bar) return;

    // scrollHeight and innerHeight both force synchronous layout. Reading them
    // on every scroll event, then writing style.width, thrashed layout. Cache
    // the height and coalesce writes to one per frame.
    let docHeight = 1;
    let queued = false;

    const measure = () => {
      docHeight = Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        1,
      );
    };
    measure();

    const write = () => {
      queued = false;
      bar.style.width = (window.scrollY / docHeight) * 100 + "%";
    };

    window.addEventListener(
      "scroll",
      () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(write);
      },
      { passive: true },
    );

    window.addEventListener("resize", measure, { passive: true });
    if (typeof ScrollTrigger !== "undefined" && ScrollTrigger.addEventListener) {
      ScrollTrigger.addEventListener("refresh", measure);
    }
  }

  scrollTo(target) {
    if (!this.lenis) {
      const el = document.querySelector(target);
      if (el) el.scrollIntoView({ behavior: "auto", block: "start" });
      return;
    }
    this.lenis.scrollTo(target);
  }
}

class AnimationController {
  constructor() {
    gsap.registerPlugin(ScrollTrigger);
    this.initHero();

    if (PREFERS_REDUCED_MOTION) {
      // Leave everything at its natural, fully-visible state.
      return;
    }

    this.initAbout();
    this.initProjects();
  }

  initHero() {
    const targets =
      ".hero-eyebrow, .hero-title, .hero-jp, .hero-warning, .hero-meta, .hero-cta";

    if (PREFERS_REDUCED_MOTION) {
      gsap.set(targets, { opacity: 1, y: 0 });
      return;
    }

    // Resting state lives here, not in CSS: if this script never runs, the
    // hero stays visible instead of staying invisible.
    gsap.set(".hero-eyebrow, .hero-warning", { opacity: 0, y: 20 });
    gsap.set(".hero-title", { opacity: 0, y: 30 });
    gsap.set(".hero-jp, .hero-meta, .hero-cta", { opacity: 0 });

    const tl = gsap.timeline({ delay: 0.2 });
    tl.to(".hero-eyebrow", {
      opacity: 1,
      y: 0,
      duration: 0.8,
      ease: "power3.out",
    })
      .to(
        ".hero-title",
        { opacity: 1, y: 0, duration: 1, ease: "power3.out" },
        "-=0.5",
      )
      .to(
        ".hero-jp",
        { opacity: 1, duration: 0.8, ease: "power2.out" },
        "-=0.6",
      )
      .to(
        ".hero-warning",
        { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" },
        "-=0.5",
      )
      .to(
        ".hero-cta",
        { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" },
        "-=0.5",
      )
      .to(".hero-meta", { opacity: 1, duration: 1 }, "-=0.4");

    // The barcode bars carry an easter egg, so give them their own reveal
    // rather than letting them just fade in with the block. gsap.from() means
    // the CSS resting state stays visible if JS never runs.
    gsap.from(".barcode rect", {
      scaleY: 0,
      opacity: 0,
      transformOrigin: "50% 100%",
      duration: 0.45,
      stagger: 0.07,
      delay: 1.15,
      ease: "power2.out",
    });
  }

  initAbout() {
    gsap.from(".about-header", {
      scrollTrigger: {
        trigger: ".about-header",
        start: "top 80%",
        toggleActions: "play none none none",
      },
      y: 30,
      opacity: 0,
      duration: 0.8,
      ease: "power3.out",
    });

    gsap.from(".about-intro", {
      scrollTrigger: {
        trigger: ".about-intro",
        start: "top 75%",
        toggleActions: "play none none none",
      },
      y: 50,
      opacity: 0,
      duration: 1,
      ease: "power3.out",
    });

    gsap.from(".edu-card", {
      scrollTrigger: {
        trigger: ".about-body",
        start: "top 75%",
        toggleActions: "play none none none",
      },
      y: 40,
      opacity: 0,
      duration: 0.8,
      stagger: 0.12,
      ease: "power3.out",
    });
  }

  initProjects() {
    const cards = gsap.utils.toArray(".proj-card");
    const stacks = window.matchMedia("(min-width: 1025px)");
    cards.forEach((card, i) => {
      gsap.from(card, {
        scrollTrigger: {
          trigger: card,
          start: "top 85%",
          toggleActions: "play none none none",
        },
        y: 60,
        opacity: 0,
        duration: 0.8,
        delay: i * 0.1,
        ease: "power3.out",
      });

      // Dimming only reads as "the next card is stacking over this one" where
      // the cards actually stack. Below 1025px they are position: static, so
      // the effect would just look like a rendering fault.
      // Limitation: crossing the breakpoint needs a reload to pick this up.
      if (!stacks.matches) return;

      ScrollTrigger.create({
        trigger: card,
        start: "top 100px",
        end: "bottom 100px",
        onUpdate: (self) => {
          // onUpdate fires on every scroll tick; only tween when the state
          // actually flips, instead of creating a tween per frame.
          const dim = self.progress > 0.5;
          if (dim === card._dimmed) return;
          card._dimmed = dim;
          gsap.to(
            card,
            dim
              ? { filter: "brightness(0.6)", scale: 0.98, duration: 0.3 }
              : { filter: "brightness(1)", scale: 1, duration: 0.3 },
          );
        },
      });
    });
  }
}

class UIController {
  constructor() {
    this.initTextScramble();
    this.initNavLinks();
    this.initContactForm();
    this.initDisclosure();
  }

  // Opening the Samatrix course list changes the page height above the
  // project cards. ScrollTrigger caches their positions and the progress bar
  // caches the page height, so re-measure both, or the stacking dim fires at
  // the old offsets. The <details> itself needs no script to open.
  initDisclosure() {
    document.querySelectorAll("details.edu-more").forEach((d) => {
      d.addEventListener("toggle", () => {
        if (typeof ScrollTrigger !== "undefined" && ScrollTrigger.refresh) {
          ScrollTrigger.refresh();
        } else {
          window.dispatchEvent(new Event("resize"));
        }
      });
    });
  }

  // A plain POST to Formspree navigates the reader away to Formspree's own
  // thank-you page. Submit with fetch instead and report the result inline,
  // so they stay on the site. Falls back to the native POST if fetch is
  // unavailable, because a working form matters more than staying put.
  initContactForm() {
    const form = document.querySelector(".contact-form");
    if (!form || typeof fetch !== "function") return;

    const status = document.createElement("p");
    status.className = "cf-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.hidden = true;
    form.appendChild(status);

    const submit = form.querySelector('button[type="submit"]');
    const originalLabel = submit ? submit.textContent : "";

    const say = (message, ok) => {
      status.textContent = message;
      status.classList.toggle("is-error", !ok);
      status.hidden = false;
    };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      status.hidden = true;

      if (submit) {
        submit.disabled = true;
        submit.textContent = "Sending…";
      }

      try {
        const res = await fetch(form.action, {
          method: "POST",
          body: new FormData(form),
          headers: { Accept: "application/json" },
        });

        if (res.ok) {
          form.reset();
          say("Thanks. Your message is on its way.", true);
        } else {
          // Formspree returns a JSON body describing what it rejected.
          let detail = "";
          try {
            const data = await res.json();
            if (data && Array.isArray(data.errors)) {
              detail = data.errors.map((x) => x.message).join(", ");
            }
          } catch (parseErr) {
            detail = "";
          }
          say(
            detail || "That didn't send. Please email reach_aashman@outlook.com.",
            false,
          );
        }
      } catch (err) {
        say(
          "Network error. Please email reach_aashman@outlook.com instead.",
          false,
        );
      } finally {
        if (submit) {
          submit.disabled = false;
          submit.textContent = originalLabel;
        }
      }
    });
  }

  initTextScramble() {
    // Headings and subheadings only — never body copy, chips, tags or links.
    // Elements get aria-hidden for the duration of their sweep, so a screen
    // reader never announces the scrambled glyphs. The two hero-meta strings
    // are here because they carry the easter eggs.
    const SELECTORS = [
      // headings
      ".hero-title span",
      ".sec-title",
      ".about-title",
      // subheadings
      ".pc-title",
      ".sg-title",
      ".wc-title",
      ".edu-card h3",
      ".edu-sub-title",
      ".panel-school",
      ".award-title",
      ".cred-title",
      ".edu-cohort",
      // hero-meta strings
      ".barcode-num",
      ".serial",
      // anything still tagged by hand
      ".decrypt-text",
    ];

    // Was a nested loop over the candidate Set — roughly 55,000
    // Node.contains() calls. One querySelector per element instead.
    const combined = SELECTORS.join(", ");
    const candidates = new Set(document.querySelectorAll(combined));

    candidates.forEach((el) => {
      // If a candidate sits inside this one, let the inner element run and
      // skip the ancestor, or the two would fight over innerHTML.
      if (el.querySelector(combined)) return;
      if (!el.textContent.trim()) return;
      new TextScramble(el);
    });
  }

  initNavLinks() {
    document.querySelectorAll(".nav-links a").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const target = link.getAttribute("href");
        if (window.app && window.app.scroll) {
          window.app.scroll.scrollTo(target);
        } else {
          document.querySelector(target).scrollIntoView({ behavior: "smooth" });
        }
      });
    });
  }
}

class App {
  constructor() {
    this.preloader = new Preloader(() => this.onLoadComplete());
    this.scroll = null;
    this.hologram = null;
    this.animations = null;
    this.ui = null;
  }

  init() {
    this.preloader.start();
  }

  onLoadComplete() {
    // One failed CDN must not cascade: each subsystem is constructed on its
    // own. Silent by design — a console full of errors on an admissions
    // reader's machine is its own bad look.
    try {
      this.scroll = new SmoothScrollController();
    } catch (err) {
      this.scroll = null;
    }

    // The hero reads fine without the canvas, so any failure here is silent.
    this.hologram = null;
    if (PREFERS_REDUCED_MOTION || !webglAvailable()) {
      hideHologramCanvas();
    } else {
      loadThree()
        .then(() => {
          try {
            this.hologram = new Hologram3D();
          } catch (err) {
            hideHologramCanvas();
          }
        })
        .catch(() => hideHologramCanvas());
    }
    try {
      this.animations = new AnimationController();
    } catch (err) {
      this.animations = null;
    }

    try {
      this.ui = new UIController();
    } catch (err) {
      this.ui = null;
    }

    window.app = this;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const app = new App();
  app.init();
});
