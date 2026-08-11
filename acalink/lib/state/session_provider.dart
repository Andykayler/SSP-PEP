import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart' as shared_preferences;

import '../models/student.dart';
import '../services/auth_service.dart';

enum SessionStatus { unknown, loggedOut, needsStudentPick, ready }

class SessionProvider extends ChangeNotifier {
  final AuthService _authService = AuthService();

  static const _kPhoneKey = 'acalink_parent_phone';
  static const _kSelectedStudentKey = 'acalink_selected_student_id';

  SessionStatus status = SessionStatus.unknown;
  String? parentPhone;
  List<Student> students = [];
  Student? selectedStudent;
  String? error;
  bool loading = false;

  /// Called once at app start (from SplashScreen) to restore a saved session.
  Future<void> restoreSession() async {
    loading = true;
    notifyListeners();

    final prefs = await shared_preferences.SharedPreferences.getInstance();
    final savedPhone = prefs.getString(_kPhoneKey);

    if (savedPhone == null) {
      status = SessionStatus.loggedOut;
      loading = false;
      notifyListeners();
      return;
    }

    try {
      final fetched = await _authService.fetchStudentsForPhone(savedPhone);
      if (fetched.isEmpty) {
        // Family no longer has any linked students — fall back to login.
        await _clearStoredSession();
        status = SessionStatus.loggedOut;
      } else {
        parentPhone = savedPhone;
        students = fetched;
        final savedStudentId = prefs.getString(_kSelectedStudentKey);
        _resolveSelection(savedStudentId);
      }
    } catch (_) {
      status = SessionStatus.loggedOut;
    }

    loading = false;
    notifyListeners();
  }

  Future<bool> login(String phone, String password) async {
    loading = true;
    error = null;
    notifyListeners();

    final result = await _authService.loginWithPhonePassword(
      rawPhone: phone,
      password: password,
    );

    if (!result.success) {
      error = result.error;
      loading = false;
      notifyListeners();
      return false;
    }

    parentPhone = result.normalisedPhone;
    students = result.students;

    final prefs = await shared_preferences.SharedPreferences.getInstance();
    await prefs.setString(_kPhoneKey, result.normalisedPhone);

    _resolveSelection(null);
    loading = false;
    notifyListeners();
    return true;
  }

  void _resolveSelection(String? savedStudentId) {
    if (students.length == 1) {
      selectedStudent = students.first;
      status = SessionStatus.ready;
      _persistSelectedStudent(selectedStudent!.id);
      return;
    }

    if (savedStudentId != null) {
      final match = students.where((s) => s.id == savedStudentId);
      if (match.isNotEmpty) {
        selectedStudent = match.first;
        status = SessionStatus.ready;
        return;
      }
    }

    status = SessionStatus.needsStudentPick;
  }

  Future<void> selectStudent(Student student) async {
    selectedStudent = student;
    status = SessionStatus.ready;
    await _persistSelectedStudent(student.id);
    notifyListeners();
  }

  /// Lets a parent jump back to the switcher without logging out.
  void openStudentSwitcher() {
    status = SessionStatus.needsStudentPick;
    notifyListeners();
  }

  Future<void> _persistSelectedStudent(String studentId) async {
    final prefs = await shared_preferences.SharedPreferences.getInstance();
    await prefs.setString(_kSelectedStudentKey, studentId);
  }

  Future<void> logout() async {
    await _clearStoredSession();
    parentPhone = null;
    students = [];
    selectedStudent = null;
    status = SessionStatus.loggedOut;
    notifyListeners();
  }

  Future<void> _clearStoredSession() async {
    final prefs = await shared_preferences.SharedPreferences.getInstance();
    await prefs.remove(_kPhoneKey);
    await prefs.remove(_kSelectedStudentKey);
  }
}