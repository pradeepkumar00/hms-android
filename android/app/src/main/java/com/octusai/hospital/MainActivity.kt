package com.octusai.hospital

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

// CUSTOM NOTIFICATION SOUND IMPORTS - REVERSIBLE CHANGES START
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ContentResolver
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.os.Bundle
// CUSTOM NOTIFICATION SOUND IMPORTS - REVERSIBLE CHANGES END

class MainActivity : ReactActivity() {

  // CUSTOM NOTIFICATION SOUND SETUP - REVERSIBLE CHANGES START
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    
    // Create notification channels for custom sounds (Android 8.0+)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      createNotificationChannels()
    }
  }

  private fun createNotificationChannels() {
    val notificationManager = getSystemService(NotificationManager::class.java)
    
    // Default channel with custom sound
    val defaultChannel = NotificationChannel(
      "default_notifications",
      "Hospital Management Notifications",
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Task assignments, updates and alerts"
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 300, 200, 300)
      setShowBadge(true)
      
      // Set custom sound from res/raw/default_notification.mp3
      val soundUri = Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://$packageName/raw/default_notification")
      val audioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
      setSound(soundUri, audioAttributes)
    }
    
    // Alert sound channel
    val alertChannel = NotificationChannel(
      "custom_sound_alert_sound",
      "Alert Notifications",
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "High priority alert notifications"
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 250, 250, 250)
      setShowBadge(true)
      
      val soundUri = Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://$packageName/raw/alert_sound")
      val audioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
      setSound(soundUri, audioAttributes)
    }
    
    // Chime sound channel
    val chimeChannel = NotificationChannel(
      "custom_sound_chime_sound", 
      "Chime Notifications",
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Chime sound notifications"
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 200, 200, 200)
      setShowBadge(true)
      
      val soundUri = Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://$packageName/raw/chime_sound")
      val audioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
      setSound(soundUri, audioAttributes)
    }
    
    // Create all channels
    notificationManager.createNotificationChannel(defaultChannel)
    notificationManager.createNotificationChannel(alertChannel)
    notificationManager.createNotificationChannel(chimeChannel)
  }
  // CUSTOM NOTIFICATION SOUND SETUP - REVERSIBLE CHANGES END

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "HospitalManagement"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
