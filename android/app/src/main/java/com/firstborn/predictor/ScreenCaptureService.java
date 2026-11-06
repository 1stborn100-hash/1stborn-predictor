package com.firstborn.predictor;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.IBinder;
import android.util.DisplayMetrics;
import android.view.WindowManager;

import androidx.core.app.NotificationCompat;

public class ScreenCaptureService extends Service {

    public static final String ACTION_START = "com.firstborn.predictor.START_CAPTURE";
    public static final String ACTION_STOP = "com.firstborn.predictor.STOP_CAPTURE";

    private static final String CHANNEL_ID = "screen_capture";
    private static final int NOTIFICATION_ID = 1001;

    private MediaProjection projection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private boolean stopping = false;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_STOP.equals(intent.getAction())) {
            stopCapture();
            stopSelf();
            return START_NOT_STICKY;
        }

        if (!ACTION_START.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }

        int resultCode = intent.getIntExtra("resultCode", 0);
        Intent permissionData;
        if (Build.VERSION.SDK_INT >= 33) {
            permissionData = intent.getParcelableExtra("permissionData", Intent.class);
        } else {
            permissionData = intent.getParcelableExtra("permissionData");
        }

        if (resultCode == 0 || permissionData == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        createNotificationChannel();

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("1StBorN Predictor")
            .setContentText("Screen capture is active. Tap Stop in the app to end it.")
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        try {
            MediaProjectionManager manager =
                (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);

            projection = manager.getMediaProjection(resultCode, permissionData);

            if (projection == null) {
                stopCapture();
                stopSelf();
                return START_NOT_STICKY;
            }

            projection.registerCallback(new MediaProjection.Callback() {
                @Override
                public void onStop() {
                    stopCapture();
                    stopSelf();
                }
            }, null);

            DisplayMetrics metrics = new DisplayMetrics();
            WindowManager windowManager =
                (WindowManager) getSystemService(Context.WINDOW_SERVICE);
            windowManager.getDefaultDisplay().getRealMetrics(metrics);

            int width = metrics.widthPixels;
            int height = metrics.heightPixels;
            int density = metrics.densityDpi;

            imageReader = ImageReader.newInstance(
                width,
                height,
                android.graphics.PixelFormat.RGBA_8888,
                2
            );

            imageReader.setOnImageAvailableListener(reader -> {
                android.media.Image frame = reader.acquireLatestImage();
                if (frame != null) {
                    frame.close();
                }
            }, null);

            virtualDisplay = projection.createVirtualDisplay(
                "1StBorN-ScreenCapture",
                width,
                height,
                density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader.getSurface(),
                null,
                null
            );

        } catch (Exception error) {
            stopCapture();
            stopSelf();
        }

        return START_NOT_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Screen Capture",
                NotificationManager.IMPORTANCE_LOW
            );

            NotificationManager manager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

            manager.createNotificationChannel(channel);
        }
    }

    private void stopCapture() {
        if (stopping) {
            return;
        }

        stopping = true;

        MediaProjection oldProjection = projection;
        projection = null;

        if (virtualDisplay != null) {
            virtualDisplay.release();
            virtualDisplay = null;
        }

        if (imageReader != null) {
            imageReader.close();
            imageReader = null;
        }

        if (oldProjection != null) {
            oldProjection.stop();
        }

        stopForeground(true);
    }

    @Override
    public void onDestroy() {
        stopCapture();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
