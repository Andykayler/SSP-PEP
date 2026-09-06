import 'package:cloud_firestore/cloud_firestore.dart';

/// Mirrors the `students` collection written by the admin panel
/// (StudentManagement.jsx -> handleRegister).
class Student {
  final String id;
  final String studentCode;
  final String fullName;
  final String firstName;
  final String lastName;
  final String gender;
  final String dob;
  final String classId;
  final String className;
  final String schoolCode;
  final String schoolName;
  final String status;
  final String guardianName;
  final String guardianPhone;
  final String guardianEmail;
  final String guardianRelation;
  final String parentPortalPassword; // plaintext today — see security note

  /// 'active' once the guardian has confirmed this child is theirs, 'pending'
  /// while a school has attached it to an account that already existed.
  ///
  /// Missing on every record enrolled before confirmation was introduced, and
  /// read as active for exactly that reason — those families already use the
  /// app, and asking all of them to re-confirm at once would lock them out.
  final String guardianLinkStatus;

  Student({
    required this.id,
    required this.studentCode,
    required this.fullName,
    required this.firstName,
    required this.lastName,
    required this.gender,
    required this.dob,
    required this.classId,
    required this.className,
    required this.schoolCode,
    required this.schoolName,
    required this.status,
    required this.guardianName,
    required this.guardianPhone,
    required this.guardianEmail,
    required this.guardianRelation,
    required this.parentPortalPassword,
    required this.guardianLinkStatus,
  });

  bool get isPendingConfirmation => guardianLinkStatus == 'pending';

  factory Student.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? {};
    return Student(
      id: doc.id,
      studentCode: d['studentCode'] ?? '',
      fullName: d['fullName'] ?? '',
      firstName: d['firstName'] ?? '',
      lastName: d['lastName'] ?? '',
      gender: d['gender'] ?? '',
      dob: d['dob'] ?? '',
      classId: d['classId'] ?? '',
      className: d['className'] ?? '',
      schoolCode: d['schoolCode'] ?? '',
      schoolName: d['schoolName'] ?? '',
      status: d['status'] ?? 'active',
      guardianName: d['guardianName'] ?? '',
      guardianPhone: d['guardianPhone'] ?? '',
      guardianEmail: d['guardianEmail'] ?? '',
      guardianRelation: d['guardianRelation'] ?? '',
      parentPortalPassword: d['parentPortalPassword'] ?? '',
      guardianLinkStatus: d['guardianLinkStatus'] ?? 'active',
    );
  }
}