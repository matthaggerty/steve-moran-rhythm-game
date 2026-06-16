// Game constants
const NOTE_WIDTH = 60;
const NOTE_HEIGHT = 20;
const NOTE_SPEED = 5;
const LANE_COUNT = 5;
const KEY_MAPPING = {
    'KeyA': 0,
    'KeyS': 1,
    'KeyJ': 2,
    'KeyK': 3,
    'KeyL': 4
};

const LANE_COLORS = [
    '#22cc44', // Green
    '#dd2222', // Red
    '#ddbb00', // Yellow
    '#2244dd', // Blue
    '#dd6600'  // Orange
];

const LANE_COLORS_GLOW = [
    '#44ff66',
    '#ff4444',
    '#ffee00',
    '#4466ff',
    '#ff8800'
];

const PARTICLE_COUNT = 15;
const PARTICLE_COLORS = ['#ff4081', '#00ff00', '#ffff00', '#00ffff', '#ff00ff'];
const COMBO_THRESHOLDS = [5, 10, 20, 50];

const SONG_BPM = 130;
const BEAT_INTERVAL_MS = (60 / SONG_BPM) * 1000;

// Per-lane hit flash timers (0 = no flash, 1 = full flash)
let buttonFlash = [0, 0, 0, 0, 0];

// Game state
let gameRunning = false;
let gameOver = false;
let score = 0;
let combo = 0;
let notes = [];
let particles = [];
let lastBeatTime = null;
let beatCount = 0;
let comboEffect = null;
let touchButtons = [];
let activeKeys = new Set(); // track which lanes are being pressed
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Audio
const backgroundMusic = document.getElementById('background-music');
const crowdIntro = document.getElementById('crowd-intro');
const goodNoteSound = document.getElementById('good-note');
const badNoteSound = document.getElementById('bad-note');
const crowdBoo = document.getElementById('crowd-boo');

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Canvas dimensions — updated on resize
let CANVAS_WIDTH = window.innerWidth;
let CANVAS_HEIGHT = window.innerHeight;
let FRETBOARD_TOP_WIDTH, FRETBOARD_BOTTOM_WIDTH, FRETBOARD_Y_OFFSET;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    CANVAS_WIDTH = canvas.width;
    CANVAS_HEIGHT = canvas.height;
    FRETBOARD_TOP_WIDTH = CANVAS_WIDTH * 0.18;
    FRETBOARD_BOTTOM_WIDTH = CANVAS_WIDTH * 0.96;
    FRETBOARD_Y_OFFSET = CANVAS_HEIGHT * 0.38;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// --- Lane geometry helpers ---

function getLaneGeometry(progress) {
    const totalWidth = FRETBOARD_TOP_WIDTH + (FRETBOARD_BOTTOM_WIDTH - FRETBOARD_TOP_WIDTH) * progress;
    const laneWidth = totalWidth / LANE_COUNT;
    const leftEdge = CANVAS_WIDTH / 2 - totalWidth / 2;
    const y = FRETBOARD_Y_OFFSET + (CANVAS_HEIGHT - FRETBOARD_Y_OFFSET) * progress;
    return { totalWidth, laneWidth, leftEdge, y };
}

function getLaneCenter(lane, progress) {
    const { laneWidth, leftEdge, y } = getLaneGeometry(progress);
    return {
        x: leftEdge + lane * laneWidth + laneWidth / 2,
        y,
        laneLeft: leftEdge + lane * laneWidth,
        laneRight: leftEdge + (lane + 1) * laneWidth,
        laneWidth
    };
}

// --- Note class ---

class Note {
    constructor(lane) {
        this.lane = lane;
        this.progress = 0;
        this.hit = false;
        this.missed = false;
        this.hitFlash = 0;
    }

    update() {
        if (!this.hit) {
            this.progress += NOTE_SPEED / 1000;
            if (this.progress > 1 && !this.missed) {
                this.missed = true;
                playBadNote();
            }
        } else {
            this.hitFlash = Math.max(0, this.hitFlash - 0.08);
        }
    }

    draw() {
        if (this.hit && this.hitFlash <= 0) return;
        const pos = getLaneCenter(this.lane, this.progress);
        // Radius grows as note approaches bottom (perspective scale)
        const r = Math.max(10, pos.laneWidth * 0.32);

        ctx.save();

        const color = this.missed ? '#550000' : LANE_COLORS[this.lane];
        const glowColor = LANE_COLORS_GLOW[this.lane];

        if (!this.missed) {
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = 22;
        }

        // Outer ring
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = this.hit ? '#ffffff' : glowColor;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Filled circle
        const grad = ctx.createRadialGradient(pos.x, pos.y - r * 0.3, 0, pos.x, pos.y, r);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.25, color);
        grad.addColorStop(1, shadeColor(color, -50));
        ctx.fillStyle = this.hit ? 'rgba(255,255,255,0.8)' : grad;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    getPosition() {
        return getLaneCenter(this.lane, this.progress);
    }

    isInHitZone() {
        return this.progress >= 0.88 && this.progress <= 0.98;
    }
}

// --- Particle class ---

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.color = color;
        this.size = Math.random() * 5 + 2;
        this.speedX = (Math.random() - 0.5) * 8;
        this.speedY = (Math.random() - 0.5) * 8;
        this.gravity = 0.2;
        this.life = 1.0;
        this.decay = Math.random() * 0.02 + 0.02;
        this.trail = [];
        this.maxTrailLength = 5;
    }

    update() {
        this.trail.push({ x: this.x, y: this.y, life: this.life });
        if (this.trail.length > this.maxTrailLength) this.trail.shift();
        this.x += this.speedX;
        this.y += this.speedY;
        this.speedY += this.gravity;
        this.life -= this.decay;
        return this.life > 0;
    }

    draw() {
        const rgb = hexToRgb(this.color);
        for (let i = 0; i < this.trail.length; i++) {
            const pt = this.trail[i];
            const tl = pt.life * (i / this.trail.length);
            const gs = this.size * 2 * (i / this.trail.length);
            if (gs <= 0) continue;
            const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, gs);
            g.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${tl * 0.4})`);
            g.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(pt.x, pt.y, gs, 0, Math.PI * 2); ctx.fill();
        }
        const gs = this.size * 3;
        const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, gs);
        g.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${this.life * 0.8})`);
        g.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(this.x, this.y, gs, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.life;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
    }
}

// --- Touch buttons ---

class TouchButton {
    constructor(lane, key, x, y, width, height) {
        this.lane = lane; this.key = key;
        this.x = x; this.y = y; this.width = width; this.height = height;
        this.active = false; this.activeTime = 0;
    }
    draw() {
        ctx.fillStyle = this.active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.07)';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.strokeStyle = this.active ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        ctx.fillStyle = 'white';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.key, this.x + this.width / 2, this.y + this.height / 2);
        if (this.active) {
            this.activeTime++;
            if (this.activeTime > 10) { this.active = false; this.activeTime = 0; }
        }
    }
    isPointInside(x, y) {
        return x >= this.x && x <= this.x + this.width && y >= this.y && y <= this.y + this.height;
    }
    activate() { this.active = true; this.activeTime = 0; }
}

function buildTouchButtons() {
    const bw = CANVAS_WIDTH / LANE_COUNT;
    const bh = 80;
    const by = CANVAS_HEIGHT - bh - 10;
    return ['A','S','J','K','L'].map((key, i) => new TouchButton(i, key, i * bw, by, bw, bh));
}

// --- Drawing: Stage background ---

function drawStageBackground() {
    const w = CANVAS_WIDTH;
    const stageH = FRETBOARD_Y_OFFSET + 20;

    // Sky/stage gradient
    const sky = ctx.createLinearGradient(0, 0, 0, stageH);
    sky.addColorStop(0, '#12012a');
    sky.addColorStop(0.5, '#1e0440');
    sky.addColorStop(1, '#2a0830');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, stageH);

    // Stage floor strip
    const floor = ctx.createLinearGradient(0, stageH * 0.75, 0, stageH);
    floor.addColorStop(0, '#3a1a00');
    floor.addColorStop(1, '#1a0800');
    ctx.fillStyle = floor;
    ctx.fillRect(0, stageH * 0.75, w, stageH * 0.25);

    // Speakers — left and right stacks
    drawSpeakerStack(w * 0.04, stageH * 0.1, stageH * 0.65);
    drawSpeakerStack(w * 0.96, stageH * 0.1, stageH * 0.65);

    // Spotlight beams from top corners
    drawSpotlight(0, 0, w * 0.38, stageH * 0.85, 'rgba(255,200,80,0.07)');
    drawSpotlight(w, 0, w * 0.62, stageH * 0.85, 'rgba(255,200,80,0.07)');
    drawSpotlight(w * 0.5, 0, w * 0.5, stageH * 0.9, 'rgba(255,255,255,0.04)');

    // Crowd silhouettes
    drawCrowd(w, stageH);

    // Guitarist character
    drawCharacter(w / 2, stageH * 0.82);
}

function drawSpeakerStack(cx, y, h) {
    const boxW = Math.max(30, CANVAS_WIDTH * 0.07);
    const boxH = boxW * 1.1;
    const cols = 1;
    const rows = Math.floor(h / (boxH + 4));
    const x = cx - boxW / 2;

    for (let r = 0; r < rows; r++) {
        const by = y + r * (boxH + 4);
        // Cabinet
        ctx.fillStyle = '#1a1a1a';
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.fillRect(x, by, boxW, boxH);
        ctx.strokeRect(x, by, boxW, boxH);

        // Speaker cone
        const cx2 = x + boxW / 2;
        const cy2 = by + boxH / 2;
        const r2 = boxW * 0.38;
        ctx.beginPath();
        ctx.fillStyle = '#2a2a2a';
        ctx.arc(cx2, cy2, r2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#444';
        ctx.stroke();

        // Cone center
        ctx.beginPath();
        ctx.fillStyle = '#111';
        ctx.arc(cx2, cy2, r2 * 0.35, 0, Math.PI * 2);
        ctx.fill();

        // Grill dots
        ctx.fillStyle = '#333';
        for (let d = 0; d < 6; d++) {
            const a = (d / 6) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(cx2 + Math.cos(a) * r2 * 0.65, cy2 + Math.sin(a) * r2 * 0.65, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function drawSpotlight(fromX, fromY, toX, toY, color) {
    ctx.save();
    ctx.globalAlpha = 1;
    const grad = ctx.createLinearGradient(fromX, fromY, toX, toY);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    const spread = CANVAS_WIDTH * 0.12;
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX - spread, toY);
    ctx.lineTo(toX + spread, toY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawCrowd(w, stageH) {
    const crowdY = stageH * 0.72;
    const personW = 18;
    const count = Math.floor(w / personW);

    for (let i = 0; i < count; i++) {
        const px = i * personW + personW / 2;
        const offset = Math.sin(i * 2.1 + Date.now() * 0.001) * 4;
        const py = crowdY + offset;

        ctx.fillStyle = '#0d0020';
        ctx.globalAlpha = 0.95;

        // Head
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();

        // Body
        ctx.fillRect(px - 4, py + 5, 8, 14);

        // Raised arm
        ctx.beginPath();
        if (i % 2 === 0) {
            ctx.moveTo(px - 3, py + 8);
            ctx.lineTo(px - 10, py - 6);
        } else {
            ctx.moveTo(px + 3, py + 8);
            ctx.lineTo(px + 10, py - 6);
        }
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#0d0020';
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

function drawCharacter(cx, baseY) {
    const scale = Math.max(0.5, CANVAS_WIDTH / 800);
    ctx.save();
    ctx.translate(cx, baseY);
    ctx.scale(scale, scale);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 10, 40, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    ctx.fillStyle = '#3a5080';
    ctx.fillRect(-14, 20, 11, 40);
    ctx.fillRect(3, 20, 11, 40);

    // Shoes
    ctx.fillStyle = '#111';
    ctx.fillRect(-16, 58, 14, 8);
    ctx.fillRect(2, 58, 14, 8);

    // Body / shirt
    ctx.fillStyle = '#cc2200';
    ctx.fillRect(-18, -20, 36, 42);

    // Guitar body
    ctx.save();
    ctx.rotate(0.25);
    ctx.fillStyle = '#8B4513';
    ctx.shadowColor = '#ff8800';
    ctx.shadowBlur = 8;
    roundRect(ctx, 10, -10, 30, 22, 5);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Guitar neck
    ctx.fillStyle = '#5c3010';
    ctx.fillRect(-30, -6, 44, 6);
    // Strings
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 0.8;
    for (let s = 0; s < 4; s++) {
        ctx.beginPath();
        ctx.moveTo(-30, -4 + s * 1.5);
        ctx.lineTo(14, -4 + s * 1.5);
        ctx.stroke();
    }
    ctx.restore();

    // Arms
    ctx.fillStyle = '#cc2200';
    // Left arm (down toward guitar)
    ctx.fillRect(-18, -10, 10, 30);
    // Right arm (up on neck)
    ctx.fillRect(8, -10, 10, 20);

    // Head
    ctx.fillStyle = '#d4956a';
    ctx.beginPath();
    ctx.arc(0, -38, 18, 0, Math.PI * 2);
    ctx.fill();

    // Hair
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(0, -50, 14, Math.PI, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(-6, -38, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(6, -38, 2.5, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
}

// --- Drawing: Fretboard ---

function drawFretboard() {
    ctx.save();

    // Clip to fretboard trapezoid
    const topLeft = CANVAS_WIDTH / 2 - FRETBOARD_TOP_WIDTH / 2;
    const topRight = CANVAS_WIDTH / 2 + FRETBOARD_TOP_WIDTH / 2;
    const botLeft = CANVAS_WIDTH / 2 - FRETBOARD_BOTTOM_WIDTH / 2;
    const botRight = CANVAS_WIDTH / 2 + FRETBOARD_BOTTOM_WIDTH / 2;
    const top = FRETBOARD_Y_OFFSET;
    const bot = CANVAS_HEIGHT;

    ctx.beginPath();
    ctx.moveTo(topLeft, top);
    ctx.lineTo(topRight, top);
    ctx.lineTo(botRight, bot);
    ctx.lineTo(botLeft, bot);
    ctx.closePath();
    ctx.clip();

    // Wood base gradient
    const woodGrad = ctx.createLinearGradient(0, top, 0, bot);
    woodGrad.addColorStop(0, 'rgba(30,10,0,0.55)');
    woodGrad.addColorStop(0.3, 'rgba(50,20,5,0.7)');
    woodGrad.addColorStop(0.7, 'rgba(60,28,8,0.78)');
    woodGrad.addColorStop(1, 'rgba(40,15,2,0.85)');
    ctx.fillStyle = woodGrad;
    ctx.fillRect(0, top, CANVAS_WIDTH, bot - top);

    // Wood grain lines
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 40; i++) {
        const gy = top + ((i / 40) * (bot - top));
        // interpolate x extents
        const p = (gy - top) / (bot - top);
        const gLeft = topLeft + (botLeft - topLeft) * p - 10;
        const gRight = topRight + (botRight - topRight) * p + 10;
        ctx.beginPath();
        ctx.moveTo(gLeft, gy);
        ctx.lineTo(gRight, gy + 1.5);
        ctx.strokeStyle = i % 3 === 0 ? '#8B5a2b' : '#6b3a1a';
        ctx.lineWidth = i % 5 === 0 ? 2 : 1;
        ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Dark lane dividers (following perspective)
    for (let i = 0; i <= LANE_COUNT; i++) {
        const tFrac = i / LANE_COUNT;
        const tx = topLeft + tFrac * FRETBOARD_TOP_WIDTH;
        const bx = botLeft + tFrac * FRETBOARD_BOTTOM_WIDTH;
        ctx.beginPath();
        ctx.moveTo(tx, top);
        ctx.lineTo(bx, bot);
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 3;
        ctx.stroke();
        // Thin bright edge
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // Fret lines (horizontal, perspective-foreshortened)
    const fretCount = 3;
    for (let f = 1; f < fretCount; f++) {
        const p = f / fretCount;
        // Use squared progress for perspective bunching at top
        const pp = p * p;
        const gy = top + pp * (bot - top);
        const gLeft = topLeft + (botLeft - topLeft) * pp;
        const gRight = topRight + (botRight - topRight) * pp;
        ctx.beginPath();
        ctx.moveTo(gLeft, gy);
        ctx.lineTo(gRight, gy);
        ctx.strokeStyle = 'rgba(180,120,60,0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    // Center lane subtle highlight
    const cx = CANVAS_WIDTH / 2;
    const centerGlow = ctx.createLinearGradient(cx - 60, 0, cx + 60, 0);
    centerGlow.addColorStop(0, 'rgba(255,255,255,0)');
    centerGlow.addColorStop(0.5, 'rgba(255,255,255,0.04)');
    centerGlow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = centerGlow;
    ctx.fillRect(0, top, CANVAS_WIDTH, bot - top);

    ctx.restore();

    // Hit zone glow strip
    const hitP = 0.93;
    const { leftEdge: hLeft, totalWidth: hTotal, y: hY } = getLaneGeometry(hitP);
    ctx.save();
    ctx.globalAlpha = 0.3;
    const hitGlow = ctx.createLinearGradient(0, hY - 12, 0, hY + 12);
    hitGlow.addColorStop(0, 'rgba(255,255,255,0)');
    hitGlow.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    hitGlow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hitGlow;
    ctx.fillRect(hLeft, hY - 12, hTotal, 24);
    ctx.restore();

    // Hit ring buttons
    const btnP = 0.95;
    for (let i = 0; i < LANE_COUNT; i++) {
        const pos = getLaneCenter(i, btnP);
        const isActive = activeKeys.has(i);
        const flash = buttonFlash[i];
        drawHitButton(pos.x, pos.y, pos.laneWidth * 0.38, LANE_COLORS[i], LANE_COLORS_GLOW[i], isActive, flash);
        buttonFlash[i] = Math.max(0, buttonFlash[i] - 0.07);
    }
}

function drawHitButton(x, y, r, color, glowColor, active, flash = 0) {
    ctx.save();

    const lit = active || flash > 0;
    const flashAlpha = Math.max(active ? 1 : 0, flash);

    if (lit) {
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 20 + flashAlpha * 40;
    }

    // Outer ring
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = lit ? glowColor : color;
    ctx.lineWidth = lit ? 5 : 4;
    ctx.stroke();

    // Inner fill
    ctx.beginPath();
    ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
    const fillGrad = ctx.createRadialGradient(x, y - r * 0.2, 0, x, y, r * 0.72);
    fillGrad.addColorStop(0, lit ? '#ffffff' : shadeColor(color, 40));
    fillGrad.addColorStop(0.4, lit ? glowColor : color);
    fillGrad.addColorStop(1, shadeColor(color, -60));
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // Flash burst ring
    if (flash > 0) {
        ctx.globalAlpha = flash * 0.7;
        ctx.beginPath();
        ctx.arc(x, y, r * (1.2 + (1 - flash) * 0.8), 0, Math.PI * 2);
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 3 * flash;
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // Shine
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(x, y - r * 0.25, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${lit ? 0.5 : 0.2})`;
    ctx.fill();

    ctx.restore();
}

// --- Combo effect ---

function createComboEffect() {
    if (comboEffect) return;
    comboEffect = { alpha: 1, scale: 1, life: 1 };
    const mult = Math.min(3, Math.floor(combo / 10) + 1);
    createParticles(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, PARTICLE_COUNT * mult);
}

function drawComboEffect() {
    if (!comboEffect) return;
    comboEffect.life -= 0.02;
    comboEffect.alpha = comboEffect.life;
    comboEffect.scale = 1 + (1 - comboEffect.life) * 0.5;
    if (comboEffect.life <= 0) { comboEffect = null; return; }

    ctx.save();
    ctx.globalAlpha = comboEffect.alpha;
    ctx.fillStyle = 'white';
    ctx.font = `bold ${Math.round(34 * comboEffect.scale)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ffff00';
    ctx.shadowBlur = 20;
    ctx.fillText(`${combo}x COMBO!`, CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.45);
    ctx.restore();
}

// --- Audio ---

function playBackgroundMusic() {
    backgroundMusic.volume = 0.5;
    backgroundMusic.play().catch(() => {});
}
function playCrowdIntro() {
    crowdIntro.volume = 0.7;
    crowdIntro.play().catch(() => {});
}
function playGoodNote() {
    goodNoteSound.volume = 0.6;
    goodNoteSound.currentTime = 0;
    goodNoteSound.play().catch(() => {});
}
function playBadNote() {
    badNoteSound.volume = 0.4;
    badNoteSound.currentTime = 0;
    badNoteSound.play().catch(() => {});
}
function playCrowdBoo() {
    crowdBoo.volume = 0.6;
    crowdBoo.currentTime = 0;
    crowdBoo.play().catch(() => {});
}

// --- Game logic ---

function startGame() {
    document.getElementById('start-button').classList.add('hidden');
    hideGameOver();
    gameRunning = true;
    gameOver = false;
    score = 0; combo = 0;
    notes = []; particles = [];
    beatCount = 0; lastBeatTime = null;
    gameLoop.missedTotal = 0;
    activeKeys.clear();
    buttonFlash = [0, 0, 0, 0, 0];
    updateScore();
    playCrowdIntro();
    setTimeout(() => {
        playBackgroundMusic();
        lastBeatTime = Date.now();
    }, 2000);
    if (isMobile) touchButtons = buildTouchButtons();
    gameLoop();
}

function updateScore() {
    document.getElementById('score').textContent = score;
    document.getElementById('combo').textContent = combo;
}

function maybeGenerateNotes(now) {
    if (!lastBeatTime) return;
    if (now - lastBeatTime >= BEAT_INTERVAL_MS) {
        lastBeatTime += BEAT_INTERVAL_MS;
        beatCount++;
        const count = (beatCount % 4 === 0) ? 2 : 1;
        const usedLanes = new Set();
        for (let i = 0; i < count; i++) {
            let lane;
            do { lane = Math.floor(Math.random() * LANE_COUNT); } while (usedLanes.has(lane));
            usedLanes.add(lane);
            notes.push(new Note(lane));
        }
    }
}

function createParticles(x, y, count = PARTICLE_COUNT) {
    for (let i = 0; i < count; i++) {
        const color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
        particles.push(new Particle(x, y, color));
    }
}

function handleNoteHit(lane) {
    const hitZoneNotes = notes.filter(n => n.lane === lane && n.isInHitZone() && !n.hit);
    if (hitZoneNotes.length > 0) {
        const note = hitZoneNotes[0];
        note.hit = true;
        note.hitFlash = 1;
        score += 100;
        combo++;
        updateScore();
        playGoodNote();
        buttonFlash[lane] = 1.0;
        const btnPos = getLaneCenter(lane, 0.95);
        createParticles(btnPos.x, btnPos.y);
        if (COMBO_THRESHOLDS.includes(combo)) createComboEffect();
    } else {
        combo = 0;
        updateScore();
        playBadNote();
    }
}

function showGameOver() {
    gameRunning = false;
    gameOver = true;
    backgroundMusic.pause();
    backgroundMusic.currentTime = 0;
    playCrowdBoo();
    document.getElementById('final-score').textContent = score;
    document.getElementById('game-over-overlay').classList.remove('hidden');
}

function hideGameOver() {
    document.getElementById('game-over-overlay').classList.add('hidden');
}

// --- Game loop ---

function gameLoop() {
    if (!gameRunning) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawFretboard();

    const now = Date.now();
    maybeGenerateNotes(now);

    let missedThisFrame = 0;
    notes = notes.filter(note => {
        note.update();
        note.draw();
        if (note.missed && note.progress > 1.05) {
            missedThisFrame++;
            return false;
        }
        return note.progress <= 1.1;
    });

    if (missedThisFrame > 0) {
        gameLoop.missedTotal = (gameLoop.missedTotal || 0) + missedThisFrame;
        if (gameLoop.missedTotal >= 10) { showGameOver(); return; }
    }

    particles = particles.filter(p => {
        const alive = p.update();
        if (alive) p.draw();
        return alive;
    });

    drawComboEffect();

    if (isMobile) touchButtons.forEach(b => b.draw());

    requestAnimationFrame(gameLoop);
}

// --- Event listeners ---

document.getElementById('start-button').addEventListener('click', startGame);
document.getElementById('play-again-button').addEventListener('click', () => {
    gameLoop.missedTotal = 0;
    startGame();
});

document.addEventListener('keydown', (e) => {
    if (!gameRunning) return;
    const lane = KEY_MAPPING[e.code];
    if (lane === undefined) return;
    activeKeys.add(lane);
    handleNoteHit(lane);
});

document.addEventListener('keyup', (e) => {
    const lane = KEY_MAPPING[e.code];
    if (lane !== undefined) activeKeys.delete(lane);
});

if (isMobile) {
    canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchend', e => e.preventDefault(), { passive: false });

    canvas.addEventListener('touchstart', (e) => {
        if (!gameRunning) return;
        Array.from(e.touches).forEach(touch => {
            const rect = canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            touchButtons.forEach(btn => {
                if (btn.isPointInside(x, y)) { btn.activate(); handleNoteHit(btn.lane); }
            });
        });
    });

    canvas.addEventListener('touchmove', (e) => {
        if (!gameRunning) return;
        Array.from(e.touches).forEach(touch => {
            const rect = canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            touchButtons.forEach(btn => {
                if (btn.isPointInside(x, y) && !btn.active) { btn.activate(); handleNoteHit(btn.lane); }
            });
        });
    });
}

// --- Utilities ---

function hexToRgb(hex) {
    hex = hex.replace('#', '');
    return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16)
    };
}

function shadeColor(hex, amt) {
    const { r, g, b } = hexToRgb(hex);
    const clamp = v => Math.max(0, Math.min(255, v));
    return `rgb(${clamp(r + amt)},${clamp(g + amt)},${clamp(b + amt)})`;
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}
