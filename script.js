// Game State
const STATE = {
    SETUP: 'setup',
    RACING: 'racing',
    FINISHED: 'finished'
};

let currentState = STATE.SETUP;
let animationFrameId = null;

// Game Configuration
const HORSE_COUNT = 6;
const WINNING_DISTANCE = 92; // Percentage of track width (considering horse width)

// Colors mapped from CSS
const COLORS = [
    'var(--h1-color)',
    'var(--h2-color)',
    'var(--h3-color)',
    'var(--h4-color)',
    'var(--h5-color)',
    'var(--h6-color)'
];

// Horse Data
let horses = [];

// DOM Elements
const app = document.getElementById('app');
const screens = {
    setup: document.getElementById('setup-screen'),
    race: document.getElementById('race-screen'),
    result: document.getElementById('result-screen')
};

const bettingListEl = document.querySelector('.betting-list');
const trackContainerEl = document.getElementById('track-container');
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');

// Initialize Game
function init() {
    createBettingInputs();
    startBtn.addEventListener('click', startRace);
    resetBtn.addEventListener('click', resetGame);
}

function createBettingInputs() {
    bettingListEl.innerHTML = '';
    horses = [];

    for (let i = 0; i < HORSE_COUNT; i++) {
        // Initialize horse data
        horses.push({
            id: i + 1,
            color: COLORS[i],
            bettor: '',
            position: 0,
            speed: 0,
            rank: null,
            finished: false,
            wobble: 0
        });

        // Create UI
        const item = document.createElement('div');
        item.className = 'bet-item';
        item.style.borderLeftColor = COLORS[i];

        item.innerHTML = `
            <div class="horse-badge" style="background-color: ${COLORS[i]}">${i + 1}</div>
            <input type="text" id="bet-input-${i}" placeholder="이름 입력 (말 ${i + 1})" autocomplete="off">
        `;
        bettingListEl.appendChild(item);
    }
}

function switchScreen(screenName) {
    Object.values(screens).forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none'; // Force hide for clean transition logic
    });

    // Tiny delay to allow display:none to apply then flex
    const target = screens[screenName];
    target.style.display = 'flex';

    // Force reflow for transition
    void target.offsetWidth;
    target.classList.add('active');
}

function startRace() {
    // Collect bettor names
    let hasNames = false;
    for (let i = 0; i < HORSE_COUNT; i++) {
        const input = document.getElementById(`bet-input-${i}`);
        const name = input.value.trim() || `Player ${i + 1}`;
        horses[i].bettor = name;
        if (input.value.trim()) hasNames = true;
    }

    if (!hasNames) {
        // Optional: warn user if no names entered? nah, just go with defaults for quick play
    }

    setupTrack();
    switchScreen('race');

    // Start countdown or just go? "RACE START" header is there.
    // Let's create a small delay before they start running
    setTimeout(() => {
        currentState = STATE.RACING;
        lastTime = performance.now();
        animationFrameId = requestAnimationFrame(raceLoop);
    }, 1000);
}

function setupTrack() {
    trackContainerEl.innerHTML = '';

    horses.forEach((h, index) => {
        // Reset state
        h.position = 0;
        h.speed = 0;
        h.rank = null;
        h.finished = false;
        h.mode = 'normal'; // normal, boost, fatigue
        h.modeTimer = 0;

        // Create Lane
        const lane = document.createElement('div');
        lane.className = 'lane';

        // Create Horse Element
        const horseEl = document.createElement('div');
        horseEl.className = 'horse';
        horseEl.id = `horse-${index}`;
        horseEl.textContent = h.id;
        horseEl.style.backgroundColor = h.color;

        // Name Tag
        const tag = document.createElement('div');
        tag.className = 'horse-name-tag';
        tag.textContent = h.bettor;
        horseEl.appendChild(tag);

        lane.appendChild(horseEl);
        trackContainerEl.appendChild(lane);
    });
}

// Stats for physics
// Stats for physics
let lastTime = 0;
const MIN_SPEED = 0.1; // A bit faster start
const MAX_SPEED = 0.6; // 1:2 ratio speed (was 0.7 -> 0.5, so 0.6ish)
const ACCEL_VARIANCE = 0.02;
const DISTANCE_SCALE = 0.35; // Track feels balanced (not too long, not too short)

function raceLoop(time) {
    if (currentState !== STATE.RACING) return;

    const delta = time - lastTime;
    lastTime = time;

    let allFinished = true;

    // Calculate current ranks for rubber banding
    const activeHorses = horses.filter(h => !h.finished);
    activeHorses.sort((a, b) => b.position - a.position);
    const leader = activeHorses[0];
    const last = activeHorses[activeHorses.length - 1];

    horses.forEach((h, index) => {
        if (h.finished) return;

        allFinished = false;

        // --- 1. Mode Update Logic (Longer durations) ---
        h.modeTimer -= delta;
        if (h.modeTimer <= 0) {
            // Decide new mode
            const rand = Math.random();
            if (rand < 0.05) {
                h.mode = 'boost';
                h.modeTimer = 2000 + Math.random() * 3000; // 2-5s boost
            } else if (rand < 0.15) {
                h.mode = 'fatigue';
                h.modeTimer = 2000 + Math.random() * 2000; // 2-4s slow
            } else {
                h.mode = 'normal';
                h.modeTimer = 1000 + Math.random() * 2000;
            }
        }

        // --- 2. Speed Calculation ---
        let targetSpeed = h.speed;
        let accel = (Math.random() - 0.5) * ACCEL_VARIANCE;

        // Apply Mode Effects
        if (h.mode === 'boost') {
            accel += 0.015; // Consistent push
        } else if (h.mode === 'fatigue') {
            accel -= 0.008; // Slight drag
        }

        // Rubber Banding (Catch-up & Drama)
        if (leader && h !== leader && (leader.position - h.position) > 15) {
            accel += 0.01; // Help stragglers
        }
        if (leader === h && activeHorses.length > 1) {
            // Leader nervousness (slight random drag to allow overtakes)
            if (Math.random() < 0.1) accel -= 0.02;
        }

        h.speed += accel;
        h.speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, h.speed));

        // --- 3. Position Update ---
        h.position += h.speed * (delta / 16) * DISTANCE_SCALE;

        // --- 4. Visual Animation & Effects ---
        const horseEl = document.getElementById(`horse-${index}`);
        if (horseEl) {
            // Update Classes for Visual Effects
            if (h.mode === 'boost') {
                horseEl.classList.add('boost');
                horseEl.classList.remove('fatigue');
            } else if (h.mode === 'fatigue') {
                horseEl.classList.add('fatigue');
                horseEl.classList.remove('boost');
            } else {
                horseEl.classList.remove('boost', 'fatigue');
            }

            // Bobbing calculation
            const bobFreq = time / (150 - h.speed * 100);
            const bobAmp = 2 + h.speed * 5;

            const wobbleY = Math.sin(bobFreq + index) * bobAmp;

            // Rotation
            const rotation = Math.sin(bobFreq + index + Math.PI / 2) * (5 + h.speed * 10);

            horseEl.style.transform = `translateY(${wobbleY}px) rotate(${rotation}deg)`;
            horseEl.style.left = `${Math.min(h.position, 92)}%`;

            // Z-index handling
            if (h.speed > 0.4 || h.mode === 'boost') horseEl.style.zIndex = 100;
            else horseEl.style.zIndex = 10;
        }

        // Check Finish
        if (h.position >= 92) {
            h.finished = true;
            h.rank = horses.filter(x => x.finished).length; // 1, 2, 3...
        }
    });

    if (allFinished) {
        currentState = STATE.FINISHED;
        setTimeout(showResults, 1000);
    } else {
        animationFrameId = requestAnimationFrame(raceLoop);
    }
}

function showResults() {
    switchScreen('result');

    // Sort horses by rank
    const sortedHorses = [...horses].sort((a, b) => a.rank - b.rank);

    // Fill Podium
    const podiums = [
        { rank: 1, el: document.querySelector('.rank-1') },
        { rank: 2, el: document.querySelector('.rank-2') },
        { rank: 3, el: document.querySelector('.rank-3') }
    ];

    podiums.forEach(p => {
        const horse = sortedHorses[p.rank - 1];
        if (horse) {
            p.el.querySelector('.horse-avatar').style.backgroundColor = horse.color;
            p.el.querySelector('.horse-avatar').textContent = horse.id;
            p.el.querySelector('.bettor-name').textContent = horse.bettor;

            // Animation trigger
            p.el.style.opacity = '1';
            p.el.style.transform = 'translateY(0)';
        }
    });

    // Animate podium appearance staggered
    podiums.forEach((p, i) => {
        p.el.style.transitionDelay = `${i * 200}ms`;
        // Force reflow handled by switchScreen void
    });

    // Fill remaining ranks
    const rankingContainer = document.querySelector('.full-ranking');
    rankingContainer.innerHTML = '';

    for (let i = 3; i < sortedHorses.length; i++) {
        const horse = sortedHorses[i];
        const item = document.createElement('div');
        item.className = 'rank-item-small';
        item.innerHTML = `
            <span style="font-weight:bold; color:#aaa;">${i + 1}등</span>
            <div style="display:flex; align-items:center;">
                <div style="width:20px; height:20px; border-radius:50%; background:${horse.color}; margin-right:10px; display:flex; justify-content:center; align-items:center; font-size:0.8rem;">${horse.id}</div>
                <span>${horse.bettor}</span>
            </div>
        `;
        rankingContainer.appendChild(item);
    }
}

function resetGame() {
    // Clear inputs? Or keep them? Usually people want to play again with same names or slight change.
    // Let's keep names but reset betting inputs can be manually cleared if needed.
    // actually, let's keep the names in the inputs so they can just edit.

    switchScreen('setup');
    currentState = STATE.SETUP;

    // Reset podium styles for next time
    document.querySelectorAll('.podium-item').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(50px)';
        el.style.transitionDelay = '0ms';
    });
}

// Start
init();
