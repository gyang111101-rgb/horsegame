// Game State
const STATE = {
    SETUP: 'setup',
    RACING: 'racing',
    FINISHED: 'finished'
};

// --- AUDIO SYSTEM (Web Audio API) ---
const AudioSys = {
    ctx: null,
    init: () => {
        if (!AudioSys.ctx) {
            AudioSys.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },
    resume: () => {
        if (AudioSys.ctx && AudioSys.ctx.state === 'suspended') {
            AudioSys.ctx.resume();
        }
    },
    playTone: (freq, type, duration, vol = 0.1) => {
        if (!AudioSys.ctx) return;
        const osc = AudioSys.ctx.createOscillator();
        const gain = AudioSys.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, AudioSys.ctx.currentTime);
        gain.gain.setValueAtTime(vol, AudioSys.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, AudioSys.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(AudioSys.ctx.destination);
        osc.start();
        osc.stop(AudioSys.ctx.currentTime + duration);
    },
    playNoise: (duration) => { // Gunshot like
        if (!AudioSys.ctx) return;
        const bufferSize = AudioSys.ctx.sampleRate * duration;
        const buffer = AudioSys.ctx.createBuffer(1, bufferSize, AudioSys.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = AudioSys.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = AudioSys.ctx.createGain();
        gain.gain.setValueAtTime(0.5, AudioSys.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, AudioSys.ctx.currentTime + duration);
        noise.connect(gain);
        gain.connect(AudioSys.ctx.destination);
        noise.start();
    },
    // SFX Methods
    click: () => {
        AudioSys.init(); AudioSys.resume();
        AudioSys.playTone(1200, 'sine', 0.1, 0.1);
    },
    count: () => AudioSys.playTone(600, 'square', 0.1, 0.1),
    gunshot: () => {
        AudioSys.playNoise(0.5);
        AudioSys.playTone(100, 'sawtooth', 0.5, 0.5);
    },
    boost: () => { // Whoosh up - louder and more prominent
        if (!AudioSys.ctx) return;
        const osc = AudioSys.ctx.createOscillator();
        const gain = AudioSys.ctx.createGain();
        const now = AudioSys.ctx.currentTime;
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(1500, now + 0.5);
        osc.type = 'sawtooth'; // More aggressive sound
        gain.gain.setValueAtTime(0.25, now); // Much louder
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain);
        gain.connect(AudioSys.ctx.destination);
        osc.start();
        osc.stop(now + 0.5);
    },
    fatigue: () => { // Downward slide
        if (!AudioSys.ctx) return;
        const osc = AudioSys.ctx.createOscillator();
        const gain = AudioSys.ctx.createGain();
        const now = AudioSys.ctx.currentTime;
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.5);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.5);
        osc.connect(gain);
        gain.connect(AudioSys.ctx.destination);
        osc.start();
        osc.stop(now + 0.5);
    },
    gallop: () => { // Rhythmic clop
        if (!AudioSys.ctx) return;
        const now = AudioSys.ctx.currentTime;
        // Double beat (ta-tum)
        [0, 0.15].forEach(offset => {
            const osc = AudioSys.ctx.createOscillator();
            const gain = AudioSys.ctx.createGain();
            osc.frequency.value = 150; // Low thud
            osc.type = 'triangle';
            gain.gain.setValueAtTime(0.05, now + offset);
            gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.1);
            osc.connect(gain);
            gain.connect(AudioSys.ctx.destination);
            osc.start(now + offset);
            osc.stop(now + offset + 0.1);
        });
    },
    fanfare: () => {
        if (!AudioSys.ctx) return;
        const now = AudioSys.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50, 783.99, 1046.50]; // C E G C G C (Arpeggio)
        const times = [0, 0.2, 0.4, 0.6, 0.8, 1.2];
        const lens = [0.2, 0.2, 0.2, 0.2, 0.2, 1.0];

        notes.forEach((freq, i) => {
            const osc = AudioSys.ctx.createOscillator();
            const gain = AudioSys.ctx.createGain();
            osc.frequency.value = freq;
            osc.type = 'triangle';
            osc.connect(gain);
            gain.connect(AudioSys.ctx.destination);
            osc.start(now + times[i]);
            gain.gain.setValueAtTime(0.2, now + times[i]);
            gain.gain.exponentialRampToValueAtTime(0.001, now + times[i] + lens[i]);
            osc.stop(now + times[i] + lens[i]);
        });
    }
};

let currentState = STATE.SETUP;
let animationFrameId = null;
let gallopTimer = 0; // For scheduling gallop sounds

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
const setupScreen = document.getElementById('setup-screen');
const raceScreen = document.getElementById('race-screen');
const resultScreen = document.getElementById('result-screen');

const bettingListEl = document.querySelector('.betting-list');
const trackContainerEl = document.getElementById('track-container');
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');

// Event Listeners
document.getElementById('start-btn').addEventListener('click', () => {
    AudioSys.click();
    startRace();
});
document.getElementById('reset-btn').addEventListener('click', () => {
    AudioSys.click();
    resetGame();
});

// Initialize on load
document.addEventListener('click', () => {
    AudioSys.init(); // Ensure audio context is ready on first interaction
}, { once: true });

function init() {
    createBettingInputs();
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
    // Map screenName to the new individual screen elements
    const screensMap = {
        'setup': setupScreen,
        'race': raceScreen,
        'result': resultScreen
    };

    Object.values(screensMap).forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none'; // Force hide for clean transition logic
    });

    // Tiny delay to allow display:none to apply then flex
    const target = screensMap[screenName];
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

    // Start Countdown Sequence
    runCountdown(() => {
        // Random start boost for 3 horses to create initial separation
        const shuffledIndices = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
        for (let i = 0; i < 3; i++) {
            const h = horses[shuffledIndices[i]];
            h.mode = 'boost';
            h.modeTimer = 200; // Short 0.2s visual/speed boost
            h.speed = 0.2; // Slight head start velocity
        }

        currentState = STATE.RACING;
        lastTime = performance.now();
        raceStartTime = lastTime; // Set start time
        animationFrameId = requestAnimationFrame(raceLoop);
    });
}

function runCountdown(onComplete) {
    const overlay = document.getElementById('countdown-overlay');
    const steps = ['3', '2', '1', '🔫'];
    let stepIndex = 0;

    overlay.style.display = 'block';

    const nextStep = () => {
        if (stepIndex >= steps.length) {
            overlay.style.display = 'none';
            onComplete();
            return;
        }

        // Reset animation
        overlay.style.animation = 'none';
        overlay.offsetHeight; /* trigger reflow */
        overlay.style.animation = 'zoomIn 0.5s ease-out';

        overlay.textContent = steps[stepIndex];

        // Color & Sound logic
        if (stepIndex === 3) { // '탕!'
            overlay.style.color = '#ff4500';
            overlay.style.textShadow = '0 0 50px #ff0000';
            AudioSys.gunshot();
        } else {
            overlay.style.color = '#fff';
            overlay.style.textShadow = '0 0 30px rgba(255, 204, 0, 0.8)';
            AudioSys.count();
        }

        stepIndex++;
        setTimeout(nextStep, 1000); // 1 second per step
    };

    nextStep();
}

function setupTrack() {
    trackContainerEl.innerHTML = '';

    horses.forEach((h, index) => {
        // Reset state
        h.position = 0;
        h.speed = 0;
        h.rank = null;
        h.rank = null;
        h.finished = false;
        h.finishTime = null; // Reset time
        h.mode = 'normal'; // normal, boost, fatigue
        h.mode = 'normal'; // normal, boost, fatigue
        h.modeTimer = 0;
        h.prevRank = index;
        h.prevRank = index; // Initialize previous rank for tracking changes

        // Create Lane
        const lane = document.createElement('div');
        lane.className = 'lane';

        // Create Horse Element
        const horseEl = document.createElement('div');
        horseEl.className = 'horse';
        horseEl.id = `horse-${index}`;

        // Structure: Visual Wrapper (flipped) + Badge (colored) + Name Tag
        // Note: We use 🏇 (Horse Racing) emoji. It usually faces Left. We need to flip it to face Right.
        const visual = document.createElement('div');
        visual.className = 'horse-visual';
        visual.textContent = '🏇';
        horseEl.appendChild(visual);

        const badge = document.createElement('div');
        badge.className = 'horse-badge';
        badge.textContent = h.id;
        badge.style.backgroundColor = h.color;
        badge.style.boxShadow = `0 0 10px ${h.color}`;
        horseEl.appendChild(badge);

        // Name Tag removed as per request
        // const tag = document.createElement('div');
        // tag.className = 'horse-name-tag';
        // tag.textContent = h.bettor;
        // horseEl.appendChild(tag);

        lane.appendChild(horseEl);
        trackContainerEl.appendChild(lane);
    });
}

// Stats for physics
// Stats for physics
let lastTime = 0;
let raceStartTime = 0; // To track race duration
const MIN_SPEED = 0.1; // A bit faster start
const MAX_SPEED = 0.6; // 1:2 ratio speed (was 0.7 -> 0.5, so 0.6ish)
const ACCEL_VARIANCE = 0.02;
const DISTANCE_SCALE = 0.35; // Track feels balanced (not too long, not too short)

function raceLoop(time) {
    if (currentState !== STATE.RACING) return;

    const delta = time - lastTime;
    lastTime = time;

    // --- Gallop Sound Loop ---
    gallopTimer += delta;
    if (gallopTimer > 350) { // Play every ~350ms
        AudioSys.gallop();
        gallopTimer = 0;
    }

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

                // Always play boost sound
                AudioSys.resume();
                AudioSys.boost();

            } else if (rand < 0.15) {
                h.mode = 'fatigue';
                h.modeTimer = 2000 + Math.random() * 2000; // 2-4s slow

                // Always play fatigue sound
                AudioSys.resume();
                AudioSys.fatigue();

            } else {
                h.mode = 'normal';
                h.modeTimer = 1000 + Math.random() * 2000;
            }
        }

        // --- 2. Speed Calculation ---
        let accel = (Math.random() - 0.5) * ACCEL_VARIANCE;

        // Apply Mode Effects
        if (h.mode === 'boost') {
            accel += 0.015; // Consistent push
        } else if (h.mode === 'fatigue') {
            accel -= 0.008; // Slight drag
        }

        // Very subtle catch-up mechanic (only for extreme gaps)
        if (leader && h !== leader && (leader.position - h.position) > 25) {
            accel += 0.005; // Very gentle help for far stragglers
        }
        if (leader === h && activeHorses.length > 1) {
            // Very rare leader nervousness
            if (Math.random() < 0.05) accel -= 0.01;
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
        if (h.position >= 92 && !h.finished) {
            h.finished = true;
            h.rank = horses.filter(x => x.finished).length; // 1, 2, 3...
            h.finishTime = ((time - raceStartTime) / 1000).toFixed(2); // Record time
        }
    });

    // Update Live Ranking every 10 frames to avoid DOM thrashing
    if (Math.floor(time / 16) % 10 === 0) {
        updateLiveRanking();
    }

    if (allFinished) {
        currentState = STATE.FINISHED;
        setTimeout(showResults, 1000);
    } else {
        animationFrameId = requestAnimationFrame(raceLoop);
    }
}

function updateLiveRanking() {
    // Sort logic: Finshed horses first (by rank), then running horses (by position desc)
    const sorted = [...horses].sort((a, b) => {
        if (a.finished && b.finished) return a.rank - b.rank;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.position - a.position;
    });

    const rankingListEl = document.querySelector('.ranking-list');
    rankingListEl.innerHTML = '';

    sorted.forEach((h, i) => {
        const currentRank = i; // 0-based
        // Calculate Rank Change
        const rankDiff = h.prevRank - currentRank; // Positive = Improved (moved up index 5 -> 0)

        let changeIcon = '<span class="rank-change same">-</span>';
        if (rankDiff > 0) changeIcon = '<span class="rank-change up">▲</span>';
        else if (rankDiff < 0) changeIcon = '<span class="rank-change down">▼</span>';

        // Update prevRank for next frame
        h.prevRank = currentRank;

        const item = document.createElement('div');
        item.className = 'rank-card';
        if (i === 0) item.classList.add('leader');

        item.style.borderLeftColor = h.color;
        item.innerHTML = `
            <span class="rank-num" style="color:${h.color}">${i + 1}</span>
            ${changeIcon}
            <div data-id="${h.id}" style="
                width: 24px; height: 24px; 
                background: ${h.color}; 
                border-radius: 50%; 
                display: flex; justify-content: center; align-items: center; 
                color: #fff; margin-right: 10px; font-size: 0.8rem; font-weight:bold;">
                ${h.id}
            </div>
            <span class="bettor-name-rank">
                ${h.bettor}
            </span>
            ${h.finished ? `<span style="font-size:0.9rem; color:#ccc; margin-left:5px;">${h.finishTime}s</span> <span class="finish-flag">🚩</span>` : ''}
        `;
        rankingListEl.appendChild(item);
    });
}

function showResults() {
    switchScreen('result');
    AudioSys.fanfare(); // Play victory sound

    // Sort horses by rank
    const sortedHorses = [...horses].sort((a, b) => a.rank - b.rank);

    // Fill Podium (Only Rank 1)
    const podiums = [
        { rank: 1, el: document.querySelector('.rank-1') }
    ];

    podiums.forEach(p => {
        const horse = sortedHorses[p.rank - 1];
        if (horse) {
            p.el.querySelector('.horse-avatar').style.backgroundColor = horse.color;
            p.el.querySelector('.horse-avatar').textContent = horse.id;
            p.el.querySelector('.bettor-name').textContent = horse.bettor;

            // Add time display to podium
            let timeEl = p.el.querySelector('.podium-time');
            if (!timeEl) {
                timeEl = document.createElement('div');
                timeEl.className = 'podium-time';
                timeEl.style.color = '#fff';
                timeEl.style.fontSize = '1.2rem';
                timeEl.style.fontWeight = 'bold';
                timeEl.style.marginTop = '0.5rem';
                p.el.appendChild(timeEl);
            }
            timeEl.textContent = `${horse.finishTime}s`;

            // Animation trigger
            p.el.style.opacity = '1';
            p.el.style.transform = 'translateY(0)';
        }
    });

    // Animate podium appearance
    podiums.forEach((p, i) => {
        p.el.style.transitionDelay = `${i * 200}ms`;
    });

    // Fill remaining ranks (Rank 2 ~ 6)
    const rankingContainer = document.querySelector('.full-ranking');
    rankingContainer.innerHTML = '';

    for (let i = 1; i < sortedHorses.length; i++) {
        const horse = sortedHorses[i];
        const item = document.createElement('div');
        item.className = 'rank-item-small';
        item.style.borderLeft = `5px solid ${horse.color}`;
        item.innerHTML = `
            <span style="font-weight:bold; color:#aaa; width:40px;">${i + 1}등</span>
            <div style="display:flex; align-items:center; flex:1;">
                <div style="width:24px; height:24px; border-radius:50%; background:${horse.color}; margin-right:15px; display:flex; justify-content:center; align-items:center; color:#fff; font-weight:bold;">${horse.id}</div>
                <span style="font-size:1.2rem;">${horse.bettor}</span>
            </div>
            <span style="color:#ffd700; font-weight:bold; font-size:1.1rem;">${horse.finishTime}s</span>
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
