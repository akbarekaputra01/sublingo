// Fungsi untuk memulai kamera dengan deviceId tertentu
async function initCamera(videoElement, facingMode = 'user', deviceId = null) {
    try {
        const constraints = {
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 30 },
                facingMode: facingMode,
                ...(deviceId && { deviceId: { exact: deviceId } })
            }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;
        return new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                resolve(stream);
            };
        });
    } catch (err) {
        console.error("Error accessing camera:", err);
        throw err;
    }
}

// Fungsi untuk mendapatkan semua kamera yang tersedia
async function getAllCameras() {
    try {
        // Request initial permission to get device labels
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
        tempStream.getTracks().forEach(track => track.stop());

        // Now enumerate devices with proper labels
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(device => device.kind === 'videoinput');

        return cameras.map((camera, index) => ({
            deviceId: camera.deviceId,
            label: camera.label || `Camera ${index + 1}`,
            groupId: camera.groupId
        }));
    } catch (err) {
        console.error('Error enumerating cameras:', err);
        // Fallback: return empty array if no permission
        return [];
    }
}

// Fungsi untuk menghentikan kamera
function stopCameraStream(stream) {
    if (stream) {
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
    }
}

// Fungsi untuk mengambil frame dari video
function captureFrame(videoElement) {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg');
}

// Fungsi untuk menyalin teks ke clipboard
function copyToClipboard(text) {
    return navigator.clipboard.writeText(text).then(() => {
        return true;
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        return false;
    });
}

// Fungsi debounce untuk membatasi frekuensi pemanggilan
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Fungsi untuk populate camera select options
function populateCameraSelect(selectElement, cameras, selectedDeviceId = null) {
    selectElement.innerHTML = '<option value="">Select Camera</option>';

    cameras.forEach((camera, index) => {
        const option = document.createElement('option');
        option.value = camera.deviceId;
        option.text = camera.label;

        // Set default selection
        if (selectedDeviceId) {
            option.selected = camera.deviceId === selectedDeviceId;
        } else {
            option.selected = index === 0;
        }

        selectElement.appendChild(option);
    });
}

// Fungsi untuk requestAnimationFrame dengan kontrol FPS
function requestAnimationFrameWithFPS(callback, fps = 30) {
    let then = performance.now();
    const interval = 1000 / fps;

    return function loop(now) {
        requestAnimationFrame(loop);

        const delta = now - then;
        if (delta > interval) {
            then = now - (delta % interval);
            callback();
        }
    };
}