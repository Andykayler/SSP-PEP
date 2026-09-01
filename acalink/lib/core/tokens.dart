import 'package:flutter/material.dart';

/// Shared design tokens for ACALink screens. HomeShell and StudentSelectScreen
/// each carry a private `_T` copy of these values; new screens use this one so
/// there is a single place to change the palette from here on.
class T {
  static const bg = Color(0xFFF8F6F0);
  static const heroBg = Color(0xFFFFFFFF);
  static const cardBg = Color(0xFFFFFFFF);
  static const border = Color(0xFFE3DFD3);
  static const borderStrong = Color(0xFFCDC7B5);

  static const textPrimary = Color(0xFF1E2A44);
  static const textSecondary = Color(0xFF5B6478);
  static const textMuted = Color(0xFF95978F);

  static const primary = Color(0xFF4F6EF7);
  static const primaryDark = Color(0xFF3454E0);
  static const primaryPale = Color(0x144F6EF7);

  static const navyStart = Color(0xFF2D3A5E);
  static const navyEnd = Color(0xFF3D4F7A);

  static const warning = Color(0xFFC47D0E);
  static const warningPale = Color(0x1AE8A800);

  static const success = Color(0xFF2E9E5B);
  static const successPale = Color(0x142E9E5B);

  static const danger = Color(0xFFC4453D);
  static const dangerPale = Color(0x14C4453D);

  static const purple = Color(0xFF8B5CF6);
  static const purplePale = Color(0x148B5CF6);

  static const fontMono = 'monospace';
}

/// Deterministic avatar tint, so the same person keeps the same colour
/// everywhere in the app. Mirrors the web portal's `tintFor`.
const _avatarTints = <Color>[
  Color(0xFF4F6EF7),
  Color(0xFF8B5CF6),
  Color(0xFF0EA5E9),
  Color(0xFF10B981),
  Color(0xFFF59E0B),
  Color(0xFFEF4444),
  Color(0xFFEC4899),
  Color(0xFF14B8A6),
];

Color tintFor(String id) {
  var sum = 0;
  for (final unit in id.codeUnits) {
    sum += unit;
  }
  return _avatarTints[sum % _avatarTints.length];
}

String initialsOf(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  return parts.take(2).map((p) => p[0].toUpperCase()).join();
}

String relativeTime(DateTime? dt) {
  if (dt == null) return '';
  final diff = DateTime.now().difference(dt);
  if (diff.inMinutes < 1) return 'Just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  return '${dt.day}/${dt.month}/${dt.year}';
}
