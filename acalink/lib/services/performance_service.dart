import 'package:cloud_firestore/cloud_firestore.dart';

import 'academic_term_service.dart';
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

  /// Weights of the four assessment components, matching ASSESSMENT_TYPES in
  /// the web portal's PerformanceModule. A term grade is the weighted mean of
  /// whichever components have been entered so far, so a class with only CA 1
  /// recorded still shows a sensible figure.
  static const _componentWeights = <String, double>{
    'CA1': 0.10,
    'CA2': 0.10,
    'MidTerm': 0.20,
    'EndTerm': 0.60,
  };

  final _terms = AcademicTermService();

  Future<PerformanceSummary> fetchPerformance(Student student) async {
    if (student.classId.isEmpty) return PerformanceSummary.empty;

    // The term the school is actually recording against. Empty means nobody
    // has set one yet — showing nothing is honest, guessing would resurrect
    // exactly the mismatch this replaced.
    final term = await _terms.currentTerm(student.schoolCode);
    if (term.isEmpty) return PerformanceSummary.empty;

    final marksSnap = await _firestore
        .collection('ca_marks')
        .where('schoolCode', isEqualTo: student.schoolCode)
        .where('classId', isEqualTo: student.classId)
        .where('term', isEqualTo: term)
        .get();

    // studentId -> subject -> component -> score. Each teacher writes one
    // document per component, so a subject's four scores arrive across four
    // documents and have to be gathered before they can be weighted.
    final Map<String, Map<String, Map<String, num>>> raw = {};
    for (final doc in marksSnap.docs) {
      final data = doc.data();
      final component = (data['assessmentType'] as String?) ?? 'EndTerm';
      final marks = data['marks'] as Map<String, dynamic>? ?? {};
      marks.forEach((studentId, subjectMarks) {
        if (subjectMarks is! Map) return;
        final perSubject = raw.putIfAbsent(studentId, () => {});
        subjectMarks.forEach((subject, score) {
          if (score is num) {
            perSubject.putIfAbsent(subject as String, () => {})[component] = score;
          }
        });
      });
    }

    // studentId -> subject -> weighted term score
    final Map<String, Map<String, num>> byStudent = {};
    raw.forEach((studentId, perSubject) {
      final bucket = byStudent.putIfAbsent(studentId, () => {});
      perSubject.forEach((subject, perComponent) {
        double weightedSum = 0;
        double weightUsed = 0;
        perComponent.forEach((component, score) {
          final w = _componentWeights[component];
          if (w == null) return;
          weightedSum += score * w;
          weightUsed += w;
        });
        if (weightUsed > 0) {
          bucket[subject] = (weightedSum / weightUsed * 10).round() / 10;
        }
      });
    });

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
