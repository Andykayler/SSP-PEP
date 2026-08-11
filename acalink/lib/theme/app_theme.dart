import 'package:flutter/material.dart';

/// ─── Design tokens — shared across HomeShell, StudentSelectScreen,
/// FeesScreen, and any future screen. Previously duplicated as a
/// private `_T` class in each file; extracted here per the long-
/// standing TODO now that a third screen needed it. ──────────────────
class AppTheme {
  AppTheme._();

  static const bg = Color(0xFFF8F6F0);
  static const heroBg = Color(0xFFFFFFFF);
  static const cardBg = Color(0xFFFFFFFF);
  static const cardBgHover = Color(0xFFF3F0E8);
  static const border = Color(0xFFE3DFD3);
  static const borderStrong = Color(0xFFCDC7B5);

  static const textPrimary = Color(0xFF1E2A44);
  static const textSecondary = Color(0xFF5B6478);
  static const textMuted = Color(0xFF95978F);

  static const primary = Color(0xFF4F6EF7);
  static const primaryLight = Color(0xFF3454E0);
  static const primaryPale = Color(0x144F6EF7);

  static const navyStart = Color(0xFF2D3A5E);
  static const navyEnd = Color(0xFF3D4F7A);

  static const warning = Color(0xFFC47D0E);
  static const warningPale = Color(0x1AE8A800);

  static const success = Color(0xFF2E9E5B);
  static const successPale = Color(0x142E9E5B);

  static const danger = Color(0xFFC4453D);
  static const dangerPale = Color(0x14C4453D);

  static const fontMono = 'monospace';
  static const fontDisplay = null;
}
