import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/student.dart';

class DisciplineSummary {
  final int openCases;
  final int totalCases;
  const DisciplineSummary({required this.openCases, required this.totalCases});

  static const empty = DisciplineSummary(openCases: 0, totalCases: 0);
}

/// Reads `discipline_cases` the same way DisciplineModule.jsx writes them —
/// "open" mirrors that module's own convention: any status that doesn't
/// contain the word "resolved" (case-insensitive) counts as still open.
class DisciplineService {
  final FirebaseFirestore _firestore;
  DisciplineService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  Future<DisciplineSummary> fetchSummary(Student student) async {
    final snap = await _firestore
        .collection('discipline_cases')
        .where('schoolCode', isEqualTo: student.schoolCode)
        .where('studentId', isEqualTo: student.id)
        .get();

    int open = 0;
    for (final doc in snap.docs) {
      final status = (doc.data()['status'] as String? ?? '').toLowerCase();
      if (!status.contains('resolved')) open++;
    }
    return DisciplineSummary(openCases: open, totalCases: snap.docs.length);
  }
}
