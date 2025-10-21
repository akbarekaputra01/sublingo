document.addEventListener('DOMContentLoaded', function() {
    const video = document.getElementById('video');
    const videoOriginal = document.getElementById('videoOriginal');
    const overlay = document.getElementById('overlay');
    const ctx = overlay.getContext('2d');
    const toggleCameraBtn = document.getElementById('toggleCamera');
    const cameraSelect = document.getElementById('cameraSelect');
    const clearBtn = document.getElementById('clearBtn');
    const copyBtn = document.getElementById('copyBtn');
    const speakBtn = document.getElementById('speakBtn');
    const statusEl = document.getElementById('status');
    const processingTimeEl = document.getElementById('processingTime');
    const predictedCharEl = document.getElementById('predictedChar');
    const confidenceEl = document.getElementById('confidence');
    const confidenceBar = document.getElementById('confidenceBar');
    const landmarksDataEl = document.getElementById('landmarksData');
    const translatedTextEl = document.getElementById('translatedText');
    const totalPredictionsEl = document.getElementById('totalPredictions');
    const noCameraElement = document.getElementById('noCamera');
    const noCameraOriginalElement = document.getElementById('noCameraOriginal');

    let stream = null;
    let isProcessing = false;
    let processingInterval = null;
    let cursorInterval = null;
    let cameras = [];
    let currentCameraIndex = 0;
    let totalPredictions = 0;
    let totalProcessingTime = 0;

    // Event listeners untuk tombol
    toggleCameraBtn.addEventListener('click', toggleCamera);
    cameraSelect.addEventListener('change', handleCameraChange);
    clearBtn.addEventListener('click', clearText);
    copyBtn.addEventListener('click', copyText);
    speakBtn.addEventListener('click', speakText);

    translatedTextEl.textContent = 'Your text will appear here';

    // Inisialisasi
    async function init() {
        await getCameras();
        resizeCanvas();
    }

    // Dapatkan daftar kamera yang tersedia
    async function getCameras() {
        try {
            cameras = await getAllCameras();
            populateCameraSelect(cameraSelect, cameras);
            return cameras.length > 0;
        } catch (err) {
            console.error('Error getting cameras:', err);
            return false;
        }
    }

    // Mengatur ukuran canvas
    function resizeCanvas() {
        overlay.width = video.videoWidth || 640;
        overlay.height = video.videoHeight || 480;
    }

    // Fungsi untuk mengupdate tampilan teks
    function updateTextDisplay() {
        const text = translatedTextEl.textContent;
        const hasRealText = text !== '' && text !== 'Your text will appear here' && !text.endsWith('|');

        if (hasRealText) {
            translatedTextEl.classList.add('has-text');
        } else {
            translatedTextEl.classList.remove('has-text');
            if (text === '' || text.endsWith('|')) {
                translatedTextEl.textContent = 'Your text will appear here';
            }
        }
    }

    // Fungsi untuk menampilkan cursor berkedip
    function startBlinkingCursor() {
        if (cursorInterval) {
            clearInterval(cursorInterval);
        }

        if (translatedTextEl.textContent === 'Your text will appear here') {
            translatedTextEl.textContent = '';
            translatedTextEl.classList.add('has-text');
        }

        let showCursor = true;
        cursorInterval = setInterval(() => {
            let text = translatedTextEl.textContent;

            if (showCursor) {
                if (!text.endsWith('|')) {
                    translatedTextEl.textContent = text + '|';
                }
            } else {
                if (text.endsWith('|')) {
                    translatedTextEl.textContent = text.slice(0, -1);
                }
            }

            showCursor = !showCursor;
        }, 500);
    }

    // Mengaktifkan atau menonaktifkan kamera
    async function toggleCamera() {
        if (stream) {
            await stopProcessing();
            toggleCameraBtn.innerHTML = '<i class="fas fa-play"></i> Start Camera';
            toggleCameraBtn.classList.remove('btn-danger');
            toggleCameraBtn.classList.add('btn-primary');
            statusEl.textContent = 'Stopped';
        } else {
            try {
                const selectedDeviceId = cameraSelect.value || (cameras.length > 0 ? cameras[0].deviceId : null);
                await startProcessing(selectedDeviceId);
                toggleCameraBtn.innerHTML = '<i class="fas fa-stop"></i> Stop Camera';
                toggleCameraBtn.classList.remove('btn-primary');
                toggleCameraBtn.classList.add('btn-danger');
                statusEl.textContent = 'Running';
            } catch (err) {
                console.error('Error starting camera:', err);
                statusEl.textContent = 'Error: ' + err.message;
                alert('Cannot access camera: ' + err.message);
            }
        }
    }

    // Handle perubahan kamera dari select
    async function handleCameraChange() {
        const selectedCamera = cameras.find(c => c.deviceId === cameraSelect.value);
        if (selectedCamera && stream) {
            currentCameraIndex = cameras.indexOf(selectedCamera);
            await stopProcessing();
            await setupCamera(selectedCamera.deviceId);
            await startProcessing(selectedCamera.deviceId);
        }
    }

    // Setup kamera
    async function setupCamera(deviceId = null) {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }

        try {
            const constraints = {
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    ...(deviceId && { deviceId: { exact: deviceId } })
                }
            };

            stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            videoOriginal.srcObject = stream;

            return new Promise((resolve, reject) => {
                video.onloadedmetadata = () => {
                    resizeCanvas();
                    noCameraElement.style.display = 'none';
                    noCameraOriginalElement.style.display = 'none';
                    video.style.display = 'none'; // Sembunyikan video, tampilkan canvas saja
                    videoOriginal.style.display = 'block';
                    resolve();
                };
                video.onerror = () => {
                    reject(new Error('Video loading error'));
                };
            });
        } catch (err) {
            console.error("Error accessing camera:", err);
            noCameraElement.style.display = 'block';
            noCameraOriginalElement.style.display = 'block';
            video.style.display = 'none';
            videoOriginal.style.display = 'none';
            throw err;
        }
    }

    // Memulai pemrosesan
    async function startProcessing(deviceId = null) {
        if (!stream) {
            await setupCamera(deviceId);
        }

        statusEl.textContent = 'Running';
        statusEl.style.color = 'green';

        // Memulai loop pemrosesan dengan requestAnimationFrame untuk performa lebih baik
        let lastFrameTime = 0;
        const processFrameLoop = (currentTime) => {
            if (currentTime - lastFrameTime >= 100) { // 10 FPS untuk mengurangi beban
                processFrame();
                lastFrameTime = currentTime;
            }
            requestAnimationFrame(processFrameLoop);
        };

        requestAnimationFrame(processFrameLoop);

        if (translatedTextEl.textContent !== '' &&
            translatedTextEl.textContent !== 'Your text will appear here') {
            startBlinkingCursor();
        }
    }

    // Menghentikan pemrosesan
    async function stopProcessing() {
        if (processingInterval) {
            clearInterval(processingInterval);
            processingInterval = null;
        }

        if (cursorInterval) {
            clearInterval(cursorInterval);
            cursorInterval = null;
        }

        let text = translatedTextEl.textContent;
        if (text.endsWith('|')) {
            text = text.slice(0, -1);
            translatedTextEl.textContent = text;
        }

        updateTextDisplay();

        if (stream) {
            stopCameraStream(stream);
            stream = null;
        }

        statusEl.textContent = 'Stopped';
        statusEl.style.color = 'black';
    }

    // Memproses frame
    async function processFrame() {
        if (isProcessing || !stream) return;

        isProcessing = true;
        const frameData = captureFrame(video);
        const startTime = performance.now();

        try {
            const response = await fetch('/predict?debug=true', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ image: frameData })
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const data = await response.json();
            const processingTime = performance.now() - startTime;

            // Update stats
            totalPredictions++;
            totalProcessingTime += processingTime;
            totalPredictionsEl.textContent = totalPredictions;
            processingTimeEl.textContent = Math.round(totalProcessingTime / totalPredictions) + ' ms';

            // Update UI dengan hasil
            predictedCharEl.textContent = data.char;
            confidenceEl.textContent = `${data.confidence}%`;
            confidenceBar.style.width = `${data.confidence}%`;

            if (data.landmarks) {
                landmarksDataEl.textContent = JSON.stringify(data.landmarks, null, 2);
            }

            // Menambahkan karakter ke teks jika berbeda dengan karakter terakhir
            if (data.char && data.char !== '-') {
                let currentText = translatedTextEl.textContent;
                if (currentText.endsWith('|')) {
                    currentText = currentText.slice(0, -1);
                }

                if (currentText === 'Your text will appear here') {
                    currentText = '';
                }

                // cek kalau hasilnya "del"
                if (data.char.toLowerCase() === 'del') {
                    if (currentText.length > 0) {
                        currentText = currentText.slice(0, -1);
                        if (currentText === '') {
                            translatedTextEl.textContent = 'Your text will appear here';
                            translatedTextEl.classList.remove('has-text');
                        } else {
                            translatedTextEl.textContent = currentText;
                            translatedTextEl.classList.add('has-text');
                        }
                    }
                } else {
                    // normal: tambahin huruf kalau beda dari sebelumnya
                    if (currentText === '' || currentText.slice(-1) !== data.char) {
                        translatedTextEl.textContent = currentText + data.char;
                        translatedTextEl.classList.add('has-text');
                        startBlinkingCursor();
                    }
                }
            }


            // Draw the processed image with landmarks
            const img = new Image();
            img.onload = function() {
                ctx.clearRect(0, 0, overlay.width, overlay.height);
                ctx.drawImage(img, 0, 0, overlay.width, overlay.height);
            };
            img.src = data.image || frameData;

        } catch (err) {
            console.error('Error processing frame:', err);
        } finally {
            isProcessing = false;
        }
    }

    // Membersihkan teks
    function clearText() {
        translatedTextEl.textContent = 'Your text will appear here';
        translatedTextEl.classList.remove('has-text');

        if (cursorInterval) {
            clearInterval(cursorInterval);
            cursorInterval = null;
        }
    }

    // Menyalin text
    async function copyText() {
        let text = translatedTextEl.textContent;

        if (text.endsWith('|')) {
            text = text.slice(0, -1);
        }

        if (text && text !== 'Your text will appear here') {
            const success = await copyToClipboard(text);
            if (success) {
                // Feedback visual
                const originalHtml = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => {
                    copyBtn.innerHTML = originalHtml;
                }, 2000);
            }
        }
    }

    // Text-to-speech
    function speakText() {
        let text = translatedTextEl.textContent;

        if (text.endsWith('|')) {
            text = text.slice(0, -1);
        }

        if (text && text !== 'Your text will appear here' && 'speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            window.speechSynthesis.speak(utterance);
        }
    }

    // Membersihkan resources saat halaman ditutup
    window.addEventListener('beforeunload', () => {
        if (stream) {
            stopProcessing();
        }
    });

    // Inisialisasi
    init();
    updateTextDisplay();
});