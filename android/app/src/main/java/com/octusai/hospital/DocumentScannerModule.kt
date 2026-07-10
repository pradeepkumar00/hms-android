package com.octusai.hospital

import android.app.Activity
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import com.facebook.react.bridge.*
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import java.io.File

class DocumentScannerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private var scanPromise: Promise? = null
    private val REQUEST_CODE_SCAN = 19992

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String {
        return "DocumentScanner"
    }

    @ReactMethod
    fun startScan(optionsMap: ReadableMap, promise: Promise) {
        val activity = getCurrentActivity()
        if (activity == null) {
            promise.reject("ACTIVITY_NOT_FOUND", "Activity doesn't exist")
            return
        }

        scanPromise = promise

        try {
            val pageLimit = if (optionsMap.hasKey("pageLimit")) optionsMap.getInt("pageLimit") else 1
            val galleryAllowed = if (optionsMap.hasKey("galleryImportAllowed")) optionsMap.getBoolean("galleryImportAllowed") else true
            
            val scannerModeStr = if (optionsMap.hasKey("scannerMode")) optionsMap.getString("scannerMode") else "full"

            val scannerMode = when (scannerModeStr) {
                "base" -> GmsDocumentScannerOptions.SCANNER_MODE_BASE
                "base_with_filter" -> GmsDocumentScannerOptions.SCANNER_MODE_BASE_WITH_FILTER
                else -> GmsDocumentScannerOptions.SCANNER_MODE_FULL
            }

            val options = GmsDocumentScannerOptions.Builder()
                .setGalleryImportAllowed(galleryAllowed)
                .setPageLimit(pageLimit)
                .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
                .setScannerMode(scannerMode)
                .build()

            val scanner = GmsDocumentScanning.getClient(options)

            scanner.getStartScanIntent(activity)
                .addOnSuccessListener { intentSender ->
                    try {
                        activity.startIntentSenderForResult(
                            intentSender,
                            REQUEST_CODE_SCAN,
                            null, 0, 0, 0
                        )
                    } catch (e: Exception) {
                        scanPromise?.reject("SCANNER_FAILED", "Failed to start scanning activity", e)
                        scanPromise = null
                    }
                }
                .addOnFailureListener { e ->
                    scanPromise?.reject("SCANNER_FAILED", e.message, e)
                    scanPromise = null
                }
        } catch (e: Exception) {
            scanPromise?.reject("SCANNER_FAILED", e.message, e)
            scanPromise = null
        }
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_CODE_SCAN) return

        val promise = scanPromise
        if (promise == null) return
        scanPromise = null

        if (resultCode == Activity.RESULT_CANCELED) {
            promise.reject("CANCELLED", "User cancelled the scan")
            return
        }

        if (resultCode != Activity.RESULT_OK || data == null) {
            promise.reject("SCANNER_FAILED", "Scanner failed or returned no data")
            return
        }

        try {
            val result = GmsDocumentScanningResult.fromActivityResultIntent(data)
            val pages = result?.pages
            if (pages.isNullOrEmpty()) {
                promise.reject("SCANNER_FAILED", "No pages scanned")
                return
            }

            val firstPage = pages[0]
            val imageUri = firstPage.imageUri

            // Fetch image metadata (width and height)
            val resolver = reactApplicationContext.contentResolver
            var width = 0
            var height = 0
            try {
                resolver.openFileDescriptor(imageUri, "r")?.use { pfd ->
                    val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeFileDescriptor(pfd.fileDescriptor, null, options)
                    width = options.outWidth
                    height = options.outHeight
                }
            } catch (e: Exception) {
                // Fallback if failed to read metadata
                e.printStackTrace()
            }

            // Fetch file size
            var fileSize: Long = 0
            try {
                if (imageUri.scheme == "content") {
                    resolver.query(imageUri, null, null, null, null)?.use { cursor ->
                        if (cursor.moveToFirst()) {
                            val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                            if (sizeIndex != -1) {
                                fileSize = cursor.getLong(sizeIndex)
                            }
                        }
                    }
                } else if (imageUri.scheme == "file") {
                    imageUri.path?.let { p ->
                        val file = File(p)
                        if (file.exists()) {
                            fileSize = file.length()
                        }
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }

            val resultMap = Arguments.createMap().apply {
                putString("uri", imageUri.toString())
                putInt("width", width)
                putInt("height", height)
                putDouble("size", fileSize.toDouble())
                putString("type", "image/jpeg")
                putBoolean("success", true)
            }
            promise.resolve(resultMap)

        } catch (e: Exception) {
            promise.reject("SCANNER_FAILED", "Failed to parse scan result: ${e.message}", e)
        }
    }

    override fun onNewIntent(intent: Intent) {
        // No-op
    }
}
