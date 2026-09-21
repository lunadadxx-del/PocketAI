package com.pocketai.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Settings;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

@CapacitorPlugin(name = "NativeAppLauncher")
public class NativeAppLauncherPlugin extends Plugin {
    private static final String TAG = "PocketAI_Launcher";

    // Strict Allowlist of supported Android packages for security
    private static final Set<String> ALLOWED_PACKAGES = new HashSet<>(Arrays.asList(
            "com.google.android.youtube",
            "com.android.chrome",
            "com.android.settings",
            "com.whatsapp",
            "com.google.android.apps.maps",
            "com.google.android.GoogleCamera",
            "com.google.android.deskclock",
            "com.sec.android.app.clockpackage"
    ));

    @PluginMethod
    public void openApp(PluginCall call) {
        String packageName = call.getString("package");
        String appName = call.getString("appName", "Application");

        if (packageName == null || packageName.trim().isEmpty()) {
            call.reject("Package name is required.");
            return;
        }

        packageName = packageName.trim();
        Log.d(TAG, "Request to launch app: " + appName + " (" + packageName + ")");

        // Security check: Validate against allowlist
        if (!isPackageAllowed(packageName)) {
            Log.w(TAG, "Security rejection: Package '" + packageName + "' is not in the allowlist.");
            JSObject err = new JSObject();
            err.put("success", false);
            err.put("message", "Security restriction: '" + appName + "' is not in the approved application allowlist.");
            err.put("package", packageName);
            call.resolve(err);
            return;
        }

        Context context = getContext();

        // Special handling for system Settings
        if ("com.android.settings".equals(packageName) || "settings".equalsIgnoreCase(packageName)) {
            try {
                Intent settingsIntent = new Intent(Settings.ACTION_SETTINGS);
                settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(settingsIntent);

                Log.d(TAG, "Successfully launched Android Settings");
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("message", "Settings opened successfully");
                ret.put("package", "com.android.settings");
                ret.put("appName", "Settings");
                call.resolve(ret);
                return;
            } catch (Exception e) {
                Log.e(TAG, "Failed to open Settings: " + e.getMessage());
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("message", "Unable to open Settings: " + e.getMessage());
                call.resolve(ret);
                return;
            }
        }

        // Standard App Launching via PackageManager
        try {
            PackageManager pm = context.getPackageManager();
            Intent launchIntent = pm.getLaunchIntentForPackage(packageName);

            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(launchIntent);

                Log.d(TAG, "Successfully launched app: " + packageName);
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("message", appName + " opened successfully");
                ret.put("package", packageName);
                ret.put("appName", appName);
                call.resolve(ret);
            } else {
                // Application is not installed on the device
                Log.w(TAG, "App is not installed on device: " + packageName);
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("message", appName + " is not installed on this device");
                ret.put("package", packageName);
                ret.put("appName", appName);
                call.resolve(ret);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error starting activity for package " + packageName + ": " + e.getMessage(), e);
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("message", "Failed to open " + appName + ": " + e.getMessage());
            ret.put("package", packageName);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void isAppInstalled(PluginCall call) {
        String packageName = call.getString("package");
        if (packageName == null || packageName.trim().isEmpty()) {
            call.reject("Package name is required.");
            return;
        }

        packageName = packageName.trim();
        if ("com.android.settings".equals(packageName)) {
            JSObject ret = new JSObject();
            ret.put("installed", true);
            call.resolve(ret);
            return;
        }

        try {
            PackageManager pm = getContext().getPackageManager();
            Intent launchIntent = pm.getLaunchIntentForPackage(packageName);
            JSObject ret = new JSObject();
            ret.put("installed", launchIntent != null);
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("installed", false);
            call.resolve(ret);
        }
    }

    private boolean isPackageAllowed(String packageName) {
        return ALLOWED_PACKAGES.contains(packageName);
    }
}
