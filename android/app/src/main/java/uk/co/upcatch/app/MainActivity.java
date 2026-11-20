package uk.co.upcatch.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UpCatchSettingsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
