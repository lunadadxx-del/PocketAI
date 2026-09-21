package com.pocketai.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeAlarmPlugin.class);
        registerPlugin(NativeSpeechRecognitionPlugin.class);
        registerPlugin(NativeAppLauncherPlugin.class);
        registerPlugin(NativeWakeWordPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
