// Game constants
const CANVAS_WIDTH = window.innerWidth;
const CANVAS_HEIGHT = window.innerHeight;
const NOTE_WIDTH = 60;
const NOTE_HEIGHT = 20;
const NOTE_SPEED = 6;
const LANE_COUNT = 5;
const FRETBOARD_TOP_WIDTH = CANVAS_WIDTH * 0.8;
const FRETBOARD_BOTTOM_WIDTH = CANVAS_WIDTH * 0.9;
const FRETBOARD_Y_OFFSET = CANVAS_HEIGHT * 0.3;
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

// Game state
let gameRunning = false;
let score = 0;
let combo = 0;
let notes = [];
let particles = [];
let lastNoteTime = 0;
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

// Set canvas size
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    console.log('Canvas resized:', canvas.width, canvas.height); // Debugging line to ensure canvas is resized
}

// Initial resize
resizeCanvas();

// Handle window resize
window.addEventListener('resize', resizeCanvas);

// Debugging line to check if game loop is running
console.log('Game loop initialized');

// Note class
class Note {
    constructor(lane) {
        this.lane = lane;
        this.progress = 0; // 0 to 1, represents progress down the fretboard
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
        const scale = 1 + position.z * 0.5; // Scale notes as they travel down
        const width = this.width * scale;
        const height = this.height * scale;

        // Draw note with 3D effect
        ctx.save();
        
        // Create gradient for note
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

        // Draw main note body
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(position.x, position.y, width/2, height/2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Add shine effect
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
        return {
            x: x,
            y: y,
            z: progress
        };
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
        this.life = 1.0; // Full opacity
        this.decay = Math.random() * 0.02 + 0.02;
        this.trail = [];
        this.maxTrailLength = 5;
    }

    update() {
        // Store current position in trail
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
        // Draw trail
        for (let i = 0; i < this.trail.length; i++) {
            const point = this.trail[i];
            const trailLife = point.life * (i / this.trail.length);
            
            // Draw glow effect for trail
            const trailGlowSize = this.size * 2 * (i / this.trail.length);
            const gradient = ctx.createRadialGradient(
                point.x, point.y, 0,
                point.x, point.y, trailGlowSize
            );
            
            // Extract RGB values from the color
            const rgb = this.hexToRgb(this.color);
            
            // Create gradient with fading opacity
            gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${trailLife * 0.4})`);
            gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(point.x, point.y, trailGlowSize, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Draw glow effect
        const glowSize = this.size * 3;
        const gradient = ctx.createRadialGradient(
            this.x, this.y, 0,
            this.x, this.y, glowSize
        );
        
        // Extract RGB values from the color
        const rgb = this.hexToRgb(this.color);
        
        // Create gradient with fading opacity
        gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${this.life * 0.8})`);
        gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, glowSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw particle core
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.life;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
    
    // Helper function to convert hex color to RGB
    hexToRgb(hex) {
        // Remove the hash if it exists
        hex = hex.replace('#', '');
        
        // Parse the hex values
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        return { r, g, b };
    }
}

// Touch button class
class TouchButton {
    constructor(lane, key) {
        this.lane = lane;
        this.key = key;
        this.x = lane * LANE_WIDTH;
        this.y = CANVAS_HEIGHT - 150;
        this.width = LANE_WIDTH;
        this.height = 80;
        this.active = false;
        this.activeTime = 0;
    }
    
    draw() {
        // Draw button background
        ctx.fillStyle = this.active ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // Draw button border
        ctx.strokeStyle = this.active ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        
        // Draw key text
        ctx.fillStyle = 'white';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.key, this.x + this.width / 2, this.y + this.height / 2);
        
        // Update active state
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

// Audio functions
function playBackgroundMusic() {
    backgroundMusic.volume = 0.5;
    backgroundMusic.play().catch(error => console.log('Audio play failed:', error));
}

function playCrowdIntro() {
    crowdIntro.volume = 0.7;
    crowdIntro.play().catch(error => console.log('Audio play failed:', error));
}

function playGoodNote() {
    goodNoteSound.volume = 0.6;
    goodNoteSound.currentTime = 0;
    goodNoteSound.play().catch(error => console.log('Audio play failed:', error));
}

function playBadNote() {
    badNoteSound.volume = 0.4;
    badNoteSound.currentTime = 0;
    badNoteSound.play().catch(error => console.log('Audio play failed:', error));
}

function playCrowdBoo() {
    crowdBoo.volume = 0.6;
    crowdBoo.currentTime = 0;
    crowdBoo.play().catch(error => console.log('Audio play failed:', error));
}

// Game functions
function startGame() {
    // Hide start button
    document.getElementById('start-button').classList.add('hidden');
    
    gameRunning = true;
    score = 0;
    combo = 0;
    notes = [];
    particles = [];
    lastNoteTime = Date.now();
    updateScore();
    
    // Play intro sounds
    playCrowdIntro();
    setTimeout(playBackgroundMusic, 2000);
    
    // Initialize touch buttons for mobile
    if (isMobile) {
        touchButtons = [
            new TouchButton(0, 'A'),
            new TouchButton(1, 'S'),
            new TouchButton(2, 'J'),
            new TouchButton(3, 'K'),
            new TouchButton(4, 'L')
        ];
    }
    
    gameLoop();
}

function updateScore() {
    document.getElementById('score').textContent = score;
    document.getElementById('combo').textContent = combo;
}

function generateNote() {
    const lane = Math.floor(Math.random() * LANE_COUNT);
    notes.push(new Note(lane));
    console.log('Note generated in lane:', lane); // Debugging line to ensure notes are generated
}

function createParticles(x, y, count = PARTICLE_COUNT) {
    for (let i = 0; i < count; i++) {
        const color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
        particles.push(new Particle(x, y, color));
    }
}

function createComboEffect() {
    if (comboEffect) return;
    
    comboEffect = {
        alpha: 1,
        scale: 1,
        life: 1
    };
    
    // Create a burst of particles in the center of the screen
    const centerX = CANVAS_WIDTH / 2;
    const centerY = CANVAS_HEIGHT / 2;
    
    // Create more particles for higher combos
    const particleMultiplier = Math.min(3, Math.floor(combo / 10) + 1);
    createParticles(centerX, centerY, PARTICLE_COUNT * particleMultiplier);
}

function drawComboEffect() {
    if (!comboEffect) return;
    
    // Update effect
    comboEffect.life -= 0.02;
    comboEffect.alpha = comboEffect.life;
    comboEffect.scale = 1 + (1 - comboEffect.life) * 0.5;
    
    if (comboEffect.life <= 0) {
        comboEffect = null;
        return;
    }
    
    // Draw combo text with glow
    ctx.save();
    ctx.globalAlpha = comboEffect.alpha;
    
    // Draw glow
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
    
    // Draw combo text
    ctx.fillStyle = 'white';
    ctx.font = `${30 * comboEffect.scale}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${combo}x COMBO!`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    
    ctx.restore();
}

function drawFretboard() {
    // Draw fretboard background
    ctx.save();
    
    // Create gradient for fretboard
    const gradient = ctx.createLinearGradient(0, FRETBOARD_Y_OFFSET, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, 'rgba(26, 26, 26, 0.85)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
    
    // Draw the fretboard shape with perspective
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo((CANVAS_WIDTH - FRETBOARD_TOP_WIDTH * 0.5)/2, FRETBOARD_Y_OFFSET);
    ctx.lineTo((CANVAS_WIDTH + FRETBOARD_TOP_WIDTH * 0.5)/2, FRETBOARD_Y_OFFSET);
    ctx.lineTo((CANVAS_WIDTH + FRETBOARD_BOTTOM_WIDTH)/2, CANVAS_HEIGHT);
    ctx.lineTo((CANVAS_WIDTH - FRETBOARD_BOTTOM_WIDTH)/2, CANVAS_HEIGHT);
    ctx.closePath();
    ctx.fill();

    // Draw lane lines with perspective
    for (let i = 0; i < LANE_COUNT; i++) {
        const topX = CANVAS_WIDTH/2 + (i - (LANE_COUNT-1)/2) * (FRETBOARD_TOP_WIDTH * 0.5/(LANE_COUNT-1));
        const bottomX = CANVAS_WIDTH/2 + (i - (LANE_COUNT-1)/2) * (FRETBOARD_BOTTOM_WIDTH/(LANE_COUNT-1));
        
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255, 255, 255, 0.2)`;
        ctx.lineWidth = 2;
        ctx.moveTo(topX, FRETBOARD_Y_OFFSET);
        ctx.lineTo(bottomX, CANVAS_HEIGHT);
        ctx.stroke();
    }

    // Draw hit zone
    const hitZoneY = CANVAS_HEIGHT * 0.9;
    const hitZoneWidth = FRETBOARD_BOTTOM_WIDTH * 1.1;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(
        (CANVAS_WIDTH - hitZoneWidth)/2,
        hitZoneY - 10,
        hitZoneWidth,
        20
    );

    // Draw hit buttons
    const buttonY = CANVAS_HEIGHT * 0.95;
    const buttonSpacing = FRETBOARD_BOTTOM_WIDTH / (LANE_COUNT - 1);
    const buttonSize = 40;
    
    for (let i = 0; i < LANE_COUNT; i++) {
        const x = CANVAS_WIDTH/2 + (i - (LANE_COUNT-1)/2) * buttonSpacing;
        
        // Draw button circle
        ctx.beginPath();
        ctx.fillStyle = LANE_COLORS[i];
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.arc(x, buttonY, buttonSize/2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Draw key label
        ctx.fillStyle = 'white';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const key = Object.keys(KEY_MAPPING).find(key => KEY_MAPPING[key] === i);
        ctx.fillText(key.replace('Key', ''), x, buttonY);
    }

    ctx.restore();
}

function handleNoteHit(lane) {
    // Find the closest note in the hit zone
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
        
        // Play good note sound
        playGoodNote();
        
        // Create particles at the hit position
        const hitPos = note.getPosition();
        createParticles(hitPos.x, hitPos.y);
        
        // Check for combo thresholds
        if (COMBO_THRESHOLDS.includes(combo)) {
            createComboEffect();
        }
    } else {
        combo = 0;
        updateScore();
        playBadNote();
    }
}

function gameLoop() {
    if (!gameRunning) return;

    // Clear canvas
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw background elements
    drawFretboard();

    // Generate new notes more frequently (every 500ms instead of 1000ms)
    if (Date.now() - lastNoteTime > 500) {
        generateNote();
        lastNoteTime = Date.now();
    }

    // Update and draw notes
    notes = notes.filter(note => {
        note.update();
        note.draw(ctx);
        return note.progress <= 1;
    });
    
    // Update and draw particles
    particles = particles.filter(particle => {
        const isAlive = particle.update();
        if (isAlive) {
            particle.draw();
        }
        return isAlive;
    });
    
    // Draw combo effect
    drawComboEffect();

    // Draw lane keys
    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ['A', 'S', 'J', 'K', 'L'].forEach((key, i) => {
        ctx.fillText(key, i * LANE_WIDTH + LANE_WIDTH / 2, CANVAS_HEIGHT - 120);
    });
    
    // Draw touch buttons for mobile
    if (isMobile) {
        touchButtons.forEach(button => button.draw());
    }

    requestAnimationFrame(gameLoop);
}

// Event listeners
document.getElementById('start-button').addEventListener('click', startGame);

// Keyboard controls
document.addEventListener('keydown', (event) => {
    if (!gameRunning) return;

    const lane = KEY_MAPPING[event.code];
    if (lane === undefined) return;
    
    handleNoteHit(lane);
});

// Touch controls for mobile
if (isMobile) {
    // Prevent default touch behaviors
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
    }, { passive: false });
    
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
    }, { passive: false });
    
    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
    }, { passive: false });
    
    // Handle touch events
    canvas.addEventListener('touchstart', (e) => {
        if (!gameRunning) return;
        
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        
        // Check if touch is on a button
        touchButtons.forEach(button => {
            if (button.isPointInside(x, y)) {
                button.activate();
                handleNoteHit(button.lane);
            }
        });
    });
    
    // Handle touch move for continuous hits
    canvas.addEventListener('touchmove', (e) => {
        if (!gameRunning) return;
        
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        
        // Check if touch is on a button
        touchButtons.forEach(button => {
            if (button.isPointInside(x, y) && !button.active) {
                button.activate();
                handleNoteHit(button.lane);
            }
        });
    });
}