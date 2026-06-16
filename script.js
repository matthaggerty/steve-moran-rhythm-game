// Game constants
const NOTE_WIDTH = 60;
const NOTE_HEIGHT = 20;
const NOTE_SPEED = 6;
const LANE_COUNT = 5;
const KEY_MAPPING = {
    'KeyA': 0,
    'KeyS': 1,
    'KeyJ': 2,
    'KeyK': 3,
    'KeyL': 4
};

// Colors for each lane
const LANE_COLORS = [
    '#28a745', // Green
    '#dc3545', // Red
    '#ffc107', // Yellow
    '#17a2b8', // Blue
    '#ff6b6b'  // Orange
];

// Particle system constants
const PARTICLE_COUNT = 15;
const PARTICLE_COLORS = ['#ff4081', '#00ff00', '#ffff00', '#00ffff', '#ff00ff'];
const COMBO_THRESHOLDS = [5, 10, 20, 50];

// Beat-sync: BPM of "the-return-of-the-rebel.mp3"
const SONG_BPM = 130;
const BEAT_INTERVAL_MS = (60 / SONG_BPM) * 1000;

// Game state
let gameRunning = false;
let gameOver = false;
let score = 0;
let combo = 0;
let notes = [];
let particles = [];
let lastBeatTime = 0;
let beatCount = 0;
let comboEffect = null;
let touchButtons = [];
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Audio elements
const backgroundMusic = document.getElementById('background-music');
const crowdIntro = document.getElementById('crowd-intro');
const goodNoteSound = document.getElementById('good-note');
const badNoteSound = document.getElementById('bad-note');
const crowdBoo = document.getElementById('crowd-boo');

// Get canvas context
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Canvas dimensions — updated on resize
let CANVAS_WIDTH = window.innerWidth;
let CANVAS_HEIGHT = window.innerHeight;
let FRETBOARD_TOP_WIDTH = CANVAS_WIDTH * 0.8;
let FRETBOARD_BOTTOM_WIDTH = CANVAS_WIDTH * 0.9;
let FRETBOARD_Y_OFFSET = CANVAS_HEIGHT * 0.3;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    CANVAS_WIDTH = canvas.width;
    CANVAS_HEIGHT = canvas.height;
    FRETBOARD_TOP_WIDTH = CANVAS_WIDTH * 0.8;
    FRETBOARD_BOTTOM_WIDTH = CANVAS_WIDTH * 0.9;
    FRETBOARD_Y_OFFSET = CANVAS_HEIGHT * 0.3;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Note class
class Note {
    constructor(lane) {
        this.lane = lane;
        this.progress = 0;
        this.hit = false;
        this.missed = false;
        this.width = NOTE_WIDTH;
        this.height = NOTE_HEIGHT;
    }

    update() {
        if (!this.hit) {
            this.progress += NOTE_SPEED / 1000;
            if (this.progress > 1 && !this.missed) {
                this.missed = true;
                playBadNote();
            }
        }
    }

    draw(ctx) {
        const position = this.getPosition();
        const scale = 1 + position.z * 0.5;
        const width = this.width * scale;
        const height = this.height * scale;

        ctx.save();

        const gradient = ctx.createLinearGradient(
            position.x - width/2, position.y,
            position.x + width/2, position.y
        );

        if (this.hit) {
            gradient.addColorStop(0, '#00ff00');
            gradient.addColorStop(1, '#00aa00');
        } else if (this.missed) {
            gradient.addColorStop(0, '#ff0000');
            gradient.addColorStop(1, '#aa0000');
        } else {
            const color = LANE_COLORS[this.lane];
            gradient.addColorStop(0, color);
            gradient.addColorStop(0.5, '#ffffff');
            gradient.addColorStop(1, color);
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(position.x, position.y, width/2, height/2, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.ellipse(position.x, position.y - height/4, width/2.5, height/4, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    getPosition() {
        const progress = this.progress;
        const laneWidth = (FRETBOARD_TOP_WIDTH - FRETBOARD_BOTTOM_WIDTH) * progress + FRETBOARD_BOTTOM_WIDTH;
        const laneSpacing = laneWidth / (LANE_COUNT - 1);
        const centerX = CANVAS_WIDTH / 2;
        const x = centerX + (this.lane - (LANE_COUNT-1)/2) * laneSpacing;
        const y = FRETBOARD_Y_OFFSET + (CANVAS_HEIGHT - FRETBOARD_Y_OFFSET) * progress;
        return { x, y, z: progress };
    }

    isInHitZone() {
        return this.progress >= 0.9 && this.progress <= 0.98;
    }
}

// Particle class
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
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
        if (this.trail.length > this.maxTrailLength) {
            this.trail.shift();
        }
        this.x += this.speedX;
        this.y += this.speedY;
        this.speedY += this.gravity;
        this.life -= this.decay;
        return this.life > 0;
    }

    draw() {
        for (let i = 0; i < this.trail.length; i++) {
            const point = this.trail[i];
            const trailLife = point.life * (i / this.trail.length);
            const trailGlowSize = this.size * 2 * (i / this.trail.length);
            const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, trailGlowSize);
            const rgb = hexToRgb(this.color);
            gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${trailLife * 0.4})`);
            gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(point.x, point.y, trailGlowSize, 0, Math.PI * 2);
            ctx.fill();
        }

        const glowSize = this.size * 3;
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowSize);
        const rgb = hexToRgb(this.color);
        gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${this.life * 0.8})`);
        gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, glowSize, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.life;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

function hexToRgb(hex) {
    hex = hex.replace('#', '');
    return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16)
    };
}

// Touch button class
class TouchButton {
    constructor(lane, key, x, y, width, height) {
        this.lane = lane;
        this.key = key;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.active = false;
        this.activeTime = 0;
    }

    draw() {
        ctx.fillStyle = this.active ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.strokeStyle = this.active ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        ctx.fillStyle = 'white';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.key, this.x + this.width / 2, this.y + this.height / 2);
        if (this.active) {
            this.activeTime += 1;
            if (this.activeTime > 10) {
                this.active = false;
                this.activeTime = 0;
            }
        }
    }

    isPointInside(x, y) {
        return x >= this.x && x <= this.x + this.width &&
               y >= this.y && y <= this.y + this.height;
    }

    activate() {
        this.active = true;
        this.activeTime = 0;
    }
}

function buildTouchButtons() {
    const buttonWidth = CANVAS_WIDTH / LANE_COUNT;
    const buttonHeight = 80;
    const buttonY = CANVAS_HEIGHT - buttonHeight - 20;
    return ['A', 'S', 'J', 'K', 'L'].map((key, i) =>
        new TouchButton(i, key, i * buttonWidth, buttonY, buttonWidth, buttonHeight)
    );
}

// Audio functions
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

// Game functions
function startGame() {
    document.getElementById('start-button').classList.add('hidden');
    hideGameOver();

    gameRunning = true;
    gameOver = false;
    score = 0;
    combo = 0;
    notes = [];
    particles = [];
    beatCount = 0;
    lastBeatTime = null;
    updateScore();

    playCrowdIntro();
    setTimeout(() => {
        playBackgroundMusic();
        lastBeatTime = Date.now();
    }, 2000);

    if (isMobile) {
        touchButtons = buildTouchButtons();
    }

    gameLoop();
}

function updateScore() {
    document.getElementById('score').textContent = score;
    document.getElementById('combo').textContent = combo;
}

// Beat-synced note generation: spawn 1-2 notes per beat, alternating patterns
function maybeGenerateNotes(now) {
    if (!lastBeatTime) return;
    if (now - lastBeatTime >= BEAT_INTERVAL_MS) {
        lastBeatTime += BEAT_INTERVAL_MS;
        beatCount++;

        // Spawn 1 note every beat, 2 notes every 4th beat
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

function createComboEffect() {
    if (comboEffect) return;
    comboEffect = { alpha: 1, scale: 1, life: 1 };
    const particleMultiplier = Math.min(3, Math.floor(combo / 10) + 1);
    createParticles(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, PARTICLE_COUNT * particleMultiplier);
}

function drawComboEffect() {
    if (!comboEffect) return;

    comboEffect.life -= 0.02;
    comboEffect.alpha = comboEffect.life;
    comboEffect.scale = 1 + (1 - comboEffect.life) * 0.5;

    if (comboEffect.life <= 0) {
        comboEffect = null;
        return;
    }

    ctx.save();
    ctx.globalAlpha = comboEffect.alpha;

    const glowSize = 20 * comboEffect.scale;
    const gradient = ctx.createRadialGradient(
        CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 0,
        CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, glowSize
    );
    gradient.addColorStop(0, `rgba(255, 255, 255, ${comboEffect.alpha * 0.8})`);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, glowSize, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'white';
    ctx.font = `${30 * comboEffect.scale}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${combo}x COMBO!`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

    ctx.restore();
}

function drawFretboard() {
    ctx.save();

    const gradient = ctx.createLinearGradient(0, FRETBOARD_Y_OFFSET, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, 'rgba(26, 26, 26, 0.85)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.85)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo((CANVAS_WIDTH - FRETBOARD_TOP_WIDTH * 0.5)/2, FRETBOARD_Y_OFFSET);
    ctx.lineTo((CANVAS_WIDTH + FRETBOARD_TOP_WIDTH * 0.5)/2, FRETBOARD_Y_OFFSET);
    ctx.lineTo((CANVAS_WIDTH + FRETBOARD_BOTTOM_WIDTH)/2, CANVAS_HEIGHT);
    ctx.lineTo((CANVAS_WIDTH - FRETBOARD_BOTTOM_WIDTH)/2, CANVAS_HEIGHT);
    ctx.closePath();
    ctx.fill();

    for (let i = 0; i < LANE_COUNT; i++) {
        const topX = CANVAS_WIDTH/2 + (i - (LANE_COUNT-1)/2) * (FRETBOARD_TOP_WIDTH * 0.5/(LANE_COUNT-1));
        const bottomX = CANVAS_WIDTH/2 + (i - (LANE_COUNT-1)/2) * (FRETBOARD_BOTTOM_WIDTH/(LANE_COUNT-1));
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.moveTo(topX, FRETBOARD_Y_OFFSET);
        ctx.lineTo(bottomX, CANVAS_HEIGHT);
        ctx.stroke();
    }

    const hitZoneY = CANVAS_HEIGHT * 0.9;
    const hitZoneWidth = FRETBOARD_BOTTOM_WIDTH * 1.1;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect((CANVAS_WIDTH - hitZoneWidth)/2, hitZoneY - 10, hitZoneWidth, 20);

    const buttonY = CANVAS_HEIGHT * 0.95;
    const buttonSpacing = FRETBOARD_BOTTOM_WIDTH / (LANE_COUNT - 1);
    const buttonSize = 40;

    for (let i = 0; i < LANE_COUNT; i++) {
        const x = CANVAS_WIDTH/2 + (i - (LANE_COUNT-1)/2) * buttonSpacing;
        ctx.beginPath();
        ctx.fillStyle = LANE_COLORS[i];
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.arc(x, buttonY, buttonSize/2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'white';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const key = Object.keys(KEY_MAPPING).find(k => KEY_MAPPING[k] === i);
        ctx.fillText(key.replace('Key', ''), x, buttonY);
    }

    ctx.restore();
}

function handleNoteHit(lane) {
    const hitZoneNotes = notes.filter(note =>
        note.lane === lane &&
        note.isInHitZone() &&
        !note.hit
    );

    if (hitZoneNotes.length > 0) {
        const note = hitZoneNotes[0];
        note.hit = true;
        score += 100;
        combo++;
        updateScore();
        playGoodNote();
        const hitPos = note.getPosition();
        createParticles(hitPos.x, hitPos.y);
        if (COMBO_THRESHOLDS.includes(combo)) {
            createComboEffect();
        }
    } else {
        combo = 0;
        updateScore();
        playBadNote();
    }
}

// Game over
function showGameOver() {
    gameRunning = false;
    gameOver = true;
    backgroundMusic.pause();
    backgroundMusic.currentTime = 0;
    playCrowdBoo();

    const overlay = document.getElementById('game-over-overlay');
    document.getElementById('final-score').textContent = score;
    overlay.classList.remove('hidden');
}

function hideGameOver() {
    document.getElementById('game-over-overlay').classList.add('hidden');
}

function gameLoop() {
    if (!gameRunning) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawFretboard();

    const now = Date.now();
    maybeGenerateNotes(now);

    // Count missed notes; end game after 10 missed
    let missedThisFrame = 0;
    notes = notes.filter(note => {
        note.update();
        note.draw(ctx);
        if (note.missed && note.progress > 1.05) {
            missedThisFrame++;
            return false;
        }
        return note.progress <= 1.1;
    });

    if (missedThisFrame > 0) {
        // track total misses for game over
        gameLoop.missedTotal = (gameLoop.missedTotal || 0) + missedThisFrame;
        if (gameLoop.missedTotal >= 10) {
            showGameOver();
            return;
        }
    }

    particles = particles.filter(particle => {
        const isAlive = particle.update();
        if (isAlive) particle.draw();
        return isAlive;
    });

    drawComboEffect();

    if (isMobile) {
        touchButtons.forEach(button => button.draw());
    }

    requestAnimationFrame(gameLoop);
}

// Event listeners
document.getElementById('start-button').addEventListener('click', startGame);
document.getElementById('play-again-button').addEventListener('click', () => {
    gameLoop.missedTotal = 0;
    startGame();
});

document.addEventListener('keydown', (event) => {
    if (!gameRunning) return;
    const lane = KEY_MAPPING[event.code];
    if (lane === undefined) return;
    handleNoteHit(lane);
});

if (isMobile) {
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchend', (e) => { e.preventDefault(); }, { passive: false });

    canvas.addEventListener('touchstart', (e) => {
        if (!gameRunning) return;
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        touchButtons.forEach(button => {
            if (button.isPointInside(x, y)) {
                button.activate();
                handleNoteHit(button.lane);
            }
        });
    });

    canvas.addEventListener('touchmove', (e) => {
        if (!gameRunning) return;
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        touchButtons.forEach(button => {
            if (button.isPointInside(x, y) && !button.active) {
                button.activate();
                handleNoteHit(button.lane);
            }
        });
    });
}
