import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/student.dart';

class SubjectGrade {
  final String subject;
  final double score;
  const SubjectGrade(this.subject, this.score);
}

class PerformanceSummary {
  final List<SubjectGrade> subjectGrades; // this student, one row per subject
  final double? overallAverage;
  final int? rank;
  final int classSize;

  const PerformanceSummary({
    required this.subjectGrades,
    required this.overallAverage,
    required this.rank,
    required this.classSize,
  });

  bool get hasData => subjectGrades.isNotEmpty;

  static const empty = PerformanceSummary(
    subjectGrades: [],
    overallAverage: null,
    rank: null,
    classSize: 0,
  );
}

/// Simple letter-grade bucketing for the app's grade chips — not the MANEB
/// 1–9 scale the web dashboards use (that's a bigger, opinionated mapping
/// tied to MSCE reporting); this is just enough to color-code a score.
String letterGrade(double score) {
  if (score >= 80) return 'A';
  if (score >= 70) return 'A-';
  if (score >= 65) return 'B+';
  if (score >= 60) return 'B';
  if (score >= 55) return 'B-';
  if (score >= 50) return 'C+';
  if (score >= 45) return 'C';
  if (score >= 40) return 'C-';
  return 'F';
}

/// Reads `ca_marks` the same way the web Reports module's non-Overall tabs
/// do: every assessment component (CA1/CA2/Mid-Term/End-of-Term) submitted
/// for the term is merged last-write-wins into one figure per subject,
/// rather than the fully weighted 10/10/20/60 combination the web's
/// Performance Analytics "Overall" tab (and the promotion flow) compute.
/// Good enough for an at-a-glance app card. If that precision is needed
/// here too, port ASSESSMENT_TYPES/computeWeighted from
/// headteacher/modules/reports.jsx the same way its own Promotion tab does.
class PerformanceService {
  final FirebaseFirestore _firestore;
  PerformanceService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  // TODO: no shared "current term" source exists yet across the web app
  // (each module hardcodes its own) — mirrors the term shown in this app's
  // own dashboard hero. Update both together until a real source exists.
  static const currentTerm = 'Term 2 2026';

  Future<PerformanceSummary> fetchPerformance(Student student) async {
    if (student.classId.isEmpty) return PerformanceSummary.empty;

    final marksSnap = await _firestore
        .collection('ca_marks')
        .where('schoolCode', isEqualTo: student.schoolCode)
        .where('classId', isEqualTo: student.classId)
        .where('term', isEqualTo: currentTerm)
        .get();

    // studentId -> subject -> score
    final Map<String, Map<String, num>> byStudent = {};
    for (final doc in marksSnap.docs) {
      final marks = doc.data()['marks'] as Map<String, dynamic>? ?? {};
      marks.forEach((studentId, subjectMarks) {
        if (subjectMarks is! Map) return;
        final bucket = byStudent.putIfAbsent(studentId, () => {});
        subjectMarks.forEach((subject, score) {
          if (score is num) bucket[subject as String] = score;
        });
      });
    }

    double? avgOf(Map<String, num> subjectMap) {
      if (subjectMap.isEmpty) return null;
      final values = subjectMap.values.toList();
      return values.reduce((a, b) => a + b) / values.length;
    }

    final classAverages = <String, double>{};
    byStudent.forEach((studentId, subjectMap) {
      final a = avgOf(subjectMap);
      if (a != null) classAverages[studentId] = a;
    });

    final myMarks = byStudent[student.id] ?? {};
    final subjectGrades = myMarks.entries
        .map((e) => SubjectGrade(e.key, e.value.toDouble()))
        .toList()
      ..sort((a, b) => a.subject.compareTo(b.subject));

    final overallAverage = avgOf(myMarks);

    int? rank;
    if (overallAverage != null) {
      final sorted = classAverages.values.toList()..sort((a, b) => b.compareTo(a));
      final idx = sorted.indexWhere((v) => (v - overallAverage).abs() < 0.001);
      rank = idx >= 0 ? idx + 1 : null;
    }

    // Class size read separately from `students`, rather than
    // classAverages.length — not every classmate necessarily has marks
    // entered for this term yet.
    final studentSnap = await _firestore
        .collection('students')
        .where('schoolCode', isEqualTo: student.schoolCode)
        .where('classId', isEqualTo: student.classId)
        .get();

    return PerformanceSummary(
      subjectGrades: subjectGrades,
      overallAverage: overallAverage,
      rank: rank,
      classSize: studentSnap.docs.length,
    );
  }
}
