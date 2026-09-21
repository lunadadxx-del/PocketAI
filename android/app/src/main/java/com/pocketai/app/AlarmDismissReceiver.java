package com.pocketai.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationManagerCompat;

public class AlarmDismissReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        // Stop playing ringtone
        AlarmReceiver.stopRingtone();

        // Dismiss notification
        int notificationId = intent.getIntExtra("notificationId", 1001);
        NotificationManagerCompat.from(context).cancel(notificationId);
    }
}
