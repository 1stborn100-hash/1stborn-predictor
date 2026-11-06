package com.firstborn.predictor;

import android.app.Activity;
import android.content.Intent;
import androidx.core.content.ContextCompat;
import android.media.projection.MediaProjectionManager;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.JSObject;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ScreenCapture")
public class ScreenCapturePlugin extends Plugin {

    public static int projectionResultCode = Activity.RESULT_CANCELED;
    public static Intent projectionData = null;

    @PluginMethod
    public void requestPermission(PluginCall call) {
        MediaProjectionManager manager =
            (MediaProjectionManager) getContext().getSystemService(
                Activity.MEDIA_PROJECTION_SERVICE
            );

        if (manager == null) {
            call.reject("Screen capture is not available on this device.");
            return;
        }

        startActivityForResult(
            call,
            manager.createScreenCaptureIntent(),
            "handlePermissionResult"
        );
    }

    @ActivityCallback
    private void handlePermissionResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            projectionResultCode = Activity.RESULT_CANCELED;
            projectionData = null;

            JSObject response = new JSObject();
            response.put("granted", false);
            call.resolve(response);
            return;
        }

        projectionResultCode = result.getResultCode();
        projectionData = result.getData();

        JSObject response = new JSObject();
        response.put("granted", true);
        call.resolve(response);
    }

    @PluginMethod
    public void startCapture(PluginCall call) {
        if (projectionResultCode != Activity.RESULT_OK || projectionData == null) {
            call.reject("Screen capture permission is missing. Request permission again.");
            return;
        }

        Intent permissionIntent = projectionData;
        int resultCode = projectionResultCode;

        projectionData = null;
        projectionResultCode = Activity.RESULT_CANCELED;

        Intent serviceIntent = new Intent(getContext(), ScreenCaptureService.class);
        serviceIntent.setAction(ScreenCaptureService.ACTION_START);
        serviceIntent.putExtra("resultCode", resultCode);
        serviceIntent.putExtra("permissionData", permissionIntent);

        try {
            ContextCompat.startForegroundService(getContext(), serviceIntent);
            JSObject response = new JSObject();
            response.put("started", true);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Could not start screen capture service.", error);
        }
    }

    @PluginMethod
    public void stopCapture(PluginCall call) {
        Intent serviceIntent = new Intent(getContext(), ScreenCaptureService.class);
        boolean stopped = getContext().stopService(serviceIntent);

        JSObject response = new JSObject();
        response.put("stopped", stopped);
        call.resolve(response);
    }

}
