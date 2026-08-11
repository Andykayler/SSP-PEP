import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/student.dart';
import '../state/session_provider.dart';
import 'student_select_screen.dart';
import 'fees_screen.dart';

/// ─── Design tokens — mirrors StudentSelectScreen's _T. TODO: extract to a
/// shared lib/theme/app_theme.dart once a third screen needs these. ───────
class _T {
  static const bg = Color(0xFFF8F6F0);
  static const heroBg = Color(0xFFFFFFFF);
  static const cardBg = Color(0xFFFFFFFF);
  static const cardBgHover = Color(0xFFF3F0E8);
  static const border = Color(0xFFE3DFD3);
  static const borderStrong = Color(0xFFCDC7B5);

  static const textPrimary = Color(0xFF1E2A44);
  static const textSecondary = Color(0xFF5B6478);
  static const textMuted = Color(0xFF95978F);

  static const primary = Color(0xFF4F6EF7);
  static const primaryLight = Color(0xFF3454E0);
  static const primaryPale = Color(0x144F6EF7);

  static const navyStart = Color(0xFF2D3A5E);
  static const navyEnd = Color(0xFF3D4F7A);

  static const warning = Color(0xFFC47D0E);
  static const warningPale = Color(0x1AE8A800);

  static const success = Color(0xFF2E9E5B);
  static const successPale = Color(0x142E9E5B);

  static const danger = Color(0xFFC4453D);
  static const dangerPale = Color(0x14C4453D);

  static const fontMono = 'monospace';
  static const fontDisplay = null;
}

/// ─── Screen ────────────────────────────────────────────────────────────
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() =>
      _HomeShellState();
}

class _HomeShellState extends State<HomeShell>
    with SingleTickerProviderStateMixin {
  late final AnimationController _shimmer;

  // TEMP — design-review toggle only. Remove once real data replaces the
  // mock lists below and loading state comes from a provider instead.
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _shimmer = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _shimmer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionProvider>();
    final student = session.selectedStudent;

    return Scaffold(
      backgroundColor: _T.bg,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => setState(() => _loading = !_loading),
        backgroundColor: _T.navyStart,
        icon: Icon(_loading ? Icons.visibility_rounded : Icons.blur_on_rounded,
            size: 18),
        label: Text(
          _loading ? 'Show data' : 'Preview loading',
          style: const TextStyle(fontSize: 12),
        ),
      ),
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: _DashboardHero(
                student: student,
                onSwitchChild: () {
                  session.openStudentSwitcher();
                  Navigator.of(context).pushReplacement(
                    MaterialPageRoute(
                        builder: (_) => const StudentSelectScreen()),
                  );
                },
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              sliver: SliverToBoxAdapter(
                child: _loading
                    ? _StatsRowSkeleton(shimmer: _shimmer)
                    : _StatsRow(
                        onTapFees: () => _openFees(context, student),
                      ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
              sliver: SliverToBoxAdapter(
                child: _QuickActionsGrid(
                  onAction: (label) {
                    if (label == 'Fees') _openFees(context, student);
                  },
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
              sliver: SliverToBoxAdapter(
                child: _loading
                    ? _SkeletonCard(
                        shimmer: _shimmer, rows: 5, title: 'Recent Grades')
                    : const _RecentGradesCard(),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
              sliver: SliverToBoxAdapter(
                child: _loading
                    ? _SkeletonCard(
                        shimmer: _shimmer, rows: 3, title: 'Upcoming')
                    : const _UpcomingList(),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
              sliver: SliverToBoxAdapter(
                child: _loading
                    ? _SkeletonCard(
                        shimmer: _shimmer, rows: 3, title: 'Announcements')
                    : const _AnnouncementsCard(),
              ),
            ),
            const SliverToBoxAdapter(child: _Footer()),
          ],
        ),
      ),
    );
  }

  void _openFees(BuildContext context, Student? student) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => FeesScreen(student: student, guardianName: '',)),
    );
  }
}

/// ─── Hero ──────────────────────────────────────────────────────────────
class _DashboardHero extends StatelessWidget {
  final Student? student;
  final VoidCallback onSwitchChild;

  const _DashboardHero({required this.student, required this.onSwitchChild});

  @override
  Widget build(BuildContext context) {
    final name = student?.fullName ?? 'Student';
    final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';
    final subtitle =
        student == null ? '' : '${student!.className} · ${student!.schoolName}';

    return Container(
      margin: const EdgeInsets.fromLTRB(20, 16, 20, 12),
      padding: const EdgeInsets.fromLTRB(22, 22, 22, 22),
      decoration: BoxDecoration(
        color: _T.heroBg,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: _T.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [_T.navyStart, _T.navyEnd],
              ),
              borderRadius: BorderRadius.circular(14),
            ),
            alignment: Alignment.center,
            child: Text(
              initial,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(width: 14, height: 1, color: _T.warning),
                    const SizedBox(width: 7),
                    const Text(
                      'TERM 2 · 2026',
                      style: TextStyle(
                        fontFamily: _T.fontMono,
                        fontSize: 9,
                        letterSpacing: 2.4,
                        fontWeight: FontWeight.w600,
                        color: _T.textMuted,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  name,
                  style: const TextStyle(
                    fontFamily: _T.fontDisplay,
                    fontSize: 21,
                    fontWeight: FontWeight.w600,
                    color: _T.textPrimary,
                    height: 1.1,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (subtitle.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    subtitle,
                    style: const TextStyle(fontSize: 12.5, color: _T.textSecondary),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          _IconPillButton(
              icon: Icons.notifications_none_rounded, badge: true, onTap: () {}),
          const SizedBox(width: 8),
          _IconPillButton(
              icon: Icons.swap_horiz_rounded, badge: false, onTap: onSwitchChild),
        ],
      ),
    );
  }
}

class _IconPillButton extends StatelessWidget {
  final IconData icon;
  final bool badge;
  final VoidCallback onTap;

  const _IconPillButton(
      {required this.icon, required this.badge, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: _T.bg,
            border: Border.all(color: _T.border),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Stack(
            alignment: Alignment.center,
            children: [
              Icon(icon, size: 18, color: _T.textSecondary),
              if (badge)
                Positioned(
                  top: 8,
                  right: 9,
                  child: Container(
                    width: 7,
                    height: 7,
                    decoration:
                        const BoxDecoration(color: _T.danger, shape: BoxShape.circle),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// ─── Stats row (attendance / rank / fees / discipline) ───────────────────
class _StatsRow extends StatelessWidget {
  final VoidCallback onTapFees;
  const _StatsRow({required this.onTapFees});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          children: const [
            Expanded(
              child: _StatCard(
                icon: Icons.event_available_rounded,
                iconColor: _T.success,
                iconBg: _T.successPale,
                label: 'ATTENDANCE',
                value: '94%',
                subtitle: 'Present this term',
              ),
            ),
            SizedBox(width: 12),
            Expanded(
              child: _StatCard(
                icon: Icons.leaderboard_rounded,
                iconColor: _T.primaryLight,
                iconBg: _T.primaryPale,
                label: 'CLASS RANK',
                value: '4th',
                subtitle: 'of 38 · Avg B+',
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _StatCard(
                icon: Icons.account_balance_wallet_rounded,
                iconColor: _T.warning,
                iconBg: _T.warningPale,
                label: 'FEE BALANCE',
                value: 'MK 45,000',
                subtitle: 'Due 5 Aug 2026',
                onTap: onTapFees,
              ),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: _StatCard(
                icon: Icons.shield_moon_rounded,
                iconColor: _T.success,
                iconBg: _T.successPale,
                label: 'DISCIPLINE',
                value: '0',
                subtitle: 'Open cases',
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final Color iconBg;
  final String label;
  final String value;
  final String subtitle;
  final VoidCallback? onTap;

  const _StatCard({
    required this.icon,
    required this.iconColor,
    required this.iconBg,
    required this.label,
    required this.value,
    required this.subtitle,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final card = Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _T.cardBg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _T.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                    color: iconBg, borderRadius: BorderRadius.circular(9)),
                alignment: Alignment.center,
                child: Icon(icon, size: 16, color: iconColor),
              ),
              if (onTap != null)
                const Icon(Icons.chevron_right_rounded, size: 16, color: _T.textMuted),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            label,
            style: const TextStyle(
              fontFamily: _T.fontMono,
              fontSize: 9,
              letterSpacing: 1.6,
              fontWeight: FontWeight.w600,
              color: _T.textMuted,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            value,
            style: const TextStyle(
                fontSize: 19, fontWeight: FontWeight.w600, color: _T.textPrimary),
          ),
          const SizedBox(height: 2),
          Text(subtitle, style: const TextStyle(fontSize: 11, color: _T.textSecondary)),
        ],
      ),
    );

    if (onTap == null) return card;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        hoverColor: _T.cardBgHover,
        child: card,
      ),
    );
  }
}

/// ─── Quick actions ─────────────────────────────────────────────────────
class _QuickAction {
  final String label;
  final IconData icon;
  const _QuickAction(this.label, this.icon);
}

const _quickActions = [
  _QuickAction('Grades', Icons.grade_rounded),
  _QuickAction('Attendance', Icons.event_available_rounded),
  _QuickAction('Homework', Icons.menu_book_rounded),
  _QuickAction('Fees', Icons.account_balance_wallet_rounded),
  _QuickAction('Messages', Icons.chat_bubble_outline_rounded),
  _QuickAction('Announcements', Icons.campaign_outlined),
];

class _QuickActionsGrid extends StatelessWidget {
  final ValueChanged<String> onAction;
  const _QuickActionsGrid({required this.onAction});

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 3,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 1.02,
      children: _quickActions
          .map((a) => _QuickActionTile(
                label: a.label,
                icon: a.icon,
                onTap: () => onAction(a.label),
              ))
          .toList(),
    );
  }
}

class _QuickActionTile extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  const _QuickActionTile({required this.label, required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap, // TODO: wire up remaining routes as each module ships
        borderRadius: BorderRadius.circular(16),
        hoverColor: _T.cardBgHover,
        child: Container(
          decoration: BoxDecoration(
            color: _T.cardBg,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: _T.border),
          ),
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                    color: _T.primaryPale, borderRadius: BorderRadius.circular(10)),
                alignment: Alignment.center,
                child: Icon(icon, size: 17, color: _T.primaryLight),
              ),
              const SizedBox(height: 8),
              Text(
                label,
                style: const TextStyle(
                    fontSize: 11, fontWeight: FontWeight.w500, color: _T.textPrimary),
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// ─── Shared section header ────────────────────────────────────────────
class _SectionHeader extends StatelessWidget {
  final String title;
  final VoidCallback? onSeeAll;
  const _SectionHeader({required this.title, this.onSeeAll});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10, left: 2, right: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontFamily: _T.fontDisplay,
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: _T.textPrimary,
            ),
          ),
          if (onSeeAll != null)
            GestureDetector(
              onTap: onSeeAll,
              child: const Text(
                'See all',
                style:
                    TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: _T.primaryLight),
              ),
            ),
        ],
      ),
    );
  }
}

/// ─── Recent grades ─────────────────────────────────────────────────────
class _MockGrade {
  final String subject;
  final String grade;
  final int score;
  const _MockGrade(this.subject, this.grade, this.score);
}

const _mockGrades = [
  _MockGrade('Mathematics', 'A', 88),
  _MockGrade('English', 'B+', 76),
  _MockGrade('Biology', 'A-', 82),
  _MockGrade('Chichewa', 'B', 71),
  _MockGrade('Physical Science', 'C+', 63),
];

Color _gradeColor(String grade) {
  if (grade.startsWith('A')) return _T.success;
  if (grade.startsWith('B')) return _T.primaryLight;
  if (grade.startsWith('C')) return _T.warning;
  return _T.danger;
}

Color _gradeColorPale(String grade) {
  if (grade.startsWith('A')) return _T.successPale;
  if (grade.startsWith('B')) return _T.primaryPale;
  if (grade.startsWith('C')) return _T.warningPale;
  return _T.dangerPale;
}

class _RecentGradesCard extends StatelessWidget {
  const _RecentGradesCard();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(title: 'Recent Grades', onSeeAll: () {}),
        Container(
          decoration: BoxDecoration(
            color: _T.cardBg,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: _T.border),
          ),
          child: Column(
            children: [
              for (int i = 0; i < _mockGrades.length; i++) ...[
                _GradeRow(grade: _mockGrades[i]),
                if (i != _mockGrades.length - 1)
                  const Divider(height: 1, color: _T.border, indent: 16, endIndent: 16),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _GradeRow extends StatelessWidget {
  final _MockGrade grade;
  const _GradeRow({required this.grade});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: Text(
              grade.subject,
              style: const TextStyle(
                  fontSize: 13.5, fontWeight: FontWeight.w500, color: _T.textPrimary),
            ),
          ),
          Text('${grade.score}%',
              style: const TextStyle(fontSize: 12.5, color: _T.textSecondary)),
          const SizedBox(width: 10),
          Container(
            width: 34,
            padding: const EdgeInsets.symmetric(vertical: 4),
            decoration: BoxDecoration(
              color: _gradeColorPale(grade.grade),
              borderRadius: BorderRadius.circular(8),
            ),
            alignment: Alignment.center,
            child: Text(
              grade.grade,
              style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                  color: _gradeColor(grade.grade)),
            ),
          ),
        ],
      ),
    );
  }
}

/// ─── Upcoming (homework & deadlines) ──────────────────────────────────
enum _DueStatus { overdue, soon, upcoming }

class _MockTask {
  final String title;
  final String subject;
  final String due;
  final _DueStatus status;
  const _MockTask(this.title, this.subject, this.due, this.status);
}

const _mockTasks = [
  _MockTask('Algebra worksheet 4', 'Mathematics', 'Overdue by 1 day', _DueStatus.overdue),
  _MockTask('Essay: Rainy Season', 'English', 'Due tomorrow', _DueStatus.soon),
  _MockTask('Lab report — Osmosis', 'Biology', 'Due in 5 days', _DueStatus.upcoming),
];

class _DueStyle {
  final Color color;
  final Color bg;
  final String label;
  const _DueStyle(this.color, this.bg, this.label);
}

const _dueStyles = {
  _DueStatus.overdue: _DueStyle(_T.danger, _T.dangerPale, 'OVERDUE'),
  _DueStatus.soon: _DueStyle(_T.warning, _T.warningPale, 'DUE SOON'),
  _DueStatus.upcoming: _DueStyle(_T.textSecondary, _T.bg, 'UPCOMING'),
};

class _UpcomingList extends StatelessWidget {
  const _UpcomingList();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(title: 'Upcoming', onSeeAll: () {}),
        Container(
          decoration: BoxDecoration(
            color: _T.cardBg,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: _T.border),
          ),
          child: Column(
            children: [
              for (int i = 0; i < _mockTasks.length; i++) ...[
                _TaskRow(task: _mockTasks[i]),
                if (i != _mockTasks.length - 1)
                  const Divider(height: 1, color: _T.border, indent: 16, endIndent: 16),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _TaskRow extends StatelessWidget {
  final _MockTask task;
  const _TaskRow({required this.task});

  @override
  Widget build(BuildContext context) {
    final style = _dueStyles[task.status]!;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(task.title,
                    style: const TextStyle(
                        fontSize: 13.5, fontWeight: FontWeight.w500, color: _T.textPrimary)),
                const SizedBox(height: 2),
                Text('${task.subject} · ${task.due}',
                    style: const TextStyle(fontSize: 11.5, color: _T.textMuted)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
            decoration:
                BoxDecoration(color: style.bg, borderRadius: BorderRadius.circular(7)),
            child: Text(
              style.label,
              style: TextStyle(
                fontFamily: _T.fontMono,
                fontSize: 8.5,
                letterSpacing: 0.6,
                fontWeight: FontWeight.w700,
                color: style.color,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// ─── Announcements ──────────────────────────────────────────────────────
class _MockAnnouncement {
  final String title;
  final String time;
  final bool unread;
  const _MockAnnouncement(this.title, this.time, this.unread);
}

const _mockAnnouncements = [
  _MockAnnouncement('Mid-term exams begin 4 August', '2h ago', true),
  _MockAnnouncement('Sports day rescheduled', '1d ago', false),
  _MockAnnouncement('Parent-teacher meeting Friday', '3d ago', false),
];

class _AnnouncementsCard extends StatelessWidget {
  const _AnnouncementsCard();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(title: 'Announcements', onSeeAll: () {}),
        Container(
          decoration: BoxDecoration(
            color: _T.cardBg,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: _T.border),
          ),
          child: Column(
            children: [
              for (int i = 0; i < _mockAnnouncements.length; i++) ...[
                _AnnouncementRow(item: _mockAnnouncements[i]),
                if (i != _mockAnnouncements.length - 1)
                  const Divider(height: 1, color: _T.border, indent: 16, endIndent: 16),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _AnnouncementRow extends StatelessWidget {
  final _MockAnnouncement item;
  const _AnnouncementRow({required this.item});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 5),
            child: Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(
                color: item.unread ? _T.primary : Colors.transparent,
                shape: BoxShape.circle,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              item.title,
              style: TextStyle(
                fontSize: 13,
                fontWeight: item.unread ? FontWeight.w600 : FontWeight.w400,
                color: _T.textPrimary,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(item.time, style: const TextStyle(fontSize: 11, color: _T.textMuted)),
        ],
      ),
    );
  }
}

/// ─── Skeleton loaders (Facebook/LinkedIn-style, no spinners) ─────────────
class _Shimmer extends StatelessWidget {
  final Animation<double> controller;
  final double width;
  final double height;
  final double radius;

  const _Shimmer({
    required this.controller,
    required this.width,
    required this.height,
    this.radius = 8,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        return Container(
          width: width,
          height: height,
          decoration: BoxDecoration(
            color: Color.lerp(_T.border, _T.cardBgHover, controller.value),
            borderRadius: BorderRadius.circular(radius),
          ),
        );
      },
    );
  }
}

class _StatsRowSkeleton extends StatelessWidget {
  final Animation<double> shimmer;
  const _StatsRowSkeleton({required this.shimmer});

  Widget _card() => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: _T.cardBg,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: _T.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _Shimmer(controller: shimmer, width: 32, height: 32, radius: 9),
            const SizedBox(height: 12),
            _Shimmer(controller: shimmer, width: 60, height: 8, radius: 4),
            const SizedBox(height: 8),
            _Shimmer(controller: shimmer, width: 70, height: 16, radius: 4),
            const SizedBox(height: 6),
            _Shimmer(controller: shimmer, width: 90, height: 10, radius: 4),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(children: [Expanded(child: _card()), const SizedBox(width: 12), Expanded(child: _card())]),
        const SizedBox(height: 12),
        Row(children: [Expanded(child: _card()), const SizedBox(width: 12), Expanded(child: _card())]),
      ],
    );
  }
}

class _SkeletonCard extends StatelessWidget {
  final Animation<double> shimmer;
  final int rows;
  final String title;

  const _SkeletonCard({required this.shimmer, required this.rows, required this.title});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(title: title),
        Container(
          decoration: BoxDecoration(
            color: _T.cardBg,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: _T.border),
          ),
          child: Column(
            children: [
              for (int i = 0; i < rows; i++) ...[
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _Shimmer(controller: shimmer, width: 140, height: 11, radius: 4),
                            const SizedBox(height: 6),
                            _Shimmer(controller: shimmer, width: 90, height: 9, radius: 4),
                          ],
                        ),
                      ),
                      _Shimmer(controller: shimmer, width: 34, height: 18, radius: 7),
                    ],
                  ),
                ),
                if (i != rows - 1)
                  const Divider(height: 1, color: _T.border, indent: 16, endIndent: 16),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// ─── Footer ────────────────────────────────────────────────────────────
class _Footer extends StatelessWidget {
  const _Footer();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            '© 2026 SSP-PEP · Ministry of Education, Malawi',
            style: TextStyle(
              fontFamily: _T.fontMono,
              fontSize: 9,
              letterSpacing: 0.5,
              color: _T.textMuted.withOpacity(0.8),
            ),
          ),
          Text(
            'v1.4.1',
            style: TextStyle(
              fontFamily: _T.fontMono,
              fontSize: 9,
              letterSpacing: 0.5,
              color: _T.textMuted.withOpacity(0.8),
            ),
          ),
        ],
      ),
    );
  }
}