document.addEventListener('DOMContentLoaded', function() {
    const video = document.getElementById('video');
    const toggleCameraBtn = document.getElementById('toggleCamera');
    const cameraSelect = document.getElementById('cameraSelect');
    const speakTextBtn = document.getElementById('speakText');
    const loadingEl = document.getElementById('loading');
    const resultIndicator = document.getElementById('resultIndicator');
    const detectedCharEl = document.getElementById('detectedChar');
    const detectedConfidenceEl = document.getElementById('detectedConfidence');
    const translatedTextEl = document.getElementById('translatedText');
    const clearTextBtn = document.getElementById('clearText');
    const copyTextBtn = document.getElementById('copyText');

    let stream = null;
    let isProcessing = false;
    let isCameraOn = false;
    let processingInterval = null;
    let cursorInterval = null;
    let lastDetectedChar = '';
    let cameras = [];
    let currentCameraIndex = 0;

    // Event listeners
    toggleCameraBtn.addEventListener('click', toggleCamera);
    cameraSelect.addEventListener('change', handleCameraChange);
    speakTextBtn.addEventListener('click', speakText);
    clearTextBtn.addEventListener('click', clearText);
    copyTextBtn.addEventListener('click', copyText);

    translatedTextEl.textContent = 'Your text will appear here';

    // Inisialisasi
    async function init() {
        await getCameras();
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

    // Handle perubahan kamera dari select
    async function handleCameraChange() {
        const selectedCamera = cameras.find(c => c.deviceId === cameraSelect.value);
        if (selectedCamera && isCameraOn) {
            currentCameraIndex = cameras.indexOf(selectedCamera);
            await stopCamera();
            await startCamera(selectedCamera.deviceId);
        }
    }

    // Mengaktifkan/menonaktifkan kamera
    async function toggleCamera() {
        if (isCameraOn) {
            await stopCamera();
            toggleCameraBtn.textContent = 'Start Camera';
            toggleCameraBtn.classList.remove('btn-danger');
            toggleCameraBtn.classList.add('btn-primary');
            speakTextBtn.disabled = true;
        } else {
            try {
                const selectedDeviceId = cameraSelect.value || (cameras.length > 0 ? cameras[0].deviceId : null);
                await startCamera(selectedDeviceId);
                toggleCameraBtn.textContent = 'Stop Camera';
                toggleCameraBtn.classList.remove('btn-primary');
                toggleCameraBtn.classList.add('btn-danger');
                speakTextBtn.disabled = false;
                isCameraOn = true;
            } catch (error) {
                console.error('Failed to start camera:', error);
                alert('Failed to access camera: ' + error.message);
            }
        }
    }

    // Setup kamera dengan deviceId yang spesifik
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

            return new Promise((resolve, reject) => {
                video.onloadedmetadata = () => {
                    resolve();
                };
                video.onerror = () => {
                    reject(new Error('Video loading error'));
                };
            });
        } catch (err) {
            console.error("Error accessing camera:", err);
            throw err;
        }
    }

    // Memulai kamera
    async function startCamera(deviceId = null) {
        loadingEl.classList.remove('hidden');

        try {
            await setupCamera(deviceId);

            return new Promise((resolve, reject) => {
                video.onloadeddata = () => {
                    loadingEl.classList.add('hidden');
                    // Mulai pemrosesan frame dengan requestAnimationFrame
                    let lastFrameTime = 0;
                    const processFrameLoop = (currentTime) => {
                        if (currentTime - lastFrameTime >= 200) { // 5 FPS untuk mengurangi beban
                            processFrame();
                            lastFrameTime = currentTime;
                        }
                        requestAnimationFrame(processFrameLoop);
                    };

                    requestAnimationFrame(processFrameLoop);
                    resolve();
                };

                video.onerror = () => {
                    loadingEl.classList.add('hidden');
                    reject(new Error('Video loading error'));
                };

                // Timeout untuk video loading
                setTimeout(() => {
                    if (video.readyState < 2) { // HAVE_CURRENT_DATA
                        loadingEl.classList.add('hidden');
                        reject(new Error('Camera timeout'));
                    }
                }, 5000);
            });
        } catch (err) {
            loadingEl.classList.add('hidden');
            throw err;
        }
    }

    // Menghentikan kamera
    async function stopCamera() {
        if (processingInterval) {
            clearInterval(processingInterval);
            processingInterval = null;
        }

        // Hentikan cursor berkedip
        if (cursorInterval) {
            clearInterval(cursorInterval);
            cursorInterval = null;
        }

        // Hapus cursor dari teks
        const text = translatedTextEl.textContent;
        if (text.endsWith('|')) {
            translatedTextEl.textContent = text.slice(0, -1);
        }

        if (stream) {
            stopCameraStream(stream);
            stream = null;
        }

        isCameraOn = false;
        // Sembunyikan result indicator
        resultIndicator.classList.add('hidden');
    }

    // Fungsi untuk menampilkan cursor berkedip
    function startBlinkingCursor() {
        // Hentikan interval sebelumnya jika ada
        if (cursorInterval) {
            clearInterval(cursorInterval);
        }

        // Mulai cursor berkedip
        let showCursor = true;
        cursorInterval = setInterval(() => {
            const text = translatedTextEl.textContent;

            if (showCursor) {
                // Tambahkan cursor jika belum ada
                if (!text.endsWith('|')) {
                    translatedTextEl.textContent = text + '|';
                }
            } else {
                // Hapus cursor jika ada
                if (text.endsWith('|')) {
                    translatedTextEl.textContent = text.slice(0, -1);
                }
            }

            showCursor = !showCursor;
        }, 500);
    }

    // Fungsi untuk update tampilan teks (mirip dev.js)
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

    // Modifikasi di processFrame
    async function processFrame() {
        if (isProcessing || !stream) return;

        isProcessing = true;
        const frameData = captureFrame(video);

        try {
            const response = await fetch('/predict', {
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

            if (data.char && data.char !== '-') {
                detectedCharEl.textContent = data.char.toUpperCase();
                detectedConfidenceEl.textContent = `${data.confidence}%`;
                resultIndicator.classList.remove('hidden');

                if (data.char !== lastDetectedChar) {
                    lastDetectedChar = data.char;

                    // Handle "del" gesture - delete last character
                    if (data.char === 'del') {
                        let currentText = translatedTextEl.textContent;

                        // Remove cursor if present
                        if (currentText.endsWith('|')) {
                            currentText = currentText.slice(0, -1);
                        }

                        // Delete last character if text exists
                        if (currentText && currentText !== 'Your text will appear here') {
                            translatedTextEl.textContent = currentText.slice(0, -1);

                            // If no text left, show placeholder
                            if (translatedTextEl.textContent === '') {
                                translatedTextEl.textContent = 'Your text will appear here';
                                translatedTextEl.classList.remove('has-text');
                            }
                        }
                    }
                    // Handle regular characters
                    else if (data.char !== 'del') {
                        if (translatedTextEl.textContent === 'Your text will appear here') {
                            translatedTextEl.textContent = '';
                        }

                        let currentText = translatedTextEl.textContent;
                        if (currentText.endsWith('|')) {
                            currentText = currentText.slice(0, -1);
                        }

                        if (currentText === '' || currentText.slice(-1) !== data.char) {
                            translatedTextEl.textContent = currentText + data.char;
                        } else {
                            translatedTextEl.textContent = currentText;
                        }

                        // Update text style
                        updateTextDisplay();
                    }

                    // Start cursor blinking in both cases
                    startBlinkingCursor();
                }
            } else {
                resultIndicator.classList.add('hidden');
                lastDetectedChar = '';

                if (translatedTextEl.textContent !== 'Your text will appear here' &&
                    translatedTextEl.textContent !== '') {
                    startBlinkingCursor();
                }
            }

        } catch (err) {
            console.error('Error processing frame:', err);
        } finally {
            isProcessing = false;
        }
    }

    // Modifikasi clearText
    function clearText() {
        translatedTextEl.textContent = 'Your text will appear here';
        translatedTextEl.classList.remove('has-text');

        if (cursorInterval) {
            clearInterval(cursorInterval);
            cursorInterval = null;
        }
    }


    // Text-to-speech
    function speakText() {
        let text = translatedTextEl.textContent;

        // Hapus cursor dari teks sebelum dibacakan
        if (text.endsWith('|')) {
            text = text.slice(0, -1);
        }

        if (text && text !== 'Your text will appear here' && 'speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            window.speechSynthesis.speak(utterance);
        } else {
            alert('No text to speak or text-to-speech is not supported in your browser.');
        }
    }

    // Menyalin teks
    async function copyText() {
        let text = translatedTextEl.textContent;

        // Hapus cursor dari teks sebelum disalin
        if (text.endsWith('|')) {
            text = text.slice(0, -1);
        }

        if (text && text !== 'Your text will appear here') {
            const success = await copyToClipboard(text);
            if (success) {
                // Tampilkan feedback bahwa teks telah disalin
                const originalHtml = copyTextBtn.innerHTML;
                copyTextBtn.innerHTML = '<i class="fas fa-check"></i>';

                setTimeout(() => {
                    copyTextBtn.innerHTML = originalHtml;
                }, 2000);
            }
        }
    }

    // Membersihkan resources saat halaman ditutup
    window.addEventListener('beforeunload', () => {
        if (isCameraOn) {
            stopCamera();
        }
    });

    // Inisialisasi
    init();
});