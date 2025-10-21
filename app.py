from flask import Flask, render_template, request, jsonify, redirect, url_for
import pickle
import cv2
import mediapipe as mp
import numpy as np
import base64
import time
import threading

app = Flask(__name__)

# Load model
model_dict = pickle.load(open('model.p', 'rb'))
model = model_dict['model']
expected_len = model.n_features_in_

# MediaPipe
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles

# Global variables for real-time processing
processing_lock = threading.Lock()
current_frame = None
frame_updated = False

def process_frames():
    """Background thread for continuous frame processing"""
    global current_frame, frame_updated
    
    # Initialize hands detector for continuous processing
    hands_realtime = mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=1,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )
    
    while True:
        with processing_lock:
            if current_frame is not None and frame_updated:
                frame = current_frame.copy()
                frame_updated = False
                
                # Process the frame
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = hands_realtime.process(frame_rgb)
                
                if results.multi_hand_landmarks:
                    for hand_landmarks in results.multi_hand_landmarks:
                        # Draw landmarks
                        mp_drawing.draw_landmarks(
                            frame,
                            hand_landmarks,
                            mp_hands.HAND_CONNECTIONS,
                            mp_drawing_styles.get_default_hand_landmarks_style(),
                            mp_drawing_styles.get_default_hand_connections_style()
                        )
                        
                        # Extract and normalize landmarks
                        lm_array = np.array([[lm.x, lm.y] for lm in hand_landmarks.landmark])
                        x_min, y_min = lm_array.min(axis=0)
                        data_aux = (lm_array - [x_min, y_min]).flatten()
                        data_aux = np.pad(data_aux, (0, max(0, expected_len - len(data_aux))))[:expected_len]
                        
                        # Predict
                        if hasattr(model, 'predict_proba'):
                            probabilities = model.predict_proba([data_aux])[0]
                            predicted_index = model.predict([data_aux])[0]
                            confidence = round(max(probabilities) * 100, 2)
                            predicted_character = predicted_index
                        else:
                            predicted_character = model.predict([data_aux])[0]
                            confidence = 85
                        
                        if predicted_character == "space":
                            predicted_character = " "
                        
                        # Draw prediction on frame
                        H, W, _ = frame.shape
                        x1, y1 = int(x_min * W) - 10, int(y_min * H) - 10
                        x2, y2 = int(lm_array[:,0].max() * W) + 10, int(lm_array[:,1].max() * H) + 10
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0,0,0), 3)
                        cv2.putText(frame, predicted_character.upper(), (x1, y1-10),
                                    cv2.FONT_HERSHEY_SIMPLEX, 1.3, (0,0,0), 3)
                        
                        # Store results for API access
                        with app.app_context():
                            app.current_prediction = {
                                "char": predicted_character,
                                "confidence": confidence,
                                "landmarks": data_aux.tolist()
                            }
                
                # Store processed frame
                _, buffer = cv2.imencode('.jpg', frame)
                app.processed_frame = "data:image/jpeg;base64," + base64.b64encode(buffer).decode()
        
        time.sleep(0.033)  # ~30 FPS

# Start background processing thread
processing_thread = threading.Thread(target=process_frames, daemon=True)
processing_thread.start()

@app.route("/")
def index():
    return redirect(url_for('user_page'))

@app.route("/dev")
def dev_page():
    password = request.args.get('password')
    if password != "11223344":
        return redirect(url_for('dev_login'))
    return render_template("dev.html")

@app.route("/dev-login")
def dev_login():
    return render_template("dev_login.html")

@app.route("/user")
def user_page():
    return render_template("user.html")

@app.route("/predict", methods=["POST"])
def predict():
    global current_frame, frame_updated
    
    start_time = time.time()
    data_url = request.json["image"]
    header, encoded = data_url.split(",", 1)
    data = base64.b64decode(encoded)
    nparr = np.frombuffer(data, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    # Update current frame for background processing
    with processing_lock:
        current_frame = frame
        frame_updated = True
    
    # Wait for processing to complete
    time.sleep(0.05)  # Short delay to allow processing
    
    processing_time = round((time.time() - start_time) * 1000, 2)
    
    # Get results from background processing
    response_data = {
        "image": getattr(app, 'processed_frame', ''),
        "char": getattr(app, 'current_prediction', {}).get('char', '-'),
        "confidence": getattr(app, 'current_prediction', {}).get('confidence', 0),
        "processing_time": processing_time
    }
    
    # Add landmarks data for debug mode
    if request.args.get('debug') == 'true':
        response_data["landmarks"] = getattr(app, 'current_prediction', {}).get('landmarks', [])
    
    return jsonify(response_data)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=7860, threaded=True)