// script.js - AR Hand Tracking, fullscreen camera, envelope overlay, pinch&rip
// ---------- DOM Elements ----------
const video = document.getElementById('webcam');
const canvasElement = document.getElementById('handCanvas');
const canvasCtx = canvasElement.getContext('2d');
const envelopeDiv = document.getElementById('envelope');
const rewardPanel = document.getElementById('rewardPanel');
const amountDisplay = document.getElementById('amountDisplay');
const resetBtn = document.getElementById('resetBtn');
const mouseOverlay = document.getElementById('mouseDragOverlay');

// ---------- State ----------
let isOpened = false;
let ripTriggered = false;
let pinchState = 'IDLE';      // IDLE, PINCHED
let pinchStartPoint = null;
let handsDetectionActive = true;
let currentStream = null;
let mediaPipeInitialized = false;
let hands = null;
let camera = null;

// ---------- MediaPipe Hands Setup ----------
function setupHandsAndCamera() {
    if (hands) return; // chỉ khởi tạo một lần

    hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    hands.onResults(onHandResults);

    camera = new Camera(video, {
        onFrame: async () => {
            if (!ripTriggered && !isOpened && handsDetectionActive) {
                await hands.send({ image: video });
            }
        },
        width: 1280,
        height: 720
    });
    camera.start();
}

async function initMediaPipe() {
    if (mediaPipeInitialized) return;
    mediaPipeInitialized = true;

    // Nếu đã có stream, không cần xin lại quyền
    if (currentStream && video.srcObject === currentStream) {
        setupHandsAndCamera();
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        currentStream = stream;
        video.srcObject = stream;
        video.addEventListener('loadeddata', () => {
            video.play();
            setupHandsAndCamera();
        });
    } catch (err) {
        console.warn("Webcam không khả dụng, fallback chuột", err);
        handsDetectionActive = false;
        enableMouseFallback();
    }
}

// Vẽ landmarks và hiệu ứng tương tác
function onHandResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        pinchState = 'IDLE';
        pinchStartPoint = null;
        drawHandLandmarks([]);
        return;
    }

    const landmarks = results.multiHandLandmarks[0];
    drawHandLandmarks(landmarks);

    // Phát hiện pinch (ngón trỏ và ngón cái)
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const distance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
    const pinchThreshold = 0.05;

    if (distance < pinchThreshold && pinchState === 'IDLE' && !ripTriggered && !isOpened) {
        pinchState = 'PINCHED';
        pinchStartPoint = { x: (thumbTip.x + indexTip.x) / 2, y: (thumbTip.y + indexTip.y) / 2 };
        if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(30);
        envelopeDiv.style.filter = "drop-shadow(0 0 18px gold)";
        setTimeout(() => {
            if (pinchState === 'PINCHED') envelopeDiv.style.filter = "";
        }, 200);
    }
    else if (distance >= pinchThreshold && pinchState === 'PINCHED' && !ripTriggered && !isOpened) {
        const currentCenter = { x: (thumbTip.x + indexTip.x) / 2, y: (thumbTip.y + indexTip.y) / 2 };
        if (pinchStartPoint) {
            const moveX = Math.abs(currentCenter.x - pinchStartPoint.x);
            const moveY = Math.abs(currentCenter.y - pinchStartPoint.y);
            if (moveX > 0.12 || moveY > 0.12) {
                triggerRip();
            }
        }
        pinchState = 'IDLE';
        pinchStartPoint = null;
        envelopeDiv.style.filter = "";
    }
}

function drawHandLandmarks(landmarks) {
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    if (!landmarks.length) return;

    if (video.videoWidth) {
        canvasElement.width = video.videoWidth;
        canvasElement.height = video.videoHeight;
    }

    canvasCtx.save();
    canvasCtx.scale(-1, 1);
    canvasCtx.translate(-canvasElement.width, 0);

    for (let i = 0; i < landmarks.length; i++) {
        const lm = landmarks[i];
        const x = lm.x * canvasElement.width;
        const y = lm.y * canvasElement.height;
        canvasCtx.beginPath();
        canvasCtx.arc(x, y, 6, 0, 2 * Math.PI);
        canvasCtx.fillStyle = '#ffcc44';
        canvasCtx.fill();
        canvasCtx.strokeStyle = '#fff';
        canvasCtx.lineWidth = 2;
        canvasCtx.stroke();
    }

    const connections = [
        [0,1], [1,2], [2,3], [3,4],
        [0,5], [5,6], [6,7], [7,8],
        [0,9], [9,10], [10,11], [11,12],
        [0,13], [13,14], [14,15], [15,16],
        [0,17], [17,18], [18,19], [19,20]
    ];
    for (let conn of connections) {
        const start = landmarks[conn[0]];
        const end = landmarks[conn[1]];
        if (start && end) {
            const sx = start.x * canvasElement.width;
            const sy = start.y * canvasElement.height;
            const ex = end.x * canvasElement.width;
            const ey = end.y * canvasElement.height;
            canvasCtx.beginPath();
            canvasCtx.moveTo(sx, sy);
            canvasCtx.lineTo(ex, ey);
            canvasCtx.strokeStyle = '#88ffaa';
            canvasCtx.lineWidth = 3;
            canvasCtx.stroke();
        }
    }

    if (pinchState === 'PINCHED' && landmarks.length > 8) {
        const thumb = landmarks[4];
        const index = landmarks[8];
        const tx = thumb.x * canvasElement.width;
        const ty = thumb.y * canvasElement.height;
        const ix = index.x * canvasElement.width;
        const iy = index.y * canvasElement.height;
        canvasCtx.beginPath();
        canvasCtx.arc(tx, ty, 12, 0, 2 * Math.PI);
        canvasCtx.fillStyle = 'rgba(255,0,0,0.6)';
        canvasCtx.fill();
        canvasCtx.beginPath();
        canvasCtx.arc(ix, iy, 12, 0, 2 * Math.PI);
        canvasCtx.fill();
        canvasCtx.beginPath();
        canvasCtx.moveTo(tx, ty);
        canvasCtx.lineTo(ix, iy);
        canvasCtx.strokeStyle = 'red';
        canvasCtx.lineWidth = 4;
        canvasCtx.stroke();
    }

    canvasCtx.restore();
}

function triggerRip() {
    if (ripTriggered || isOpened) return;
    ripTriggered = true;
    isOpened = true;

    if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(200);
    envelopeDiv.classList.add('rip-active');
    playRipSound();

    setTimeout(() => {
        showReward();
        canvasConfetti({
            particleCount: 200,
            spread: 90,
            origin: { y: 0.6 },
            startVelocity: 20,
            colors: ['#f1c40f', '#e67e22', '#2ecc71', '#f39c12']
        });
        setTimeout(() => {
            canvasConfetti({
                particleCount: 120,
                spread: 130,
                origin: { y: 0.5 },
                startVelocity: 25,
                colors: ['#ffd700', '#ffb347']
            });
        }, 200);
    }, 500);
}

function playRipSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const now = audioCtx.currentTime;
        const duration = 0.3;
        const noise = audioCtx.createBufferSource();
        const bufferSize = audioCtx.sampleRate * duration;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        noise.buffer = buffer;
        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        noise.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        noise.start();
        setTimeout(() => { audioCtx.close().catch(e=>{}); }, 500);
    } catch(e) { console.warn("Audio error", e); }
}

function showReward() {
    let randomAmount;
    const rand = Math.random();
    if (rand < 0.8) {
        const value = Math.floor(Math.random() * 5) + 1; // 1..5
        randomAmount = value * 1000;
    } else {
        const value = Math.floor(Math.random() * 5) + 6; // 6..10
        randomAmount = value * 1000;
    }

    rewardPanel.classList.add('show');
    let start = 0;
    const end = randomAmount;
    const duration = 800;
    const stepTime = 20;
    const steps = duration / stepTime;
    const increment = end / steps;
    let current = 0;
    const counter = setInterval(() => {
        current += increment;
        if (current >= end) {
            clearInterval(counter);
            amountDisplay.innerText = end.toLocaleString('vi-VN');
        } else {
            amountDisplay.innerText = Math.floor(current).toLocaleString('vi-VN');
        }
    }, stepTime);
}

function resetGame() {
    if (!isOpened && !ripTriggered) return;
    isOpened = false;
    ripTriggered = false;
    envelopeDiv.classList.remove('rip-active');
    rewardPanel.classList.remove('show');
    pinchState = 'IDLE';
    pinchStartPoint = null;
}

// Fallback chuột / cảm ứng
let mouseDragging = false;
let dragStartX = 0, dragStartY = 0;

function enableMouseFallback() {
    mouseOverlay.classList.remove('hidden');
    envelopeDiv.addEventListener('mousedown', onMouseDown);
    envelopeDiv.addEventListener('touchstart', onTouchStart);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchmove', onTouchMove);
}

function onMouseDown(e) {
    if (ripTriggered || isOpened) return;
    mouseDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    e.preventDefault();
}

function onMouseMove(e) {
    if (!mouseDragging || ripTriggered || isOpened) return;
    const dx = Math.abs(e.clientX - dragStartX);
    const dy = Math.abs(e.clientY - dragStartY);
    if (dx > 40 || dy > 40) {
        triggerRip();
        mouseDragging = false;
    }
}

function onMouseUp() {
    mouseDragging = false;
}

function onTouchStart(e) {
    if (ripTriggered || isOpened) return;
    const touch = e.touches[0];
    mouseDragging = true;
    dragStartX = touch.clientX;
    dragStartY = touch.clientY;
    e.preventDefault();
}

function onTouchMove(e) {
    if (!mouseDragging || ripTriggered || isOpened) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - dragStartX);
    const dy = Math.abs(touch.clientY - dragStartY);
    if (dx > 40 || dy > 40) {
        triggerRip();
        mouseDragging = false;
    }
}

function onTouchEnd() {
    mouseDragging = false;
}

// Khởi tạo
window.addEventListener('load', () => {
    initMediaPipe().catch(err => {
        console.error("Lỗi webcam, fallback chuột", err);
        handsDetectionActive = false;
        enableMouseFallback();
    });

    resetBtn.addEventListener('click', resetGame);
});

// Cleanup
window.addEventListener('beforeunload', () => {
    if (currentStream) currentStream.getTracks().forEach(track => track.stop());
    if (camera) camera.stop();
});