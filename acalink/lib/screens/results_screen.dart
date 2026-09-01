import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/tokens.dart';
import '../services/results_service.dart';
import '../state/session_provider.dart';

/// Subject-by-subject results for the selected child.
///
/// Two distinct things live here, deliberately kept apart:
///
///  • **Subjects** — each assessment component appears as soon as the teacher
///    publishes it, filterable by component. This is the running picture.
///  • **Report card** — the combined, weighted term assessment, which only
///    exists once the head teacher has issued it. Until then the app says so
///    rather than showing a half-finished total as if it were final.
class ResultsScreen extends StatefulWidget {
  const ResultsScreen({super.key});

  @override
  State<ResultsScreen> createState() => _ResultsScreenState();
}

class _ResultsScreenState extends State<ResultsScreen> {
  final _service = ResultsService();
  Future<ResultsData>? _future;
  String _filter = 'ALL';
  String? _loadedFor;

  @override
  Widget build(BuildContext context) {
    final student = context.watch<SessionProvider>().selectedStudent;

    if (student != null && _loadedFor != student.id) {
      _loadedFor = student.id;
      _future = _service.fetchResults(student);
    }

    return Scaffold(
      backgroundColor: T.bg,
      appBar: AppBar(
        backgroundColor: T.heroBg,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Results',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: T.textPrimary)),
            if (student != null)
              Text(student.fullName,
                  style: const TextStyle(fontSize: 11.5, color: T.textMuted)),
          ],
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: T.border),
        ),
      ),
      body: FutureBuilder<ResultsData>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator(strokeWidth: 2.4));
          }
          final data = snap.data ?? ResultsData.empty;

          if (data.term.isEmpty) {
            return const _Empty(
              icon: Icons.event_busy_outlined,
              title: 'No term set',
              message: 'The school has not opened a term yet. Results appear here once it does.',
            );
          }
          if (data.subjects.isEmpty) {
            return _Empty(
              icon: Icons.hourglass_empty_rounded,
              title: 'Nothing published yet',
              message: 'Marks for ${data.term} appear here as each teacher publishes them.',
            );
          }

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
            children: [
              _TermBanner(term: data.term, reportCard: data.reportCard),
              const SizedBox(height: 14),
              _ComponentFilter(
                available: data.availableComponents,
                selected: _filter,
                onChange: (v) => setState(() => _filter = v),
              ),
              const SizedBox(height: 12),
              ...data.subjects.map((s) => _SubjectTile(result: s, filter: _filter)),
              if (data.reportCard != null) ...[
                const SizedBox(height: 20),
                _ReportCardPanel(card: data.reportCard!),
              ],
            ],
          );
        },
      ),
    );
  }
}

/// States the difference between "running marks" and "issued result" up front,
/// because that distinction is the whole point of this screen.
class _TermBanner extends StatelessWidget {
  final String term;
  final ReportCard? reportCard;
  const _TermBanner({required this.term, required this.reportCard});

  @override
  Widget build(BuildContext context) {
    final issued = reportCard != null;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: issued ? T.successPale : T.primaryPale,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: (issued ? T.success : T.primary).withValues(alpha: 0.25),
        ),
      ),
      child: Row(
        children: [
          Icon(issued ? Icons.verified_rounded : Icons.timelapse_rounded,
              size: 19, color: issued ? T.success : T.primary),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(term,
                    style: const TextStyle(
                        fontSize: 14, fontWeight: FontWeight.w700, color: T.textPrimary)),
                const SizedBox(height: 2),
                Text(
                  issued
                      ? 'Report card issued — the final assessment is below.'
                      : 'Marks so far this term. The final assessment appears when the school issues the report card.',
                  style: const TextStyle(fontSize: 12, color: T.textSecondary, height: 1.4),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ComponentFilter extends StatelessWidget {
  final Set<String> available;
  final String selected;
  final ValueChanged<String> onChange;

  const _ComponentFilter({
    required this.available,
    required this.selected,
    required this.onChange,
  });

  @override
  Widget build(BuildContext context) {
    // Only components with something published are offered, so no chip ever
    // leads to a blank list.
    final chips = <(String, String)>[
      ('ALL', 'All'),
      ...kComponents
          .where((c) => available.contains(c.id))
          .map((c) => (c.id, c.label)),
    ];

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final (value, label) in chips) ...[
            _Chip(
              label: label,
              selected: selected == value,
              onTap: () => onChange(value),
            ),
            const SizedBox(width: 7),
          ],
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _Chip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? T.primaryPale : T.cardBg,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: selected ? T.primary : T.border),
          ),
          child: Text(label,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: selected ? T.primaryDark : T.textSecondary,
              )),
        ),
      ),
    );
  }
}

Color _toneColor(String tone) {
  switch (tone) {
    case 'success':
      return T.success;
    case 'primary':
      return T.primary;
    case 'warning':
      return T.warning;
    default:
      return T.danger;
  }
}

class _GradePill extends StatelessWidget {
  final num score;
  const _GradePill({required this.score});

  @override
  Widget build(BuildContext context) {
    final g = gradeFor(score);
    final c = _toneColor(g.tone);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text('${score % 1 == 0 ? score.toInt() : score}  ·  G${g.grade}',
          style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: c)),
    );
  }
}

class _SubjectTile extends StatelessWidget {
  final SubjectResult result;
  final String filter;
  const _SubjectTile({required this.result, required this.filter});

  @override
  Widget build(BuildContext context) {
    // Filtering to one component hides subjects that component has no mark for,
    // rather than showing an empty row.
    if (filter != 'ALL' && !result.hasComponent(filter)) return const SizedBox.shrink();

    final showing = filter == 'ALL'
        ? kComponents.where((c) => result.hasComponent(c.id)).toList()
        : kComponents.where((c) => c.id == filter).toList();

    final weighted = result.weighted;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: T.cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: T.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(result.subject,
                    style: const TextStyle(
                        fontSize: 14, fontWeight: FontWeight.w600, color: T.textPrimary)),
              ),
              if (filter == 'ALL' && weighted != null) _GradePill(score: weighted),
            ],
          ),
          if (filter == 'ALL' && weighted != null && !result.complete)
            const Padding(
              padding: EdgeInsets.only(top: 3),
              child: Text('Provisional — not all components published',
                  style: TextStyle(fontSize: 10.5, color: T.textMuted)),
            ),
          const SizedBox(height: 10),
          ...showing.map((c) {
            final score = result.components[c.id]!;
            final g = gradeFor(score);
            return Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  SizedBox(
                    width: 84,
                    child: Text(c.label,
                        style: const TextStyle(fontSize: 12, color: T.textSecondary)),
                  ),
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: (score / 100).clamp(0, 1).toDouble(),
                        minHeight: 6,
                        backgroundColor: T.bg,
                        valueColor: AlwaysStoppedAnimation(_toneColor(g.tone)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  SizedBox(
                    width: 62,
                    child: Text('${score % 1 == 0 ? score.toInt() : score} · G${g.grade}',
                        textAlign: TextAlign.right,
                        style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w600,
                            color: _toneColor(g.tone))),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}

class _ReportCardPanel extends StatelessWidget {
  final ReportCard card;
  const _ReportCardPanel({required this.card});

  @override
  Widget build(BuildContext context) {
    final avg = card.overallAverage;
    final g = avg == null ? null : gradeFor(avg);

    return Container(
      decoration: BoxDecoration(
        color: T.cardBg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: T.success.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(15),
            decoration: BoxDecoration(
              color: T.successPale,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(15)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.workspace_premium_rounded, size: 18, color: T.success),
                    const SizedBox(width: 8),
                    Text('Report card · ${card.term}',
                        style: const TextStyle(
                            fontSize: 14, fontWeight: FontWeight.w700, color: T.textPrimary)),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    _Stat(
                      label: 'Overall',
                      value: avg == null ? '—' : avg.toStringAsFixed(1),
                      sub: g == null ? '' : 'Grade ${g.grade} · ${g.remark}',
                    ),
                    if (card.position != null)
                      _Stat(
                        label: 'Position',
                        value: '${card.position}',
                        sub: card.classSize == null ? '' : 'of ${card.classSize}',
                      ),
                  ],
                ),
              ],
            ),
          ),
          if (card.headTeacherRemark != null && card.headTeacherRemark!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(15, 13, 15, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text("HEAD TEACHER'S REMARK",
                      style: TextStyle(
                          fontSize: 9.5,
                          letterSpacing: 1.4,
                          fontWeight: FontWeight.w700,
                          color: T.textMuted)),
                  const SizedBox(height: 4),
                  Text(card.headTeacherRemark!,
                      style: const TextStyle(
                          fontSize: 12.5, color: T.textSecondary, height: 1.5)),
                ],
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(15),
            child: Column(
              children: card.subjects.map((s) {
                final w = s.weighted;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(s.subject,
                            style: const TextStyle(fontSize: 12.5, color: T.textPrimary)),
                      ),
                      if (w != null) _GradePill(score: w),
                    ],
                  ),
                );
              }).toList(),
            ),
          ),
          if (card.generatedAt != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(15, 0, 15, 13),
              child: Text(
                'Issued ${card.generatedAt!.day}/${card.generatedAt!.month}/${card.generatedAt!.year}',
                style: const TextStyle(fontSize: 10.5, color: T.textMuted),
              ),
            ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String label;
  final String value;
  final String sub;
  const _Stat({required this.label, required this.value, required this.sub});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(),
              style: const TextStyle(
                  fontSize: 9.5, letterSpacing: 1.3, fontWeight: FontWeight.w700, color: T.textMuted)),
          const SizedBox(height: 2),
          Text(value,
              style: const TextStyle(
                  fontSize: 24, fontWeight: FontWeight.w700, color: T.textPrimary, height: 1.1)),
          if (sub.isNotEmpty)
            Text(sub, style: const TextStyle(fontSize: 11, color: T.textSecondary)),
        ],
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;
  const _Empty({required this.icon, required this.title, required this.message});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 62,
              height: 62,
              decoration: BoxDecoration(
                color: T.primaryPale,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Icon(icon, size: 28, color: T.primary),
            ),
            const SizedBox(height: 14),
            Text(title,
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w600, color: T.textPrimary)),
            const SizedBox(height: 5),
            Text(message,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 13, color: T.textMuted, height: 1.5)),
          ],
        ),
      ),
    );
  }
}
