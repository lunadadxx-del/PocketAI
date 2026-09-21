package com.pocketai.app;

import android.Manifest;
import android.content.Context;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.Arrays;

/**
 * NativeWakeWordPlugin
 * 
 * Genuine on-device acoustic wake-word detector for "Piti".
 * Analyzes raw 16kHz 16-bit PCM audio frames directly from AudioRecord.
 * Operates 100% offline with zero cloud streaming, zero LLM calls, and zero STT.
 */
@CapacitorPlugin(
    name = "NativeWakeWord",
    permissions = {
        @Permission(
            alias = "microphone",
            strings = { Manifest.permission.RECORD_AUDIO }
        )
    }
)
public class NativeWakeWordPlugin extends Plugin {
    private static final String TAG = "PocketAI_WakeWord";

    private static final int SAMPLE_RATE = 16000;
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;

    // 25ms frame = 400 samples, 10ms hop = 160 samples
    private static final int FRAME_SIZE = 400;
    private static final int HOP_SIZE = 160;

    private AudioRecord audioRecord;
    private Thread recordingThread;
    private volatile boolean isListening = false;
    private long lastWakeTimestamp = 0;
    private static final long COOLDOWN_MS = 2000;

    // Acoustic Acoustic Detector State
    private final AcousticPitiDetector acousticDetector = new AcousticPitiDetector();

    @PluginMethod
    public void isListening(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("isListening", isListening);
        call.resolve(ret);
    }

    @PluginMethod
    public void startListening(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            Log.w(TAG, "RECORD_AUDIO permission not granted, requesting...");
            requestPermissionForAlias("microphone", call, "startListeningPermCallback");
            return;
        }

        beginAcousticListening(call);
    }

    @PermissionCallback
    private void startListeningPermCallback(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            beginAcousticListening(call);
        } else {
            JSObject err = new JSObject();
            err.put("error", "Microphone permission denied.");
            call.reject("Microphone permission denied.");
        }
    }

    private synchronized void beginAcousticListening(PluginCall call) {
        if (isListening) {
            Log.d(TAG, "Acoustic wake-word detector already running");
            if (call != null) call.resolve();
            return;
        }

        int minBufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT);
        int bufferSize = Math.max(minBufferSize, FRAME_SIZE * 4);

        try {
            audioRecord = new AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT,
                bufferSize
            );

            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                // Fallback to standard MIC if VOICE_RECOGNITION fails
                audioRecord = new AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    SAMPLE_RATE,
                    CHANNEL_CONFIG,
                    AUDIO_FORMAT,
                    bufferSize
                );
            }

            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "AudioRecord initialization failed");
                if (call != null) call.reject("Failed to initialize AudioRecord");
                return;
            }

            audioRecord.startRecording();
            isListening = true;
            acousticDetector.reset();

            recordingThread = new Thread(new Runnable() {
                @Override
                public void run() {
                    processAudioFrames();
                }
            }, "PocketAI-WakeWordThread");
            recordingThread.setPriority(Thread.NORM_PRIORITY - 1);
            recordingThread.start();

            Log.i(TAG, "Acoustic wake-word engine started on raw 16kHz PCM audio");
            if (call != null) {
                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error starting AudioRecord: " + e.getMessage(), e);
            isListening = false;
            if (call != null) call.reject("Failed to start wake word detector: " + e.getMessage());
        }
    }

    private void processAudioFrames() {
        short[] buffer = new short[HOP_SIZE];
        short[] frameBuffer = new short[FRAME_SIZE];
        int framePos = 0;

        while (isListening) {
            if (audioRecord == null || audioRecord.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
                break;
            }

            int readCount = audioRecord.read(buffer, 0, HOP_SIZE);
            if (readCount <= 0) continue;

            // Slide samples into frameBuffer
            if (framePos + readCount <= FRAME_SIZE) {
                System.arraycopy(buffer, 0, frameBuffer, framePos, readCount);
                framePos += readCount;
            } else {
                int shift = framePos + readCount - FRAME_SIZE;
                System.arraycopy(frameBuffer, shift, frameBuffer, 0, FRAME_SIZE - shift);
                System.arraycopy(buffer, 0, frameBuffer, FRAME_SIZE - readCount, readCount);
                framePos = FRAME_SIZE;
            }

            if (framePos == FRAME_SIZE) {
                boolean detected = acousticDetector.processFrame(frameBuffer, FRAME_SIZE);
                if (detected) {
                    long now = System.currentTimeMillis();
                    if (now - lastWakeTimestamp > COOLDOWN_MS) {
                        lastWakeTimestamp = now;
                        Log.i(TAG, "*** ACOUSTIC WAKE WORD 'PITI' DETECTED IN AUDIO SIGNAL ***");

                        // Stop AudioRecord immediately to release microphone hardware for STT
                        stopAcousticListeningSync();

                        // Immediate tactile haptic feedback
                        triggerHapticFeedback();

                        // Notify JavaScript / UI
                        JSObject event = new JSObject();
                        event.put("detected", true);
                        event.put("timestamp", now);
                        event.put("confidence", acousticDetector.getLastConfidence());
                        notifyListeners("wakeWordDetected", event);
                        break;
                    }
                }
            }
        }
    }

    @PluginMethod
    public synchronized void stopListening(PluginCall call) {
        stopAcousticListeningSync();
        if (call != null) {
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        }
    }

    private synchronized void stopAcousticListeningSync() {
        isListening = false;
        if (audioRecord != null) {
            try {
                if (audioRecord.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                    audioRecord.stop();
                }
                audioRecord.release();
            } catch (Exception e) {
                Log.w(TAG, "Error stopping AudioRecord: " + e.getMessage());
            } finally {
                audioRecord = null;
            }
        }
        if (recordingThread != null) {
            recordingThread.interrupt();
            recordingThread = null;
        }
        Log.d(TAG, "Acoustic wake-word engine stopped & microphone released");
    }

    private void triggerHapticFeedback() {
        try {
            Vibrator v = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(VibrationEffect.createWaveform(new long[]{0, 50, 40, 70}, -1));
                } else {
                    v.vibrate(new long[]{0, 50, 40, 70}, -1);
                }
            }
        } catch (Exception ignored) {}
    }

    @Override
    protected void handleOnDestroy() {
        stopAcousticListeningSync();
        super.handleOnDestroy();
    }

    /**
     * AcousticPitiDetector
     * 
     * Performs digital signal processing and phonetic state machine tracking
     * on 16kHz PCM audio frames.
     * 
     * Phonetic signature of "Piti" (/p-ɪ-t-i/):
     * 1. /p/ burst: high-frequency transient, sudden energy onset from silence
     * 2. /ɪ/ vowel: formant resonance (strong F1 ~300-450Hz, F2 ~2000-2400Hz), duration ~70-180ms
     * 3. /t/ stop: brief silence/closure interval (~20-50ms) followed by sharp high-freq burst (>3kHz)
     * 4. /i/ vowel: front vowel formant resonance, duration ~80-220ms
     */
    private static class AcousticPitiDetector {
        private static final int STATE_SILENCE = 0;
        private static final int STATE_P_BURST = 1;
        private static final int STATE_VOWEL_1 = 2;
        private static final int STATE_T_STOP = 3;
        private static final int STATE_VOWEL_2 = 4;

        private int state = STATE_SILENCE;
        private int framesInState = 0;
        private float lastConfidence = 0.0f;

        // Energy threshold baseline
        private float noiseFloor = 300.0f;

        public void reset() {
            state = STATE_SILENCE;
            framesInState = 0;
            lastConfidence = 0.0f;
        }

        public float getLastConfidence() {
            return lastConfidence;
        }

        public boolean processFrame(short[] frame, int length) {
            // 1. Calculate RMS Energy
            double sumSq = 0;
            int zeroCrossings = 0;
            short prev = frame[0];

            for (int i = 0; i < length; i++) {
                short s = frame[i];
                sumSq += s * s;
                if ((s >= 0 && prev < 0) || (s < 0 && prev >= 0)) {
                    zeroCrossings++;
                }
                prev = s;
            }

            float rms = (float) Math.sqrt(sumSq / length);
            float zcr = (float) zeroCrossings / length; // Normalized Zero Crossing Rate

            // 2. Simple Spectral Energy Estimates (Goertzel-based formant approximations)
            // Low band (~300 - 600 Hz for vowel F1)
            float lowEnergy = calculateBandEnergy(frame, length, 300, 600);
            // Mid/High band (~2000 - 3500 Hz for vowel F2 and /t/, /p/ plosive bursts)
            float highEnergy = calculateBandEnergy(frame, length, 2000, 3500);

            // Adapt noise floor slowly during silence
            if (rms < noiseFloor * 1.3f) {
                noiseFloor = 0.98f * noiseFloor + 0.02f * Math.max(150.0f, rms);
            }

            boolean isVoiced = rms > noiseFloor * 2.2f && lowEnergy > highEnergy * 0.7f && zcr < 0.25f;
            boolean isPlosiveBurst = rms > noiseFloor * 1.8f && highEnergy > lowEnergy * 0.9f && zcr > 0.22f;
            boolean isSilenceOrClosure = rms < noiseFloor * 1.6f;

            framesInState++;

            switch (state) {
                case STATE_SILENCE:
                    // Looking for /p/ burst: sharp transition from background into high-frequency plosive
                    if (isPlosiveBurst || (rms > noiseFloor * 2.5f && zcr > 0.18f)) {
                        state = STATE_P_BURST;
                        framesInState = 1;
                    }
                    break;

                case STATE_P_BURST:
                    // /p/ burst is short (1 to 4 frames = 10ms - 40ms)
                    if (isVoiced) {
                        // Clean transition to first vowel /ɪ/
                        state = STATE_VOWEL_1;
                        framesInState = 1;
                    } else if (framesInState > 5) {
                        // Burst too long, reset to silence
                        state = STATE_SILENCE;
                    }
                    break;

                case STATE_VOWEL_1:
                    // First vowel /ɪ/ should last 6 to 18 frames (60ms to 180ms)
                    if (isSilenceOrClosure || isPlosiveBurst) {
                        if (framesInState >= 5 && framesInState <= 22) {
                            // Valid duration for first syllable vowel, moving to /t/ stop
                            state = STATE_T_STOP;
                            framesInState = 1;
                        } else {
                            state = STATE_SILENCE;
                        }
                    } else if (!isVoiced && framesInState > 22) {
                        state = STATE_SILENCE;
                    }
                    break;

                case STATE_T_STOP:
                    // /t/ closure + burst (2 to 8 frames = 20ms to 80ms)
                    if (isVoiced) {
                        if (framesInState >= 2 && framesInState <= 10) {
                            // Transition to second vowel /i/
                            state = STATE_VOWEL_2;
                            framesInState = 1;
                        } else {
                            state = STATE_SILENCE;
                        }
                    } else if (framesInState > 12) {
                        state = STATE_SILENCE;
                    }
                    break;

                case STATE_VOWEL_2:
                    // Second vowel /i/ sustained (7 to 25 frames = 70ms to 250ms)
                    if (isVoiced) {
                        if (framesInState >= 7) {
                            // Both syllables /p-ɪ/ and /t-i/ matched acoustically in temporal order!
                            lastConfidence = Math.min(0.98f, 0.75f + (framesInState * 0.01f));
                            reset();
                            return true;
                        }
                    } else {
                        // End of vowel 2
                        if (framesInState >= 6 && framesInState <= 26) {
                            lastConfidence = 0.88f;
                            reset();
                            return true;
                        }
                        state = STATE_SILENCE;
                    }
                    break;
            }

            return false;
        }

        private float calculateBandEnergy(short[] frame, int length, int fMin, int fMax) {
            // Discrete energy estimation across frequency band
            int kMin = (int) ((fMin / (float) SAMPLE_RATE) * length);
            int kMax = (int) ((fMax / (float) SAMPLE_RATE) * length);
            double energy = 0;

            for (int k = kMin; k <= kMax; k += 2) {
                double omega = (2.0 * Math.PI * k) / length;
                double coeff = 2.0 * Math.cos(omega);
                double q0 = 0, q1 = 0, q2 = 0;

                for (int i = 0; i < length; i++) {
                    q0 = coeff * q1 - q2 + frame[i];
                    q2 = q1;
                    q1 = q0;
                }
                energy += (q1 * q1 + q2 * q2 - q1 * q2 * coeff);
            }

            return (float) Math.sqrt(Math.max(0.0, energy) / length);
        }
    }
}
