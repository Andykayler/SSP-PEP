import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/student.dart';
import 'academic_term_service.dart';

/// The four assessment components, in the order a term runs. Mirrors
/// ASSESSMENT_TYPES in the web portal's PerformanceModule — the ids are the
/// `assessmentType` field on each ca_marks document.
class AssessmentComponent {
  final String id;
  final String label;
  final double weight;
  const AssessmentComponent(this.id, this.label, this.weight);
}

const kComponents = <AssessmentComponent>[
  AssessmentComponent('CA1', 'CA 1', 0.10),
  AssessmentComponent('CA2', 'CA 2', 0.10),
  AssessmentComponent('MidTerm', 'Mid-Term', 0.20),
  AssessmentComponent('EndTerm', 'End of Term', 0.60),
];

/// MANEB (MSCE) grade scale, mirroring MANEB_GRADES in PerformanceModule.
class ManebGrade {
  final int grade;
  final String remark;
  final String tone; // success | primary | warning | danger
  const ManebGrade(this.grade, this.remark, this.tone);
}

ManebGrade gradeFor(num score) {
  if (score >= 80) return const ManebGrade(1, 'Distinction', 'success');
  if (score >= 70) return const ManebGrade(2, 'Distinction', 'success');
  if (score >= 65) return const ManebGrade(3, 'Credit', 'primary');
  if (score >= 60) return const ManebGrade(4, 'Credit', 'primary');
  if (score >= 55) return const ManebGrade(5, 'Credit', 'primary');
  if (score >= 50) return const ManebGrade(6, 'Credit', 'primary');
  if (score >= 45) return const ManebGrade(7, 'Pass', 'warning');
  if (score >= 40) return const ManebGrade(8, 'Pass', 'warning');
  return const ManebGrade(9, 'Fail', 'danger');
}

/// One subject, with whatever components have been published so far.
class SubjectResult {
  final String subject;
  /// componentId -> score. Only components the teacher has PUBLISHED appear.
  final Map<String, num> components;

  const SubjectResult({required this.subject, required this.components});

  bool hasComponent(String id) => components.containsKey(id);

  /// Weighted mean across the components present, so a subject with only
  /// CA 1 entered still reads sensibly rather than looking like a 10% score.
  double? get weighted {
    double sum = 0, used = 0;
    for (final c in kComponents) {
      final v = components[c.id];
      if (v == null) continue;
      sum += v * c.weight;
      used += c.weight;
    }
    if (used == 0) return null;
    return (sum / used * 10).round() / 10;
  }

  /// True once every component has been published — until then the weighted
  /// figure is provisional and the UI says so.
  bool get complete => kComponents.every((c) => components.containsKey(c.id));
}

/// A report card is a snapshot the head teacher releases. Its existence is
/// what makes the combined term result visible to a family — individual
/// components appear as teachers publish them, but the final assessment is
/// deliberately withheld until the school issues it.
class ReportCard {
  final String term;
  final String className;
  final List<SubjectResult> subjects;
  final double? overallAverage;
  final int? position;
  final int? classSize;
  final String? headTeacherRemark;
  final DateTime? generatedAt;

  const ReportCard({
    required this.term,
    required this.className,
    required this.subjects,
    required this.overallAverage,
    required this.position,
    required this.classSize,
    required this.headTeacherRemark,
    required this.generatedAt,
  });

  static String docId(String schoolCode, String studentId, String term) =>
      '${schoolCode}__${studentId}__${term.replaceAll(RegExp(r'\s+'), '_')}';

  factory ReportCard.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? {};
    final subjects = ((d['subjects'] as List?) ?? []).map((raw) {
      final m = (raw as Map).cast<String, dynamic>();
      final comps = ((m['components'] as Map?) ?? {}).cast<String, dynamic>();
      return SubjectResult(
        subject: m['subject'] as String? ?? '',
        components: {
          for (final e in comps.entries)
            if (e.value is num) e.key: e.value as num,
        },
      );
    }).toList();

    final ts = d['generatedAt'];
    return ReportCard(
      term: d['term'] as String? ?? '',
      className: d['className'] as String? ?? '',
      subjects: subjects,
      overallAverage: (d['overallAverage'] as num?)?.toDouble(),
      position: d['position'] as int?,
      classSize: d['classSize'] as int?,
      headTeacherRemark: d['headTeacherRemark'] as String?,
      generatedAt: ts is Timestamp ? ts.toDate() : null,
    );
  }
}

/// Everything the Results screen needs for one child, in one round trip.
class ResultsData {
  final String term;
  final List<SubjectResult> subjects;
  final ReportCard? reportCard;
  /// Components with at least one published subject — drives the filter chips
  /// so a parent is never offered a tab that is empty.
  final Set<String> availableComponents;

  const ResultsData({
    required this.term,
    required this.subjects,
    required this.reportCard,
    required this.availableComponents,
  });

  static const empty = ResultsData(
    term: '', subjects: [], reportCard: null, availableComponents: {},
  );
}

class ResultsService {
  final FirebaseFirestore _firestore;
  ResultsService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  final _terms = AcademicTermService();

  Future<ResultsData> fetchResults(Student student) async {
    if (student.classId.isEmpty) return ResultsData.empty;

    final term = await _terms.currentTerm(student.schoolCode);
    if (term.isEmpty) return ResultsData.empty;

    final results = await Future.wait([
      _fetchPublishedSubjects(student, term),
      _fetchReportCard(student, term),
    ]);

    final subjects = results[0] as List<SubjectResult>;
    final available = <String>{};
    for (final s in subjects) {
      available.addAll(s.components.keys);
    }

    return ResultsData(
      term: term,
      subjects: subjects,
      reportCard: results[1] as ReportCard?,
      availableComponents: available,
    );
  }

  /// Per-subject, per-component scores — but ONLY from documents the teacher
  /// has published. An unpublished document is a working draft; showing it
  /// would mean a parent sees a mark before the teacher has finished entering
  /// the class.
  Future<List<SubjectResult>> _fetchPublishedSubjects(
      Student student, String term) async {
    final snap = await _firestore
        .collection('ca_marks')
        .where('schoolCode', isEqualTo: student.schoolCode)
        .where('classId', isEqualTo: student.classId)
        .where('term', isEqualTo: term)
        .get();

    // subject -> componentId -> score
    final bySubject = <String, Map<String, num>>{};

    for (final doc in snap.docs) {
      final data = doc.data();
      if (data['publishedAt'] == null) continue; // draft

      final component = (data['assessmentType'] as String?) ?? 'EndTerm';
      final marks = (data['marks'] as Map<String, dynamic>?) ?? {};
      final mine = marks[student.id];
      if (mine is! Map) continue;

      mine.forEach((subject, score) {
        if (score is num) {
          bySubject.putIfAbsent(subject as String, () => {})[component] = score;
        }
      });
    }

    final out = bySubject.entries
        .map((e) => SubjectResult(subject: e.key, components: e.value))
        .toList()
      ..sort((a, b) => a.subject.compareTo(b.subject));
    return out;
  }

  Future<ReportCard?> _fetchReportCard(Student student, String term) async {
    try {
      final snap = await _firestore
          .collection('report_cards')
          .doc(ReportCard.docId(student.schoolCode, student.id, term))
          .get();
      return snap.exists ? ReportCard.fromDoc(snap) : null;
    } catch (e) {
      // ignore: avoid_print
      print('[results] could not read report card: $e');
      return null;
    }
  }
}
