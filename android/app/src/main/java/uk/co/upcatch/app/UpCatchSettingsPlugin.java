package uk.co.upcatch.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "UpCatchSettings")
public class UpCatchSettingsPlugin extends Plugin {
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
        open(intent, call);
    }

    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        open(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS), call);
    }

    private void open(Intent intent, PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(intent);
                call.resolve();
            } catch (ActivityNotFoundException | SecurityException error) {
                try {
                    getActivity().startActivity(new Intent(Settings.ACTION_SETTINGS));
                    call.resolve();
                } catch (ActivityNotFoundException | SecurityException fallbackError) {
                    call.reject("Open phone Settings manually, then allow location for UpCatch.");
                }
            }
        });
    }
}
