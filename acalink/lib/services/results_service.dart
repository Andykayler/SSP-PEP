import 'package:cloud_firestore/cloud_firestore.dart';

import '../core/api.dart';
import '../models/student.dart';

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

/// One grade on a school's scale: "A*", "B", or MANEB's "1".."9".
class Grade {
  final String label;
  final String remark;
  final String tone; // success | primary | warning | danger
  final bool pass;
  const Grade(this.label, this.remark, this.tone, this.pass);

  /// "G1" for MANEB's numbered grades, the grade itself otherwise.
  String get code => RegExp(r'^\d+$').hasMatch(label) ? 'G$label' : label;
}

class GradeBand {
  final String label;
  final num min;
  final String remark;
  final bool pass;
  const GradeBand(this.label, this.min, this.remark, this.pass);
}

/// The grading scale for the child's class — set by the school in the portal
/// (School Settings → Sections, Curriculum & Grading) and sent with the
/// results. Mirrors gradeFor/toneFor in src/services/curriculumCore.js.
class GradingScale {
  final String name;
  final List<GradeBand> bands; // highest first
  const GradingScale(this.name, this.bands);

  static const maneb = GradingScale('MANEB 1–9', [
    GradeBand('1', 80, 'Distinction', true),
    GradeBand('2', 70, 'Distinction', true),
    GradeBand('3', 65, 'Credit', true),
    GradeBand('4', 60, 'Credit', true),
    GradeBand('5', 55, 'Credit', true),
    GradeBand('6', 50, 'Credit', true),
    GradeBand('7', 45, 'Pass', true),
    GradeBand('8', 40, 'Pass', true),
    GradeBand('9', 0, 'Fail', false),
  ]);

  /// From the results endpoint's `grading`; MANEB when absent or malformed,
  /// which is what an older server (or an older school) means.
  factory GradingScale.fromJson(Object? raw) {
    if (raw is! Map) return maneb;
    final bands = <GradeBand>[];
    for (final b in (raw['bands'] as List?) ?? const []) {
      if (b is! Map || b['min'] is! num) continue;
      bands.add(GradeBand(
        '${b['label'] ?? ''}',
        b['min'] as num,
        '${b['remark'] ?? ''}',
        b['pass'] != false,
      ));
    }
    if (bands.length < 2) return maneb;
    bands.sort((a, b) => b.min.compareTo(a.min));
    return GradingScale('${raw['name'] ?? 'School scale'}', bands);
  }

  String _tone(int i) {
    final band = bands[i];
    if (!band.pass) return 'danger';
    final passing = bands.where((b) => b.pass).length;
    if (passing <= 1) return 'success';
    final pos = i / (passing - 1);
    if (pos < 0.34) return 'success';
    if (pos < 0.75) return 'primary';
    return 'warning';
  }

  Grade gradeFor(num score) {
    var i = bands.indexWhere((b) => score >= b.min);
    if (i == -1) i = bands.length - 1;
    final b = bands[i];
    return Grade(b.label, b.remark, _tone(i), b.pass);
  }
}

/// The grade for a score — on the child's school scale when given, MANEB otherwise.
Grade gradeFor(num score, [GradingScale scale = GradingScale.maneb]) => scale.gradeFor(score);

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

  /// Automatically generated summary of the term — marks, attendance and
  /// conduct read together. Written by the portal when the school has the AI
  /// insights module on, absent otherwise, so every read has to tolerate null.
  final String? insight;

  final DateTime? generatedAt;

  const ReportCard({
    required this.term,
    required this.className,
    required this.subjects,
    required this.overallAverage,
    required this.position,
    required this.classSize,
    required this.headTeacherRemark,
    required this.insight,
    required this.generatedAt,
  });

  static String docId(String schoolCode, String studentId, String term) =>
      '${schoolCode}__${studentId}__${term.replaceAll(RegExp(r'\s+'), '_')}';

  factory ReportCard.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) =>
      ReportCard.fromMap(doc.data() ?? {});

  /// From a Firestore document or the results endpoint's JSON (where
  /// `generatedAt` is an ISO string).
  factory ReportCard.fromMap(Map<String, dynamic> d) {
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
      position: (d['position'] as num?)?.toInt(),
      classSize: (d['classSize'] as num?)?.toInt(),
      headTeacherRemark: d['headTeacherRemark'] as String?,
      insight: d['insight'] as String?,
      generatedAt: ts is Timestamp
          ? ts.toDate()
          : (ts is String ? DateTime.tryParse(ts) : null),
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

  /// True when the school is holding this term's results back — usually
  /// because fees are owed and the bursar has not released them.
  final bool withheld;

  /// What to tell the family when [withheld] — written by the server.
  final String withheldMessage;

  /// How this child's class turns a mark into a grade.
  final GradingScale scale;

  const ResultsData({
    required this.term,
    required this.subjects,
    required this.reportCard,
    required this.availableComponents,
    this.withheld = false,
    this.withheldMessage = '',
    this.scale = GradingScale.maneb,
  });

  static const empty = ResultsData(
    term: '', subjects: [], reportCard: null, availableComponents: {},
  );
}

/// A child's results come from the server (api/parent/results.js), not from
/// Firestore: the school's mark sheets hold the whole class, and the server is
/// what withholds results from a family that owes fees unless the bursar has
/// released them. It returns only this child's marks.
class ResultsApi {
  final AcalinkApi _api;
  ResultsApi({AcalinkApi? api}) : _api = api ?? AcalinkApi();

  Future<Map<String, dynamic>> fetch(Student student) => _api.post(
        '/api/parent/results',
        {'studentId': student.id, 'phone': student.guardianPhone},
      );
}

class ResultsService {
  final ResultsApi _api;
  ResultsService({ResultsApi? api}) : _api = api ?? ResultsApi();

  Future<ResultsData> fetchResults(Student student) async {
    if (student.classId.isEmpty) return ResultsData.empty;

    final data = await _api.fetch(student);
    final term = (data['term'] as String?) ?? '';
    if (term.isEmpty) return ResultsData.empty;

    if (data['withheld'] == true) {
      return ResultsData(
        term: term,
        subjects: const [],
        reportCard: null,
        availableComponents: const {},
        withheld: true,
        withheldMessage: (data['message'] as String?) ?? '',
      );
    }

    final subjects = ((data['subjects'] as List?) ?? []).map((raw) {
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

    final available = <String>{};
    for (final s in subjects) {
      available.addAll(s.components.keys);
    }

    final card = data['reportCard'];
    return ResultsData(
      term: term,
      subjects: subjects,
      reportCard: card is Map ? ReportCard.fromMap(card.cast<String, dynamic>()) : null,
      availableComponents: available,
      scale: GradingScale.fromJson(data['grading']),
    );
  }
}
