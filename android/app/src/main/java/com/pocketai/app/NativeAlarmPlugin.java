package com.pocketai.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.provider.AlarmClock;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Calendar;
import java.util.Locale;

@CapacitorPlugin(name = "NativeAlarm")
public class NativeAlarmPlugin extends Plugin {

    @PluginMethod
    public void setAlarm(PluginCall call) {
        Integer hour = call.getInt("hour");
        Integer minute = call.getInt("minute");
        String label = call.getString("label", "Pocket AI Alarm");

        if (hour == null || minute == null) {
            call.reject("Parameters 'hour' and 'minute' are required.");
            return;
        }

        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            call.reject("Invalid time range. Hour must be 0-23, Minute must be 0-59.");
            return;
        }

        Context context = getContext();
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

        if (alarmManager == null) {
            JSObject err = new JSObject();
            err.put("success", false);
            err.put("message", "AlarmManager service is not available on this Android device.");
            call.resolve(err);
            return;
        }

        try {
            // Check Android 12+ (API 31+) exact alarm permission
            boolean canExact = true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                canExact = alarmManager.canScheduleExactAlarms();
            }

            // Calculate trigger time
            Calendar targetCal = Calendar.getInstance();
            targetCal.set(Calendar.HOUR_OF_DAY, hour);
            targetCal.set(Calendar.MINUTE, minute);
            targetCal.set(Calendar.SECOND, 0);
            targetCal.set(Calendar.MILLISECOND, 0);

            if (targetCal.getTimeInMillis() <= System.currentTimeMillis()) {
                targetCal.add(Calendar.DAY_OF_YEAR, 1); // schedule for tomorrow
            }

            // Format human-friendly display
            int displayHour = hour % 12 == 0 ? 12 : hour % 12;
            String ampm = hour >= 12 ? "PM" : "AM";
            String displayTime = String.format(Locale.getDefault(), "%d:%02d %s", displayHour, minute, ampm);

            // Create PendingIntent for AlarmReceiver
            Intent receiverIntent = new Intent(context, AlarmReceiver.class);
            receiverIntent.putExtra("label", label);
            receiverIntent.putExtra("time", displayTime);
            int requestCode = (hour * 60) + minute;

            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                    context,
                    requestCode,
                    receiverIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            // Schedule with AlarmManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (canExact) {
                    alarmManager.setExactAndAllowWhileIdle(
                            AlarmManager.RTC_WAKEUP,
                            targetCal.getTimeInMillis(),
                            pendingIntent
                    );
                } else {
                    alarmManager.setAndAllowWhileIdle(
                            AlarmManager.RTC_WAKEUP,
                            targetCal.getTimeInMillis(),
                            pendingIntent
                    );
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                alarmManager.setExact(
                        AlarmManager.RTC_WAKEUP,
                        targetCal.getTimeInMillis(),
                        pendingIntent
                );
            } else {
                alarmManager.set(
                        AlarmManager.RTC_WAKEUP,
                        targetCal.getTimeInMillis(),
                        pendingIntent
                );
            }

            // Also trigger native clock app intent for dual registration
            try {
                Intent clockIntent = new Intent(AlarmClock.ACTION_SET_ALARM);
                clockIntent.putExtra(AlarmClock.EXTRA_HOUR, hour);
                clockIntent.putExtra(AlarmClock.EXTRA_MINUTES, minute);
                clockIntent.putExtra(AlarmClock.EXTRA_MESSAGE, label);
                clockIntent.putExtra(AlarmClock.EXTRA_SKIP_UI, true);
                clockIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(clockIntent);
            } catch (Exception ignored) {}

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("message", "Alarm scheduled for " + displayTime);
            result.put("time", String.format(Locale.getDefault(), "%02d:%02d", hour, minute));
            result.put("displayTime", displayTime);
            result.put("label", label);
            result.put("triggerMillis", targetCal.getTimeInMillis());
            result.put("isExact", canExact);
            call.resolve(result);

        } catch (SecurityException se) {
            JSObject err = new JSObject();
            err.put("success", false);
            err.put("message", "Permission denied: unable to schedule exact alarm. " + se.getMessage());
            call.resolve(err);
        } catch (Exception e) {
            JSObject err = new JSObject();
            err.put("success", false);
            err.put("message", "Failed to schedule alarm: " + e.getMessage());
            call.resolve(err);
        }
    }

    @PluginMethod
    public void cancelAlarm(PluginCall call) {
        Integer hour = call.getInt("hour");
        Integer minute = call.getInt("minute");

        if (hour == null || minute == null) {
            call.reject("Parameters 'hour' and 'minute' are required to cancel an alarm.");
            return;
        }

        Context context = getContext();
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

        if (alarmManager != null) {
            Intent receiverIntent = new Intent(context, AlarmReceiver.class);
            int requestCode = (hour * 60) + minute;
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                    context,
                    requestCode,
                    receiverIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            alarmManager.cancel(pendingIntent);
            pendingIntent.cancel();
        }

        JSObject res = new JSObject();
        res.put("success", true);
        res.put("message", "Alarm cancelled successfully.");
        call.resolve(res);
    }
}
