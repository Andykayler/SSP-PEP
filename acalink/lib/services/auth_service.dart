import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../core/phone_utils.dart';
import '../models/student.dart';

class ParentLoginResult {
  final bool success;
  final String? error;
  final List<Student> students;
  final String normalisedPhone;

  ParentLoginResult({
    required this.success,
    this.error,
    this.students = const [],
    this.normalisedPhone = '',
  });
}

class AuthService {
  final _firestore = FirebaseFirestore.instance;
  final _auth = FirebaseAuth.instance;

  /// Ensures we hold *some* Firebase Auth session before touching Firestore,
  /// so security rules can require `request.auth != null` on reads.
  Future<void> ensureSignedIn() async {
    if (_auth.currentUser == null) {
      await _auth.signInAnonymously();
    }
  }

  /// Looks up every student linked to [rawPhone], then checks whether
  /// [password] matches the parentPortalPassword on at least one of them.
  /// On success, the parent gets access to ALL students under that phone —
  /// not just the one whose password they typed.
  Future<ParentLoginResult> loginWithPhonePassword({
    required String rawPhone,
    required String password,
  }) async {
    await ensureSignedIn();

    final phone = normalisePhone(rawPhone);
    if (password.trim().isEmpty) {
      return ParentLoginResult(success: false, error: 'Enter your password.');
    }

    final snap = await _firestore
        .collection('students')
        .where('guardianPhone', isEqualTo: phone)
        .get();

    if (snap.docs.isEmpty) {
      return ParentLoginResult(
        success: false,
        error: 'No students found for this phone number.',
      );
    }

    final students = snap.docs.map(Student.fromDoc).toList();
    final passwordMatches =
        students.any((s) => s.parentPortalPassword == password.trim());

    if (!passwordMatches) {
      return ParentLoginResult(success: false, error: 'Incorrect password.');
    }

    return ParentLoginResult(
      success: true,
      students: students,
      normalisedPhone: phone,
    );
  }

  /// Re-fetches all students for a phone number without a password check —
  /// used to refresh the session on app relaunch once we already trust it
  /// (phone is stored locally after a successful login).
  Future<List<Student>> fetchStudentsForPhone(String phone) async {
    await ensureSignedIn();
    final snap = await _firestore
        .collection('students')
        .where('guardianPhone', isEqualTo: phone)
        .get();
    return snap.docs.map(Student.fromDoc).toList();
  }
}