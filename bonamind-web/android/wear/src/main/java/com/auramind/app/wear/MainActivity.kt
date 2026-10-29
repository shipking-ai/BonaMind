package com.auramind.app.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.ui.graphics.Color
import androidx.wear.compose.material.Colors
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Scaffold

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(
                colors = Colors(
                    primary = Color(0xFF7C3AED),
                    primaryVariant = Color(0xFF7C3AED),
                    secondary = Color(0xFF67E8F9),
                    secondaryVariant = Color(0xFF67E8F9),
                    background = Color(0xFF0D1528),
                    surface = Color(0xFF0D1528),
                    error = Color(0xFFEF4444),
                    onPrimary = Color(0xFFEDE9FE),
                    onSecondary = Color(0xFF0D1528),
                    onBackground = Color(0xFFEDE9FE),
                    onSurface = Color(0xFFEDE9FE),
                    onSurfaceVariant = Color(0xFFC4B5FD),
                    onError = Color(0xFFFFFFFF),
                ),
            ) {
                Scaffold {
                    ReviewApp()
                }
            }
        }
    }
}