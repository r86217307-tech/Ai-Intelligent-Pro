/**
 * Android Packaging & Build Configuration for Sufia AI (Phase 21)
 * Encapsulates Gradle build properties, Android manifest requirements,
 * environment endpoints, and release signing specifications.
 */

export interface AndroidBuildConfig {
  applicationId: string;
  versionCode: number;
  versionName: string;
  minSdkVersion: number;
  targetSdkVersion: number;
  compileSdkVersion: number;
  ndkVersion?: string;
  javaVersion: string;
  kotlinVersion: string;
  buildTypes: {
    debug: {
      applicationIdSuffix: string;
      debuggable: boolean;
      minifyEnabled: boolean;
      shrinkResources: boolean;
    };
    release: {
      debuggable: boolean;
      minifyEnabled: boolean;
      shrinkResources: boolean;
      proguardFiles: string[];
      signingConfig: string;
    };
  };
  serverEndpoints: {
    production: {
      httpBaseUrl: string;
      wsBaseUrl: string;
    };
    staging: {
      httpBaseUrl: string;
      wsBaseUrl: string;
    };
  };
}

export const androidBuildConfig: AndroidBuildConfig = {
  applicationId: 'ai.sufia.trader',
  versionCode: 1,
  versionName: '1.0.0',
  minSdkVersion: 24, // Android 7.0 Nougat (AudioWorklet & Modern Chrome WebView support)
  targetSdkVersion: 34, // Android 14
  compileSdkVersion: 34,
  javaVersion: '17',
  kotlinVersion: '1.9.22',
  buildTypes: {
    debug: {
      applicationIdSuffix: '.debug',
      debuggable: true,
      minifyEnabled: false,
      shrinkResources: false
    },
    release: {
      debuggable: false,
      minifyEnabled: true,
      shrinkResources: true,
      proguardFiles: ['proguard-android-optimize.txt', 'proguard-rules.pro'],
      signingConfig: 'signingConfigs.release'
    }
  },
  serverEndpoints: {
    production: {
      httpBaseUrl: typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : 'https://sufia.ai',
      wsBaseUrl: typeof window !== 'undefined'
        ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/live`
        : 'wss://sufia.ai/live'
    },
    staging: {
      httpBaseUrl: 'https://staging.sufia.ai',
      wsBaseUrl: 'wss://staging.sufia.ai/live'
    }
  }
};

/**
 * Android Manifest XML Structure Blueprint
 */
export const androidManifestXmlBlueprint = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="ai.sufia.trader">

    <!-- Essential Android Permissions -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />

    <!-- Hardware Feature Flags -->
    <uses-feature android:name="android.hardware.microphone" android:required="false" />
    <uses-feature android:name="android.hardware.screen.portrait" android:required="true" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.SufiaAI"
        android:usesCleartextTraffic="false"
        android:hardwareAccelerated="true">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:launchMode="singleTask"
            android:screenOrientation="portrait"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`;
