"""
==========================================================
  ASL Sign Language Translator -- Full Edition
==========================================================
  Real-time ASL translator with word/phrase detection,
  fingerspelling, sentence building, and text-to-speech.

  Two Modes:
    PHRASE MODE - Gestures map to common words/phrases
    SPELL MODE  - Gestures map to ASL alphabet letters

  Controls:
    M         -- Toggle mode (Phrase / Spell)
    Q         -- Quit
    SPACE     -- Add space / finish word
    BACKSPACE -- Delete last character / word
    C         -- Clear all text
    V         -- Toggle voice ON/OFF
    S         -- Speak full sentence
    ENTER     -- Finish sentence (add period)
==========================================================
"""

import cv2
import numpy as np
import mediapipe as mp
import pyttsx3
import math
import time
import os
import urllib.request
from threading import Thread
from collections import deque, Counter

# ==============================================================
# CONSTANTS
# ==============================================================
WINDOW_NAME = "ASL Translator"
CAM_W, CAM_H = 640, 480
PANEL_W, PANEL_H = 540, 480

MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hand_landmarker.task")

# Colors (BGR)
C_BG1         = (35, 28, 22)
C_BG2         = (50, 38, 28)
C_CARD        = (55, 44, 32)
C_GREEN       = (136, 255, 0)
C_GREEN_DIM   = (60, 120, 0)
C_BLUE        = (255, 180, 50)
C_RED         = (80, 70, 230)
C_GOLD        = (0, 215, 255)
C_SKY         = (235, 206, 135)
C_ORANGE      = (0, 140, 255)
C_PURPLE      = (200, 100, 255)
C_CYAN        = (230, 220, 50)
C_WHITE       = (240, 240, 240)
C_GRAY        = (130, 110, 100)
C_DARK        = (70, 56, 45)
C_DARKER      = (45, 36, 28)

# Phrase-mode sign descriptions
PHRASE_INFO = {
    "Hello":       "Open hand, fingers spread",
    "Stop":        "Open hand, fingers together",
    "Good":        "Thumbs up",
    "Yes":         "Fist with thumb up",
    "No":          "Closed fist",
    "I Love You":  "Thumb + index + pinky",
    "Peace":       "V-sign, spread",
    "OK":          "Thumb + index circle",
    "Call Me":     "Thumb + pinky out",
    "Rock On":     "Index + pinky out",
    "Wait":        "Index finger up",
    "Me":          "Pinky up",
    "Awesome":     "L-shape (thumb+index)",
    "You":         "Index + middle together",
    "Three":       "Three fingers spread",
}

# Spell-mode sign descriptions
SPELL_INFO = {
    'A': 'Fist, thumb beside',     'B': 'Four fingers up',
    'C': 'Curved hand',            'D': 'Index up only',
    'E': 'Fingers curled tight',   'F': 'OK + 3 fingers up',
    'G': 'Index pointing side',    'I': 'Pinky up only',
    'K': 'Index+middle spread',    'L': 'L-shape',
    'O': 'Circle (thumb+index)',   'S': 'Fist, thumb across',
    'U': 'Index+middle together',  'V': 'Peace sign',
    'W': 'Three fingers spread',   'Y': 'Thumb + pinky',
    '5': 'Open hand (five)',
}


# ==============================================================
# MODEL DOWNLOAD
# ==============================================================
def ensure_model():
    if os.path.exists(MODEL_PATH):
        return MODEL_PATH
    print("  Downloading hand landmarker model...")
    try:
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print("  Download complete!")
    except Exception as e:
        print(f"  ERROR downloading model: {e}")
        print(f"  Download manually from: {MODEL_URL}")
        raise SystemExit(1)
    return MODEL_PATH


# ==============================================================
# TEXT-TO-SPEECH ENGINE
# ==============================================================
class TTSEngine:
    def __init__(self):
        self.enabled = True
        self._busy = False
        try:
            self._engine = pyttsx3.init()
            self._engine.setProperty('rate', 150)
            voices = self._engine.getProperty('voices')
            if len(voices) > 1:
                self._engine.setProperty('voice', voices[1].id)
            self._ok = True
        except Exception:
            self._ok = False
            print("[WARN] Text-to-speech unavailable.")

    def speak(self, text):
        if not self._ok or not self.enabled or not text.strip() or self._busy:
            return
        Thread(target=self._run, args=(text,), daemon=True).start()

    def _run(self, text):
        self._busy = True
        try:
            self._engine.say(text)
            self._engine.runAndWait()
        except Exception:
            pass
        finally:
            self._busy = False

    def toggle(self):
        self.enabled = not self.enabled
        return self.enabled


# ==============================================================
# ASL CLASSIFIER (Phrase Mode + Spell Mode)
# ==============================================================
class ASLClassifier:
    MODE_PHRASE = "PHRASE"
    MODE_SPELL  = "SPELL"

    def __init__(self, buffer_size=14, commit_thresh=9, cooldown_frames=22):
        self.mode = self.MODE_PHRASE
        self.buffer = deque(maxlen=buffer_size)
        self.commit_thresh = commit_thresh
        self.cooldown_max = cooldown_frames
        self.cooldown = 0
        self.current_display = "?"
        self.fingers_state = [False] * 5

    def toggle_mode(self):
        self.mode = self.MODE_SPELL if self.mode == self.MODE_PHRASE else self.MODE_PHRASE
        self.reset()
        return self.mode

    # ---------- math helpers ----------
    @staticmethod
    def _d(lm, a, b):
        return math.sqrt(
            (lm[a].x - lm[b].x)**2 +
            (lm[a].y - lm[b].y)**2 +
            (lm[a].z - lm[b].z)**2
        )

    # ---------- finger state detection ----------
    def _fingers(self, lm):
        f = []
        # Thumb
        if lm[5].x < lm[17].x:
            f.append(lm[4].x < lm[2].x)
        else:
            f.append(lm[4].x > lm[2].x)
        # Index, Middle, Ring, Pinky
        for tip, pip in [(8,6),(12,10),(16,14),(20,18)]:
            f.append(lm[tip].y < lm[pip].y)
        self.fingers_state = f
        return f

    # ---------- PHRASE MODE classifier ----------
    def _classify_phrase(self, lm):
        f = self._fingers(lm)
        T, I, M, R, P = f
        n = sum(f)
        hs = self._d(lm, 0, 9)
        if hs < 0.01: return "?"

        ti = self._d(lm, 4, 8)  / hs
        im = self._d(lm, 8, 12) / hs
        mr = self._d(lm, 12,16) / hs
        ti_touch = ti < 0.28

        # --- I Love You (ILY): thumb + index + pinky, NOT middle, NOT ring ---
        if T and I and not M and not R and P:
            return "I Love You"

        # --- Rock On: index + pinky, NO thumb ---
        if not T and I and not M and not R and P:
            return "Rock On"

        # --- 5 fingers ---
        if n == 5:
            if im > 0.2 and mr > 0.15:
                return "Hello"
            return "Stop"

        # --- 4 fingers ---
        if n == 4:
            if not T:
                return "Stop"
            if not P and ti_touch:
                return "OK"

        # --- 3 fingers ---
        if n == 3:
            if I and M and R and im > 0.18 and mr > 0.18:
                return "Three"
            if M and R and P and ti_touch:
                return "OK"
            if T and I and M and ti_touch:
                return "OK"

        # --- 2 fingers ---
        if n == 2:
            if T and P:
                return "Call Me"
            if T and I:
                return "Awesome"
            if I and M:
                if im > 0.32:
                    return "Peace"
                return "You"

        # --- 1 finger ---
        if n == 1:
            if T: return "Good"
            if I: return "Wait"
            if P: return "Me"

        # --- 0 fingers (fist) ---
        if n == 0:
            if ti_touch:
                return "OK"
            thumb_above = lm[4].y < lm[6].y
            if thumb_above:
                return "Yes"
            return "No"

        return "?"

    # ---------- SPELL MODE classifier ----------
    def _classify_spell(self, lm):
        f = self._fingers(lm)
        T, I, M, R, P = f
        n = sum(f)
        hs = self._d(lm, 0, 9)
        if hs < 0.01: return "?"

        ti = self._d(lm, 4, 8)  / hs
        im = self._d(lm, 8, 12) / hs
        mr = self._d(lm, 12,16) / hs
        ti_touch = ti < 0.28

        if n == 0:
            if ti_touch: return 'O'
            tb = lm[4].y < lm[6].y
            bs = abs(lm[4].x - lm[5].x) > abs(lm[4].x - lm[9].x)
            if bs and tb: return 'A'
            if not tb:
                avg = (lm[8].y + lm[12].y + lm[16].y + lm[20].y)/4
                if abs(avg - lm[4].y) < 0.06: return 'E'
                return 'S'
            return 'A'

        if n == 1:
            if P: return 'I'
            if I:
                dx = abs(lm[8].x - lm[5].x)
                dy = abs(lm[8].y - lm[5].y)
                if dx > dy * 0.9: return 'G'
                return 'D'
            if T: return 'A'

        if n == 2:
            if T and P: return 'Y'
            if T and I: return 'L'
            if I and M:
                return 'V' if im > 0.32 else 'U'

        if n == 3:
            if I and M and R and im > 0.18 and mr > 0.18:
                return 'W'
            if (M and R and P and ti_touch) or (T and I and M and ti_touch):
                return 'F'

        if n == 4:
            if not T: return 'B'
            if not P and ti_touch: return 'F'

        if n == 5:
            if im > 0.2 and mr > 0.15: return '5'
            return 'B'

        if not any(f[1:]):
            ic = self._d(lm, 8, 5) / hs
            if 0.4 < ic < 0.9 and 0.3 < ti < 0.7: return 'C'

        return '?'

    # ---------- main update with temporal smoothing ----------
    def update(self, landmarks):
        if self.mode == self.MODE_PHRASE:
            sign = self._classify_phrase(landmarks)
        else:
            sign = self._classify_spell(landmarks)

        self.buffer.append(sign)

        if self.cooldown > 0:
            self.cooldown -= 1
            self.current_display = self._top()
            return None, self.current_display

        counts = Counter(self.buffer)
        best, cnt = counts.most_common(1)[0]

        if best != "?" and cnt >= self.commit_thresh:
            self.cooldown = self.cooldown_max
            self.buffer.clear()
            self.current_display = best
            return best, best

        self.current_display = self._top()
        return None, self.current_display

    def _top(self):
        if not self.buffer: return "?"
        return Counter(self.buffer).most_common(1)[0][0]

    def reset(self):
        self.buffer.clear()
        self.current_display = "?"
        self.cooldown = 0


# ==============================================================
# HAND DRAWING UTILITIES
# ==============================================================
HAND_CONNS = [
    (0,1),(1,2),(2,3),(3,4),
    (0,5),(5,6),(6,7),(7,8),
    (0,9),(9,10),(10,11),(11,12),
    (0,13),(13,14),(14,15),(15,16),
    (0,17),(17,18),(18,19),(19,20),
    (5,9),(9,13),(13,17),
]

def draw_landmarks(frame, lm, w, h, color_line=(0,200,100)):
    pts = [(int(l.x*w), int(l.y*h)) for l in lm]
    for a, b in HAND_CONNS:
        if a < len(pts) and b < len(pts):
            cv2.line(frame, pts[a], pts[b], color_line, 2, cv2.LINE_AA)
    tips = {4,8,12,16,20}
    for i, (px,py) in enumerate(pts):
        c = (0,255,200) if i in tips else (200,200,200)
        r = 5 if i in tips else 3
        cv2.circle(frame, (px,py), r, c, -1, cv2.LINE_AA)
        cv2.circle(frame, (px,py), r+1, (0,80,40), 1, cv2.LINE_AA)

def draw_bbox(frame, lm, w, h, color=(0,255,136)):
    xs = [l.x*w for l in lm]; ys = [l.y*h for l in lm]
    x1,y1 = max(0,int(min(xs))-20), max(0,int(min(ys))-20)
    x2,y2 = min(w,int(max(xs))+20), min(h,int(max(ys))+20)
    cv2.rectangle(frame, (x1,y1), (x2,y2), color, 2)
    cl = 15
    for (cx,cy),(dx,dy) in [((x1,y1),(1,1)),((x2,y1),(-1,1)),((x1,y2),(1,-1)),((x2,y2),(-1,-1))]:
        cv2.line(frame, (cx,cy), (cx+dx*cl,cy), color, 3)
        cv2.line(frame, (cx,cy), (cx,cy+dy*cl), color, 3)


# ==============================================================
# UI RENDERER (Premium Translator Panel)
# ==============================================================
class UIRenderer:
    def __init__(self):
        self._bg = None

    def _make_bg(self):
        if self._bg is None:
            bg = np.zeros((PANEL_H, PANEL_W, 3), dtype=np.uint8)
            for y in range(PANEL_H):
                r = y / PANEL_H
                bg[y,:] = tuple(int(C_BG1[i]*(1-r) + C_BG2[i]*r) for i in range(3))
            self._bg = bg
        return self._bg.copy()

    @staticmethod
    def _rrect(img, p1, p2, color, rad=10):
        x1,y1 = p1; x2,y2 = p2
        r = min(rad, (x2-x1)//2, (y2-y1)//2)
        cv2.rectangle(img, (x1+r,y1), (x2-r,y2), color, -1)
        cv2.rectangle(img, (x1,y1+r), (x2,y2-r), color, -1)
        for cx,cy in [(x1+r,y1+r),(x2-r,y1+r),(x1+r,y2-r),(x2-r,y2-r)]:
            cv2.circle(img, (cx,cy), r, color, -1)

    def render(self, mode, sign, word, sentence, history, voice_on, fps, fingers,
               hand_ok, flash):
        p = self._make_bg()

        # ---- MODE BADGE ----
        mode_col = C_GREEN if mode == "PHRASE" else C_BLUE
        mode_label = "PHRASE MODE" if mode == "PHRASE" else "SPELL MODE"
        self._rrect(p, (15,8), (170,32), mode_col, 8)
        cv2.putText(p, mode_label, (22,26), cv2.FONT_HERSHEY_SIMPLEX, 0.48,
                    (15,15,15), 2, cv2.LINE_AA)

        # ---- VOICE BADGE ----
        v_text = "VOICE ON" if voice_on else "VOICE OFF"
        v_col = C_GREEN if voice_on else C_RED
        cv2.circle(p, (PANEL_W-25, 20), 6, v_col, -1, cv2.LINE_AA)
        cv2.putText(p, v_text, (PANEL_W-120, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.38,
                    v_col, 1, cv2.LINE_AA)

        # ---- TITLE ----
        cv2.putText(p, "ASL TRANSLATOR", (175, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                    C_WHITE, 1, cv2.LINE_AA)

        cv2.line(p, (15,40), (PANEL_W-15,40), C_DARK, 1)

        # ---- DETECTED SIGN CARD ----
        card_color = C_CARD
        if flash > 0:
            # Flash effect on commit
            alpha = flash / 15.0
            card_color = tuple(int(C_CARD[i]*(1-alpha) + C_GREEN_DIM[i]*alpha) for i in range(3))

        self._rrect(p, (15,48), (PANEL_W-15,155), card_color, 14)

        # Sign text (large)
        sign_color = C_GREEN if (sign != "?" and hand_ok) else C_GRAY
        if sign == "?":
            sign = "..."

        # For long phrases, use smaller font
        if len(sign) > 6:
            fs, ft = 1.2, 3
        elif len(sign) > 3:
            fs, ft = 1.6, 3
        else:
            fs, ft = 2.5, 4

        tsz = cv2.getTextSize(sign, cv2.FONT_HERSHEY_SIMPLEX, fs, ft)[0]
        tx = (PANEL_W - tsz[0]) // 2
        ty = 115 + tsz[1] // 2
        cv2.putText(p, sign, (tx, ty), cv2.FONT_HERSHEY_SIMPLEX, fs,
                    sign_color, ft, cv2.LINE_AA)

        # Sign description
        info_dict = PHRASE_INFO if mode == "PHRASE" else SPELL_INFO
        desc = info_dict.get(sign, "")
        if desc:
            dsz = cv2.getTextSize(desc, cv2.FONT_HERSHEY_SIMPLEX, 0.35, 1)[0]
            cv2.putText(p, desc, ((PANEL_W-dsz[0])//2, 148), cv2.FONT_HERSHEY_SIMPLEX,
                        0.35, C_GRAY, 1, cv2.LINE_AA)

        # ---- FINGER INDICATORS ----
        names = ['THM','IDX','MID','RNG','PNK']
        for i,(nm,st) in enumerate(zip(names, fingers)):
            fx = 30 + i * 100
            fy = 172
            c = C_GREEN if st else C_DARKER
            cv2.circle(p, (fx, fy), 8, c, -1, cv2.LINE_AA)
            cv2.putText(p, nm, (fx+14, fy+4), cv2.FONT_HERSHEY_SIMPLEX, 0.3,
                        c, 1, cv2.LINE_AA)

        # Hand status
        st_text = "HAND OK" if hand_ok else "NO HAND"
        st_col = C_GREEN if hand_ok else C_RED
        cv2.putText(p, st_text, (PANEL_W-90, 176), cv2.FONT_HERSHEY_SIMPLEX, 0.38,
                    st_col, 1, cv2.LINE_AA)

        cv2.line(p, (15,190), (PANEL_W-15,190), C_DARK, 1)

        # ---- TRANSLATION OUTPUT (prominent) ----
        cv2.putText(p, "TRANSLATION", (15, 210), cv2.FONT_HERSHEY_SIMPLEX, 0.45,
                    C_ORANGE, 1, cv2.LINE_AA)

        self._rrect(p, (15,218), (PANEL_W-15,300), C_DARKER, 12)

        # Build full text: sentence + current word
        full_text = sentence
        if word:
            full_text += (" " if full_text else "") + word + "_"
        if not full_text:
            full_text = "Show signs to translate..."

        # Word-wrap into the box (max 2 lines)
        max_chars = 32
        lines = []
        while len(full_text) > max_chars:
            lines.append(full_text[:max_chars])
            full_text = full_text[max_chars:]
        lines.append(full_text)
        lines = lines[-2:]  # show last 2 lines

        for i, line in enumerate(lines):
            y_pos = 248 + i * 28
            text_col = C_GOLD if word or sentence else C_GRAY
            cv2.putText(p, line, (28, y_pos), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                        text_col, 2 if (word or sentence) else 1, cv2.LINE_AA)

        cv2.line(p, (15,310), (PANEL_W-15,310), C_DARK, 1)

        # ---- CURRENT WORD ----
        cv2.putText(p, "CURRENT WORD:", (15, 330), cv2.FONT_HERSHEY_SIMPLEX, 0.38,
                    C_GRAY, 1, cv2.LINE_AA)
        w_disp = word if word else "..."
        cv2.putText(p, w_disp[:20], (155, 330), cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                    C_CYAN, 2, cv2.LINE_AA)

        # ---- HISTORY ----
        cv2.putText(p, "HISTORY:", (15, 355), cv2.FONT_HERSHEY_SIMPLEX, 0.35,
                    C_GRAY, 1, cv2.LINE_AA)
        for i, h in enumerate(history[-3:]):
            hy = 375 + i * 18
            cv2.putText(p, h[:45], (25, hy), cv2.FONT_HERSHEY_SIMPLEX, 0.35,
                        C_SKY, 1, cv2.LINE_AA)

        cv2.line(p, (15,420), (PANEL_W-15,420), C_DARK, 1)

        # ---- CONTROLS ----
        ctrls = [
            ("M",     "Mode"),
            ("SPACE", "Space"),
            ("BKSP",  "Delete"),
            ("C",     "Clear"),
            ("V",     "Voice"),
            ("S",     "Speak"),
            ("RET",   "Period"),
            ("Q",     "Quit"),
        ]
        cx, cy = 15, 440
        for k, d in ctrls:
            cv2.putText(p, k, (cx, cy), cv2.FONT_HERSHEY_SIMPLEX, 0.3, C_ORANGE, 1, cv2.LINE_AA)
            kw = cv2.getTextSize(k, cv2.FONT_HERSHEY_SIMPLEX, 0.3, 1)[0][0]
            cv2.putText(p, d, (cx+kw+4, cy), cv2.FONT_HERSHEY_SIMPLEX, 0.28, C_WHITE, 1, cv2.LINE_AA)
            dw = cv2.getTextSize(d, cv2.FONT_HERSHEY_SIMPLEX, 0.28, 1)[0][0]
            cx += kw + dw + 16
            if cx > PANEL_W - 80:
                cx = 15
                cy += 18

        # ---- FPS ----
        cv2.putText(p, f"FPS:{fps:.0f}", (PANEL_W-65, PANEL_H-6), cv2.FONT_HERSHEY_SIMPLEX,
                    0.33, C_DARK, 1, cv2.LINE_AA)

        return p


# ==============================================================
# MAIN APPLICATION
# ==============================================================
class SignLanguageApp:
    def __init__(self):
        self.tts = TTSEngine()
        self.classifier = ASLClassifier()
        self.ui = UIRenderer()

        model_path = ensure_model()
        BaseOptions = mp.tasks.BaseOptions
        HL = mp.tasks.vision.HandLandmarker
        HLO = mp.tasks.vision.HandLandmarkerOptions
        RM = mp.tasks.vision.RunningMode
        opts = HLO(
            base_options=BaseOptions(model_asset_path=model_path),
            running_mode=RM.IMAGE,
            num_hands=1,
            min_hand_detection_confidence=0.5,
            min_hand_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.detector = HL.create_from_options(opts)

        # State
        self.word = ""
        self.sentence = ""
        self.history = []       # completed sentences
        self.fps = 0.0
        self._pt = time.time()
        self.flash = 0          # flash timer for commit animation

    def run(self):
        cam = cv2.VideoCapture(0)
        if not cam.isOpened():
            cam = cv2.VideoCapture(1)
        if not cam.isOpened():
            print("ERROR: Cannot open webcam!")
            return

        cam.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cam.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

        print("=" * 55)
        print("  ASL Sign Language Translator (Full Edition)")
        print("  Mode: PHRASE (press M to switch to SPELL)")
        print("  Show ASL hand signs to the camera to begin!")
        print("  Press Q to quit.")
        print("=" * 55)

        while True:
            ret, frame = cam.read()
            if not ret:
                break

            frame = cv2.flip(frame, 1)
            frame = cv2.resize(frame, (CAM_W, CAM_H))

            # Detect hand
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = self.detector.detect(mp_img)

            display_sign = "?"
            committed = None
            hand_ok = False
            fingers = [False]*5

            if result.hand_landmarks and len(result.hand_landmarks) > 0:
                hand_ok = True
                hlm = result.hand_landmarks[0]
                h_f, w_f = frame.shape[:2]

                # Color based on mode
                line_col = (0,220,100) if self.classifier.mode == "PHRASE" else (220,180,50)
                draw_landmarks(frame, hlm, w_f, h_f, line_col)
                bbox_col = C_GREEN if self.classifier.mode == "PHRASE" else C_BLUE
                draw_bbox(frame, hlm, w_f, h_f, bbox_col)

                committed, display_sign = self.classifier.update(hlm)
                fingers = self.classifier.fingers_state
            else:
                self.classifier.reset()

            # Handle committed sign
            if committed:
                self.flash = 15  # trigger flash animation
                if self.classifier.mode == ASLClassifier.MODE_PHRASE:
                    # In phrase mode, add whole word
                    if self.word:
                        self.sentence += (" " if self.sentence else "") + self.word
                        self.word = ""
                    self.sentence += (" " if self.sentence else "") + committed
                    self.tts.speak(committed)
                else:
                    # In spell mode, add letter to current word
                    self.word += committed
                    self.tts.speak(committed)

            # Flash countdown
            if self.flash > 0:
                self.flash -= 1

            # FPS
            now = time.time()
            self.fps = 1.0 / max(now - self._pt, 0.001)
            self._pt = now

            # Camera overlay
            mode_text = f"[{self.classifier.mode} MODE]"
            mode_col = C_GREEN if self.classifier.mode == "PHRASE" else C_BLUE
            cv2.putText(frame, mode_text, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                        mode_col, 2, cv2.LINE_AA)

            if hand_ok:
                cv2.putText(frame, display_sign, (10, CAM_H-15), cv2.FONT_HERSHEY_SIMPLEX,
                            0.7, (0,255,100), 2, cv2.LINE_AA)
            else:
                cv2.putText(frame, "Show your hand...", (10, CAM_H-15),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0,150,255), 1, cv2.LINE_AA)

            # Flash border on commit
            if self.flash > 10:
                cv2.rectangle(frame, (0,0), (CAM_W-1, CAM_H-1), C_GREEN, 4)

            # Render UI panel
            panel = self.ui.render(
                self.classifier.mode, display_sign,
                self.word, self.sentence, self.history,
                self.tts.enabled, self.fps, fingers, hand_ok, self.flash
            )

            combined = np.hstack((frame, panel))
            cv2.imshow(WINDOW_NAME, combined)

            # Handle keys
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                break
            elif key == ord('m'):
                new_mode = self.classifier.toggle_mode()
                print(f"  Switched to {new_mode} mode")
            elif key == ord(' '):
                if self.word:
                    self.sentence += (" " if self.sentence else "") + self.word
                    self.tts.speak(self.word)
                    self.word = ""
            elif key == 8:  # Backspace
                if self.classifier.mode == ASLClassifier.MODE_SPELL and self.word:
                    self.word = self.word[:-1]
                elif self.sentence:
                    # Remove last word from sentence
                    parts = self.sentence.rsplit(' ', 1)
                    if len(parts) == 2:
                        self.sentence = parts[0]
                    else:
                        self.sentence = ""
            elif key == ord('c'):
                self.word = ""
                self.sentence = ""
            elif key == ord('v'):
                on = self.tts.toggle()
                print(f"  Voice {'ON' if on else 'OFF'}")
            elif key == ord('s'):
                full = (self.sentence + " " + self.word).strip()
                if full:
                    print(f"  Speaking: {full}")
                    self.tts.speak(full)
            elif key == 13:  # Enter
                full = (self.sentence + " " + self.word).strip()
                if full:
                    full += "."
                    self.history.append(full)
                    self.tts.speak(full)
                    print(f"  Sentence: {full}")
                    self.sentence = ""
                    self.word = ""

        cam.release()
        cv2.destroyAllWindows()
        self.detector.close()
        print("\nTranslator closed. Goodbye!")


# ==============================================================
# ENTRY POINT
# ==============================================================
if __name__ == "__main__":
    print()
    print("  +================================================+")
    print("  |   ASL Sign Language Translator                  |")
    print("  |   Full Edition -- Phrases + Spelling + Speech   |")
    print("  |   Powered by MediaPipe + OpenCV + pyttsx3       |")
    print("  +================================================+")
    print()
    app = SignLanguageApp()
    app.run()
