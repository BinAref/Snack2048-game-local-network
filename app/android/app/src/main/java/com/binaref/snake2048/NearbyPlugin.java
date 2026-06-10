package com.binaref.snake2048;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.android.gms.nearby.Nearby;
import com.google.android.gms.nearby.connection.AdvertisingOptions;
import com.google.android.gms.nearby.connection.ConnectionInfo;
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback;
import com.google.android.gms.nearby.connection.ConnectionResolution;
import com.google.android.gms.nearby.connection.ConnectionsClient;
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo;
import com.google.android.gms.nearby.connection.DiscoveryOptions;
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback;
import com.google.android.gms.nearby.connection.Payload;
import com.google.android.gms.nearby.connection.PayloadCallback;
import com.google.android.gms.nearby.connection.PayloadTransferUpdate;
import com.google.android.gms.nearby.connection.Strategy;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * إضافة Nearby Connections — لعب محلي بين الهواتف بلا إنترنت (بلوتوث/واي‑فاي مباشر).
 * تعيد استخدام نفس بروتوكول رسائل اللعبة عبر حمولات بايت (JSON).
 */
@CapacitorPlugin(name = "Nearby")
public class NearbyPlugin extends Plugin {
    private static final String SERVICE_ID = "com.binaref.snake2048.lan";
    private static final Strategy STRATEGY = Strategy.P2P_STAR;
    private ConnectionsClient client;
    private String localName = "Player";

    private ConnectionsClient client() {
        if (client == null) client = Nearby.getConnectionsClient(getContext());
        return client;
    }

    private final PayloadCallback payloadCallback = new PayloadCallback() {
        @Override public void onPayloadReceived(@NonNull String endpointId, @NonNull Payload payload) {
            byte[] b = payload.asBytes();
            if (payload.getType() == Payload.Type.BYTES && b != null) {
                JSObject ev = new JSObject();
                ev.put("id", endpointId);
                ev.put("data", new String(b, StandardCharsets.UTF_8));
                notifyListeners("data", ev);
            }
        }
        @Override public void onPayloadTransferUpdate(@NonNull String endpointId, @NonNull PayloadTransferUpdate u) {}
    };

    private final ConnectionLifecycleCallback connectionCallback = new ConnectionLifecycleCallback() {
        @Override public void onConnectionInitiated(@NonNull String endpointId, @NonNull ConnectionInfo info) {
            client().acceptConnection(endpointId, payloadCallback); // قبول تلقائي
        }
        @Override public void onConnectionResult(@NonNull String endpointId, @NonNull ConnectionResolution result) {
            JSObject ev = new JSObject(); ev.put("id", endpointId);
            notifyListeners(result.getStatus().isSuccess() ? "open" : "connectFail", ev);
        }
        @Override public void onDisconnected(@NonNull String endpointId) {
            JSObject ev = new JSObject(); ev.put("id", endpointId);
            notifyListeners("close", ev);
        }
    };

    private final EndpointDiscoveryCallback discoveryCallback = new EndpointDiscoveryCallback() {
        @Override public void onEndpointFound(@NonNull String endpointId, @NonNull DiscoveredEndpointInfo info) {
            JSObject ev = new JSObject(); ev.put("id", endpointId); ev.put("name", info.getEndpointName());
            notifyListeners("endpointFound", ev);
            client().requestConnection(localName, endpointId, connectionCallback); // طلب الاتصال بالمضيف
        }
        @Override public void onEndpointLost(@NonNull String endpointId) {
            JSObject ev = new JSObject(); ev.put("id", endpointId);
            notifyListeners("endpointLost", ev);
        }
    };

    private String[] neededPerms() {
        List<String> p = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 31) {
            p.add(Manifest.permission.BLUETOOTH_ADVERTISE);
            p.add(Manifest.permission.BLUETOOTH_CONNECT);
            p.add(Manifest.permission.BLUETOOTH_SCAN);
        } else {
            p.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (Build.VERSION.SDK_INT >= 33) p.add(Manifest.permission.NEARBY_WIFI_DEVICES);
        return p.toArray(new String[0]);
    }

    private boolean hasPerms() {
        for (String perm : neededPerms())
            if (ContextCompat.checkSelfPermission(getContext(), perm) != PackageManager.PERMISSION_GRANTED) return false;
        return true;
    }

    private void requestPerms() {
        ActivityCompat.requestPermissions(getActivity(), neededPerms(), 9123);
    }

    @PluginMethod
    public void requestPermissionsNow(PluginCall call) {
        if (!hasPerms()) requestPerms();
        JSObject r = new JSObject(); r.put("granted", hasPerms());
        call.resolve(r);
    }

    @PluginMethod
    public void startHost(PluginCall call) {
        localName = call.getString("name", "Host");
        if (!hasPerms()) { requestPerms(); call.reject("permissions"); return; }
        AdvertisingOptions opts = new AdvertisingOptions.Builder().setStrategy(STRATEGY).build();
        client().startAdvertising(localName, SERVICE_ID, connectionCallback, opts)
                .addOnSuccessListener(unused -> call.resolve())
                .addOnFailureListener(e -> call.reject("advertise: " + e.getMessage()));
    }

    @PluginMethod
    public void startJoin(PluginCall call) {
        localName = call.getString("name", "Player");
        if (!hasPerms()) { requestPerms(); call.reject("permissions"); return; }
        DiscoveryOptions opts = new DiscoveryOptions.Builder().setStrategy(STRATEGY).build();
        client().startDiscovery(SERVICE_ID, discoveryCallback, opts)
                .addOnSuccessListener(unused -> call.resolve())
                .addOnFailureListener(e -> call.reject("discover: " + e.getMessage()));
    }

    @PluginMethod
    public void send(PluginCall call) {
        String data = call.getString("data", "");
        String to = call.getString("to", null);
        if (to != null && client != null)
            client.sendPayload(to, Payload.fromBytes(data.getBytes(StandardCharsets.UTF_8)));
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (client != null) {
            client.stopAdvertising();
            client.stopDiscovery();
            client.stopAllEndpoints();
        }
        call.resolve();
    }
}
