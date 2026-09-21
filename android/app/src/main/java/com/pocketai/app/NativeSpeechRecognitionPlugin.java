package com.pocketai.app;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.Locale;

@CapacitorPlugin(
    name = "NativeSpeechRecognition",
    permissions = {
        @Permission(
            alias = "microphone",
            strings = { Manifest.permission.RECORD_AUDIO }
        )
    }
)
public class NativeSpeechRecognitionPlugin extends Plugin {
    private static final String TAG = "PocketAI_Speech";
    private SpeechRecognizer speechRecognizer;
    private boolean isListening = false;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private PluginCall savedStartCall = null;

    @PluginMethod
    public void checkSpeechPermissions(PluginCall call) {
        boolean granted = getPermissionState("microphone") == PermissionState.GRANTED;
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        ret.put("state", getPermissionState("microphone").toString());
        Log.d(TAG, "checkSpeechPermissions: granted=" + granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestSpeechPermissions(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
        } else {
            requestPermissionForAlias("microphone", call, "microphonePermCallback");
        }
    }

    @PermissionCallback
    private void microphonePermCallback(PluginCall call) {
        boolean granted = getPermissionState("microphone") == PermissionState.GRANTED;
        Log.d(TAG, "microphonePermCallback: granted=" + granted);
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        boolean available = SpeechRecognizer.isRecognitionAvailable(getContext());
        Log.d(TAG, "isRecognitionAvailable: " + available);
        JSObject ret = new JSObject();
        ret.put("available", available);
        call.resolve(ret);
    }

    @PluginMethod
    public void startListening(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            Log.w(TAG, "startListening failed: RECORD_AUDIO permission not granted");
            requestPermissionForAlias("microphone", call, "startListeningPermCallback");
            return;
        }

        beginListeningOnMainThread(call);
    }

    @PermissionCallback
    private void startListeningPermCallback(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            Log.d(TAG, "Microphone permission granted on callback, starting recognition");
            beginListeningOnMainThread(call);
        } else {
            Log.w(TAG, "Microphone permission denied by user");
            JSObject err = new JSObject();
            err.put("error", "Microphone access was denied. Please allow microphone permission in Android app settings.");
            notifyListeners("speechError", err);
            call.reject("Microphone permission denied");
        }
    }

    private void beginListeningOnMainThread(PluginCall call) {
        mainHandler.post(() -> {
            try {
                if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
                    Log.e(TAG, "SpeechRecognizer is not available on this device");
                    JSObject err = new JSObject();
                    err.put("error", "Android Speech Recognition service is not available on this device.");
                    notifyListeners("speechError", err);
                    call.reject("Speech recognition unavailable");
                    return;
                }

                if (speechRecognizer != null) {
                    try {
                        speechRecognizer.destroy();
                    } catch (Exception ignored) {}
                    speechRecognizer = null;
                }

                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                speechRecognizer.setRecognitionListener(new RecognitionListener() {
                    @Override
                    public void onReadyForSpeech(Bundle params) {
                        isListening = true;
                        Log.d(TAG, "SpeechRecognizer: onReadyForSpeech");
                        JSObject data = new JSObject();
                        data.put("status", "ready");
                        notifyListeners("speechStart", data);
                    }

                    @Override
                    public void onBeginningOfSpeech() {
                        Log.d(TAG, "SpeechRecognizer: onBeginningOfSpeech (User began talking)");
                    }

                    @Override
                    public void onRmsChanged(float rmsdB) {
                        // Normalize -2 to 10 dB to 0.0 - 1.0 range for Siri orb
                        float normalized = Math.max(0.0f, Math.min(1.0f, (rmsdB + 2.0f) / 12.0f));
                        JSObject data = new JSObject();
                        data.put("level", normalized);
                        notifyListeners("speechVolume", data);
                    }

                    @Override
                    public void onBufferReceived(byte[] buffer) {}

                    @Override
                    public void onEndOfSpeech() {
                        Log.d(TAG, "SpeechRecognizer: onEndOfSpeech (User finished talking)");
                        isListening = false;
                        JSObject data = new JSObject();
                        data.put("status", "ended");
                        notifyListeners("speechEnd", data);
                    }

                    @Override
                    public void onError(int errorCode) {
                        isListening = false;
                        String errorMsg = getErrorMessage(errorCode);
                        Log.w(TAG, "SpeechRecognizer: onError -> (" + errorCode + ") " + errorMsg);
                        JSObject err = new JSObject();
                        err.put("error", errorMsg);
                        err.put("code", errorCode);
                        notifyListeners("speechError", err);
                    }

                    @Override
                    public void onResults(Bundle results) {
                        isListening = false;
                        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        String recognizedText = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
                        Log.d(TAG, "SpeechRecognizer: onResults -> \"" + recognizedText + "\"");
                        
                        JSObject res = new JSObject();
                        res.put("text", recognizedText);
                        notifyListeners("speechFinal", res);
                    }

                    @Override
                    public void onPartialResults(Bundle partialResults) {
                        ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        if (matches != null && !matches.isEmpty()) {
                            String partialText = matches.get(0);
                            Log.d(TAG, "SpeechRecognizer: onPartialResults -> \"" + partialText + "\"");
                            JSObject res = new JSObject();
                            res.put("text", partialText);
                            notifyListeners("speechPartial", res);
                        }
                    }

                    @Override
                    public void onEvent(int eventType, Bundle params) {}
                });

                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault());
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);

                Log.d(TAG, "Starting Android SpeechRecognizer intent...");
                speechRecognizer.startListening(intent);

                JSObject res = new JSObject();
                res.put("success", true);
                res.put("message", "Listening started");
                call.resolve(res);

            } catch (Exception e) {
                Log.e(TAG, "Exception starting speech recognizer: " + e.getMessage(), e);
                JSObject err = new JSObject();
                err.put("error", "Error initializing Android speech recognizer: " + e.getMessage());
                notifyListeners("speechError", err);
                call.reject(e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        mainHandler.post(() -> {
            try {
                if (speechRecognizer != null) {
                    Log.d(TAG, "Stopping Android SpeechRecognizer");
                    speechRecognizer.stopListening();
                }
            } catch (Exception e) {
                Log.w(TAG, "Error stopping recognizer: " + e.getMessage());
            }
            isListening = false;
            JSObject res = new JSObject();
            res.put("success", true);
            call.resolve(res);
        });
    }

    private String getErrorMessage(int errorCode) {
        switch (errorCode) {
            case SpeechRecognizer.ERROR_AUDIO:
                return "Audio recording error. Please check microphone.";
            case SpeechRecognizer.ERROR_CLIENT:
                return "Client side speech recognition error.";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "Insufficient permissions for audio recording.";
            case SpeechRecognizer.ERROR_NETWORK:
                return "Network error during speech recognition.";
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                return "Network timeout. Please check your connection.";
            case SpeechRecognizer.ERROR_NO_MATCH:
                return "No speech was recognized. Please try speaking again.";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                return "Speech recognizer is busy. Please try again.";
            case SpeechRecognizer.ERROR_SERVER:
                return "Speech server error. Please try again later.";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                return "No speech input detected.";
            default:
                return "Voice recognition error (Code " + errorCode + ").";
        }
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        mainHandler.post(() -> {
            if (speechRecognizer != null) {
                speechRecognizer.destroy();
                speechRecognizer = null;
            }
        });
    }
}
