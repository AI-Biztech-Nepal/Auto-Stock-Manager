import { Capacitor } from "@capacitor/core";
import { NativeBiometric, BiometryType } from "@capgo/capacitor-native-biometric";

// Namespaces the saved credentials in the OS Keystore/Keychain — unrelated to any network server.
const SERVER = "hamro-gng-auto";

export const isNative = () => Capacitor.isNativePlatform();

export async function isBiometricAvailable() {
  if (!isNative()) return false;
  try {
    const result = await NativeBiometric.isAvailable();
    return result.isAvailable && result.biometryType !== BiometryType.NONE;
  } catch { return false; }
}

export async function hasSavedCredentials() {
  if (!isNative()) return false;
  try {
    const creds = await NativeBiometric.getCredentials({ server: SERVER });
    return !!creds?.username;
  } catch { return false; }
}

export async function saveCredentials(username, password) {
  if (!isNative()) return;
  await NativeBiometric.setCredentials({ username, password, server: SERVER });
}

export async function deleteCredentials() {
  if (!isNative()) return;
  try { await NativeBiometric.deleteCredentials({ server: SERVER }); } catch { /* nothing saved */ }
}

export async function verifyIdentity(reason = "Confirm your identity") {
  await NativeBiometric.verifyIdentity({ reason, title: "Biometric Login", subtitle: reason });
}

export async function verifyAndGetCredentials() {
  await verifyIdentity("Log in to Auto Stock Manager");
  return NativeBiometric.getCredentials({ server: SERVER });
}
